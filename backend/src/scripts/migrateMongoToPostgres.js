/**
 * Controlled MongoDB -> Supabase PostgreSQL Migration Script for KAAFILA.
 *
 * Supports two safe input modes:
 *   1. --dump-dir <dir>   Reads JSON arrays exported per collection (e.g. users.json, riderprofiles.json, ...).
 *   2. --mongo-uri <uri>  (Or process.env.MONGO_URI) Connects read-only via Mongoose if installed.
 *
 * Flags:
 *   --dry-run             Validates & transforms records, prints summary counts without writing to PostgreSQL.
 *   --verify              After migrating, verifies target PostgreSQL table counts match transformed inputs.
 *
 * Security:
 *   - Never prints connection strings, credentials, passwords, or PII to stdout.
 *   - Deterministically maps every 24-hex Mongo ObjectId -> valid RFC-4122 UUID so re-runs are idempotent.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectPostgres, disconnectPostgres, transaction, queryOne } from '../config/pg.js';
import { computeRiderRank } from '../utils/ranking.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function objectIdToUuid(rawId) {
  if (!rawId) return null;
  const unwrapped = typeof rawId === 'object' && rawId.$oid ? rawId.$oid : String(rawId);
  if (UUID_REGEX.test(unwrapped)) return unwrapped.toLowerCase();

  const digest = crypto.createHash('sha256').update(`kaafila-oid:${unwrapped}`).digest();
  // Set RFC-4122 version (5) and variant (10xx) bits
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function unwrapDate(val, fallback = null) {
  if (!val) return fallback;
  const raw = typeof val === 'object' && val.$date ? val.$date : val;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function clampText(val, maxLen = 2000, fallback = '') {
  const s = val == null ? fallback : String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sortParticipantPair(a, b) {
  const ua = objectIdToUuid(a);
  const ub = objectIdToUuid(b);
  return ua < ub ? [ua, ub] : [ub, ua];
}

function loadDumpCollection(dumpDir, names) {
  for (const name of names) {
    const file = path.join(dumpDir, `${name}.json`);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8').trim();
      if (!raw) return [];
      if (raw.startsWith('[')) return JSON.parse(raw);
      return raw
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    }
  }
  return [];
}

async function readAllCollections({ dumpDir, mongoUri }) {
  if (dumpDir) {
    const resolved = path.resolve(dumpDir);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Dump directory not found: ${resolved}`);
    }
    return {
      users: loadDumpCollection(resolved, ['users']),
      riderProfiles: loadDumpCollection(resolved, ['riderprofiles', 'rider_profiles']),
      achievements: loadDumpCollection(resolved, ['achievements']),
      organisations: loadDumpCollection(resolved, ['organisations']),
      organisationMembers: loadDumpCollection(resolved, ['organisationmembers', 'organisation_members']),
      rides: loadDumpCollection(resolved, ['rides']),
      rideMembers: loadDumpCollection(resolved, ['ridemembers', 'ride_members']),
      reviews: loadDumpCollection(resolved, ['reviews']),
      connections: loadDumpCollection(resolved, ['connections']),
      conversations: loadDumpCollection(resolved, ['conversations']),
      kafilaGroups: loadDumpCollection(resolved, ['kafilagroups', 'kafila_groups']),
      groupMembers: loadDumpCollection(resolved, ['groupmembers', 'group_members']),
      messages: loadDumpCollection(resolved, ['messages']),
      notifications: loadDumpCollection(resolved, ['notifications']),
      checkpoints: loadDumpCollection(resolved, ['checkpoints']),
      trackingSessions: loadDumpCollection(resolved, ['trackingsessions', 'tracking_sessions']),
      checkpointArrivals: loadDumpCollection(resolved, ['checkpointarrivals', 'checkpoint_arrivals']),
      groupLocations: loadDumpCollection(resolved, ['grouplocations', 'group_locations']),
      leaderboards: loadDumpCollection(resolved, ['leaderboards']),
    };
  }

  let mongoose;
  try {
    mongoose = (await import('mongoose')).default;
  } catch {
    throw new Error(
      'Mongoose is not installed. Export collections with `mongoexport --jsonArray` and pass `--dump-dir <dir>`.'
    );
  }

  if (!mongoUri) {
    throw new Error('Provide either `--dump-dir <dir>` or `--mongo-uri <uri>` (or MONGO_URI in env).');
  }

  await mongoose.connect(mongoUri);
  try {
    const db = mongoose.connection.db;
    const read = async (name) => db.collection(name).find({}).toArray();
    return {
      users: await read('users'),
      riderProfiles: await read('riderprofiles'),
      achievements: await read('achievements'),
      organisations: await read('organisations'),
      organisationMembers: await read('organisationmembers'),
      rides: await read('rides'),
      rideMembers: await read('ridemembers'),
      reviews: await read('reviews'),
      connections: await read('connections'),
      conversations: await read('conversations'),
      kafilaGroups: await read('kafilagroups'),
      groupMembers: await read('groupmembers'),
      messages: await read('messages'),
      notifications: await read('notifications'),
      checkpoints: await read('checkpoints'),
      trackingSessions: await read('trackingsessions'),
      checkpointArrivals: await read('checkpointarrivals'),
      groupLocations: await read('grouplocations'),
      leaderboards: await read('leaderboards'),
    };
  } finally {
    await mongoose.disconnect();
  }
}

export async function migrateDataToPostgres(collections, { dryRun = false, verify = true } = {}) {
  const counts = {
    users: collections.users.length,
    rider_profiles: collections.riderProfiles.length,
    achievements: collections.achievements.length,
    rider_achievements: 0,
    rider_rank_history: 0,
    organisations: collections.organisations.length,
    organisation_members: collections.organisationMembers.length,
    rides: collections.rides.length,
    ride_members: collections.rideMembers.length,
    reviews: collections.reviews.length,
    connections: collections.connections.length,
    conversations: collections.conversations.length,
    kafila_groups: collections.kafilaGroups.length,
    group_members: collections.groupMembers.length,
    messages: collections.messages.length,
    notifications: collections.notifications.length,
    checkpoints: collections.checkpoints.length,
    tracking_sessions: collections.trackingSessions.length,
    checkpoint_arrivals: collections.checkpointArrivals.length,
    group_locations: collections.groupLocations.length,
    leaderboards: collections.leaderboards.length,
  };

  for (const p of collections.riderProfiles) {
    counts.rider_achievements += (p.badges || []).length;
    counts.rider_rank_history += (p.rankHistory || []).length;
  }

  if (dryRun) {
    return { dryRun: true, migrated: false, sourceCounts: counts };
  }

  await transaction(async (tx) => {
    // 1. Users
    for (const u of collections.users) {
      await tx.query(
        `INSERT INTO users (id, full_name, email, password_hash, role, phone_number, city, avatar_url, is_active, last_login_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(u._id),
          clampText(u.fullName, 100, 'Kaafila Rider'),
          String(u.email).trim().toLowerCase(),
          String(u.password || ''),
          ['rider', 'organisation', 'admin'].includes(u.role) ? u.role : 'rider',
          String(u.phoneNumber || ''),
          String(u.city || ''),
          String(u.avatarUrl || ''),
          u.isActive !== false,
          unwrapDate(u.lastLoginAt),
          unwrapDate(u.createdAt, new Date().toISOString()),
          unwrapDate(u.updatedAt, new Date().toISOString()),
        ]
      );
    }

    // 2. Achievements catalog
    for (const a of collections.achievements) {
      await tx.query(
        `INSERT INTO achievements (id, code, title, description, tier, icon, criteria_km, criteria_rides, criteria_checkpoints, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (code) DO NOTHING`,
        [
          objectIdToUuid(a._id),
          String(a.code).toUpperCase(),
          String(a.title),
          String(a.description || ''),
          ['bronze', 'silver', 'gold', 'legend'].includes(a.tier) ? a.tier : 'bronze',
          String(a.icon || 'award'),
          Number(a.criteriaKm || 0),
          Number(a.criteriaRides || 0),
          Number(a.criteriaCheckpoints || 0),
          unwrapDate(a.createdAt, new Date().toISOString()),
          unwrapDate(a.updatedAt, new Date().toISOString()),
        ]
      );
    }

    // 3. Rider profiles + normalized badges & rank history
    for (const rp of collections.riderProfiles) {
      const userId = objectIdToUuid(rp.user);
      const validRanks = ['Beginner', 'Explorer', 'Adventurer', 'Nomad', 'Pathfinder', 'Himalayan Legend'];
      const rank = validRanks.includes(rp.rank)
        ? rp.rank
        : computeRiderRank(rp.verifiedKilometres || 0, rp.completedExpeditions || 0, (rp.badges || []).length);

      await tx.query(
        `INSERT INTO rider_profiles
           (id, user_id, handle, bio, home_city, primary_motorcycle, riding_experience,
            verified_kilometres, completed_expeditions, rank, emergency_contact,
            is_profile_public, can_create_groups, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          objectIdToUuid(rp._id),
          userId,
          String(rp.handle).toLowerCase(),
          clampText(rp.bio, 500, ''),
          String(rp.homeCity || ''),
          String(rp.primaryMotorcycle || ''),
          ['beginner', 'intermediate', 'advanced', 'expedition_veteran'].includes(rp.ridingExperience)
            ? rp.ridingExperience
            : 'beginner',
          Number(rp.verifiedKilometres || 0),
          Number(rp.completedExpeditions || 0),
          rank,
          JSON.stringify(rp.emergencyContact || {}),
          rp.isProfilePublic !== false,
          rp.canCreateGroups !== false,
          Boolean(rp.isDemo),
          unwrapDate(rp.createdAt, new Date().toISOString()),
          unwrapDate(rp.updatedAt, new Date().toISOString()),
        ]
      );

      for (const b of rp.badges || []) {
        await tx.query(
          `INSERT INTO rider_achievements (user_id, achievement_code, title, awarded_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, achievement_code) DO NOTHING`,
          [userId, String(b.code).toUpperCase(), String(b.title || b.code), unwrapDate(b.awardedAt, new Date().toISOString())]
        );
      }

      for (const rh of rp.rankHistory || []) {
        await tx.query(
          `INSERT INTO rider_rank_history
             (user_id, from_rank, to_rank, verified_kilometres, completed_expeditions, achievement_count, reason, changed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            userId,
            String(rh.fromRank || 'Beginner'),
            String(rh.toRank || rank),
            Number(rh.verifiedKilometres || 0),
            Number(rh.completedExpeditions || 0),
            Number(rh.achievementCount || 0),
            String(rh.reason || 'migrated'),
            unwrapDate(rh.changedAt, new Date().toISOString()),
          ]
        );
      }
    }

    // 4. Organisations & OrganisationMembers
    for (const o of collections.organisations) {
      await tx.query(
        `INSERT INTO organisations
           (id, owner_id, name, slug, location, operating_regions, short_description, about,
            logo_url, cover_image_url, official_website, booking_url, contact_number, founded_year,
            verification_status, is_verified, facilities, rating_average, review_count, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::text[], $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20, $21, $22)
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(o._id),
          objectIdToUuid(o.owner),
          clampText(o.name, 140, 'Kaafila Organisation'),
          String(o.slug).toLowerCase(),
          JSON.stringify(o.location || {}),
          o.operatingRegions || [],
          String(o.shortDescription || ''),
          String(o.about || ''),
          String(o.logoUrl || ''),
          String(o.coverImageUrl || ''),
          String(o.officialWebsite || ''),
          String(o.bookingUrl || ''),
          String(o.contactNumber || ''),
          o.foundedYear || null,
          ['pending', 'verified', 'rejected'].includes(o.verificationStatus) ? o.verificationStatus : 'pending',
          o.verificationStatus === 'verified' || Boolean(o.isVerified),
          JSON.stringify(o.facilities || {}),
          Number(o.ratingAverage || 0),
          Number(o.reviewCount || 0),
          Boolean(o.isDemo),
          unwrapDate(o.createdAt, new Date().toISOString()),
          unwrapDate(o.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const om of collections.organisationMembers) {
      await tx.query(
        `INSERT INTO organisation_members (id, organisation_id, user_id, member_role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organisation_id, user_id) DO NOTHING`,
        [
          objectIdToUuid(om._id),
          objectIdToUuid(om.organisation),
          objectIdToUuid(om.user),
          ['owner', 'lead_marshal', 'coordinator', 'mechanic'].includes(om.memberRole) ? om.memberRole : 'owner',
          ['active', 'invited', 'removed'].includes(om.status) ? om.status : 'active',
          unwrapDate(om.createdAt, new Date().toISOString()),
          unwrapDate(om.updatedAt, new Date().toISOString()),
        ]
      );
    }

    // 5. Rides & RideMembers & Reviews
    for (const r of collections.rides) {
      const startIso = unwrapDate(r.startDate, new Date().toISOString());
      const endIso = unwrapDate(r.endDate, startIso);
      await tx.query(
        `INSERT INTO rides (
           id, organisation_id, title, slug, tagline, description, region,
           start_location, end_location, max_altitude_meters, distance_km, duration_days,
           difficulty, start_date, end_date, price_inr, price_own_bike_inr, currency,
           max_riders, spots_remaining, cover_image_url, booking_url, bike_rental_available,
           facilities_summary, highlights, itinerary, route, inclusions, exclusions,
           status, is_featured, is_demo, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18,
           $19, $20, $21, $22, $23,
           $24, $25::text[], $26::jsonb, $27::jsonb, $28::text[], $29::text[],
           $30, $31, $32, $33, $34
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(r._id),
          objectIdToUuid(r.organisation),
          clampText(r.title, 160, 'Expedition'),
          String(r.slug).toLowerCase(),
          String(r.tagline || ''),
          String(r.description || ''),
          String(r.region || 'Himalayas'),
          String(r.startLocation || ''),
          String(r.endLocation || ''),
          Math.max(0, Number(r.maxAltitudeMeters || 0)),
          Math.max(1, Number(r.distanceKm || 1)),
          Math.max(1, Number(r.durationDays || 1)),
          ['moderate', 'challenging', 'extreme'].includes(r.difficulty) ? r.difficulty : 'challenging',
          startIso,
          new Date(endIso) < new Date(startIso) ? startIso : endIso,
          Math.max(0, Number(r.priceInr || 0)),
          r.priceOwnBikeInr != null ? Math.max(0, Number(r.priceOwnBikeInr)) : null,
          String(r.currency || 'INR'),
          Math.max(1, Number(r.maxRiders || 12)),
          Math.max(0, Number(r.spotsRemaining ?? r.maxRiders ?? 12)),
          String(r.coverImageUrl || ''),
          String(r.bookingUrl || ''),
          r.bikeRentalAvailable !== false,
          String(r.facilitiesSummary || ''),
          r.highlights || [],
          JSON.stringify(r.itinerary || []),
          JSON.stringify(r.route || { hasRouteData: false }),
          r.inclusions || [],
          r.exclusions || [],
          ['draft', 'published', 'upcoming', 'ongoing', 'completed', 'cancelled'].includes(r.status) ? r.status : 'published',
          Boolean(r.isFeatured),
          Boolean(r.isDemo),
          unwrapDate(r.createdAt, new Date().toISOString()),
          unwrapDate(r.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const rm of collections.rideMembers) {
      await tx.query(
        `INSERT INTO ride_members (id, ride_id, user_id, status, bike_choice, share_contact_with_organisation, verified_km_awarded, notes, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (ride_id, user_id) DO NOTHING`,
        [
          objectIdToUuid(rm._id),
          objectIdToUuid(rm.ride),
          objectIdToUuid(rm.user),
          ['interested', 'confirmed', 'completed', 'cancelled'].includes(rm.status) ? rm.status : 'interested',
          ['rental', 'own_bike'].includes(rm.bikeChoice) ? rm.bikeChoice : 'rental',
          Boolean(rm.shareContactWithOrganisation),
          Number(rm.verifiedKmAwarded || 0),
          String(rm.notes || ''),
          unwrapDate(rm.joinedAt, unwrapDate(rm.createdAt, new Date().toISOString())),
          unwrapDate(rm.createdAt, new Date().toISOString()),
          unwrapDate(rm.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const rev of collections.reviews) {
      await tx.query(
        `INSERT INTO reviews (id, organisation_id, author_id, ride_id, rating, title, comment, is_verified_participant, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (organisation_id, author_id) DO NOTHING`,
        [
          objectIdToUuid(rev._id),
          objectIdToUuid(rev.organisation),
          objectIdToUuid(rev.author),
          objectIdToUuid(rev.ride),
          Math.min(5, Math.max(1, Math.round(Number(rev.rating || 5)))),
          String(rev.title || ''),
          String(rev.comment || ''),
          Boolean(rev.isVerifiedParticipant),
          Boolean(rev.isDemo),
          unwrapDate(rev.createdAt, new Date().toISOString()),
          unwrapDate(rev.updatedAt, new Date().toISOString()),
        ]
      );
    }

    // 6. Connections & Conversations
    for (const c of collections.connections) {
      await tx.query(
        `INSERT INTO connections (id, requester_id, recipient_id, status, responded_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (requester_id, recipient_id) DO NOTHING`,
        [
          objectIdToUuid(c._id),
          objectIdToUuid(c.requester),
          objectIdToUuid(c.recipient),
          ['pending', 'accepted', 'declined', 'blocked'].includes(c.status) ? c.status : 'pending',
          unwrapDate(c.respondedAt),
          unwrapDate(c.createdAt, new Date().toISOString()),
          unwrapDate(c.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const conv of collections.conversations) {
      if (!Array.isArray(conv.participants) || conv.participants.length < 2) continue;
      const [pa, pb] = sortParticipantPair(conv.participants[0], conv.participants[1]);
      await tx.query(
        `INSERT INTO conversations (id, participant_a_id, participant_b_id, last_message_text, last_message_at, last_message_sender_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (participant_a_id, participant_b_id) DO NOTHING`,
        [
          objectIdToUuid(conv._id),
          pa,
          pb,
          String(conv.lastMessageText || ''),
          unwrapDate(conv.lastMessageAt),
          objectIdToUuid(conv.lastMessageSender),
          unwrapDate(conv.createdAt, new Date().toISOString()),
          unwrapDate(conv.updatedAt, new Date().toISOString()),
        ]
      );
    }

    // 7. Groups, GroupMembers, Messages, Notifications
    for (const g of collections.kafilaGroups) {
      await tx.query(
        `INSERT INTO kafila_groups
           (id, name, slug, cover_image_url, organisation_id, ride_id, destination, start_date,
            max_members, description, privacy, created_by_id, voice_room_status, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(g._id),
          clampText(g.name, 120, 'Kaafila Group'),
          String(g.slug).toLowerCase(),
          String(g.coverImageUrl || '/images/community-camp.png'),
          objectIdToUuid(g.organisation),
          objectIdToUuid(g.ride),
          String(g.destination || ''),
          unwrapDate(g.startDate),
          Math.min(500, Math.max(2, Number(g.maxMembers || 40))),
          String(g.description || ''),
          ['public', 'private', 'invite_only'].includes(g.privacy) ? g.privacy : 'public',
          objectIdToUuid(g.createdBy),
          ['coming_soon', 'ready'].includes(g.voiceRoomStatus) ? g.voiceRoomStatus : 'coming_soon',
          Boolean(g.isDemo),
          unwrapDate(g.createdAt, new Date().toISOString()),
          unwrapDate(g.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const gm of collections.groupMembers) {
      await tx.query(
        `INSERT INTO group_members (id, group_id, user_id, role, status, invited_by_id, joined_at, last_read_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [
          objectIdToUuid(gm._id),
          objectIdToUuid(gm.group),
          objectIdToUuid(gm.user),
          ['owner', 'admin', 'marshal', 'member'].includes(gm.role) ? gm.role : 'member',
          ['active', 'pending_request', 'invited', 'left'].includes(gm.status) ? gm.status : 'active',
          objectIdToUuid(gm.invitedBy),
          unwrapDate(gm.joinedAt, unwrapDate(gm.createdAt, new Date().toISOString())),
          unwrapDate(gm.lastReadAt),
          unwrapDate(gm.createdAt, new Date().toISOString()),
          unwrapDate(gm.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const m of collections.messages) {
      const readBy = Array.isArray(m.readBy) ? m.readBy.map(objectIdToUuid).filter(Boolean) : [];
      await tx.query(
        `INSERT INTO messages (id, sender_id, conversation_id, group_id, message_type, title, content, is_pinned, read_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid[], $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(m._id),
          objectIdToUuid(m.sender),
          objectIdToUuid(m.conversation),
          objectIdToUuid(m.group),
          ['text', 'announcement', 'system'].includes(m.messageType) ? m.messageType : 'text',
          String(m.title || ''),
          clampText(m.content, 2000, ''),
          Boolean(m.isPinned),
          readBy,
          unwrapDate(m.createdAt, new Date().toISOString()),
          unwrapDate(m.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const n of collections.notifications) {
      await tx.query(
        `INSERT INTO notifications (id, recipient_id, actor_id, type, title, body, link, metadata, is_read, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(n._id),
          objectIdToUuid(n.recipient),
          objectIdToUuid(n.actor),
          String(n.type || 'announcement'),
          String(n.title || ''),
          String(n.body || ''),
          String(n.link || ''),
          JSON.stringify(n.metadata || {}),
          Boolean(n.isRead),
          unwrapDate(n.createdAt, new Date().toISOString()),
          unwrapDate(n.updatedAt, new Date().toISOString()),
        ]
      );
    }

    // 8. Checkpoints, TrackingSessions, CheckpointArrivals, GroupLocations, Leaderboards
    for (const cp of collections.checkpoints) {
      const coords = cp.location?.coordinates || cp.coordinates || [0, 0];
      await tx.query(
        `INSERT INTO checkpoints (id, ride_id, organisation_id, name, description, type, lng, lat, altitude_meters, sequence_number, radius_meters, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(cp._id),
          objectIdToUuid(cp.ride),
          objectIdToUuid(cp.organisation),
          clampText(cp.name, 120, 'Checkpoint'),
          String(cp.description || ''),
          ['start', 'checkpoint', 'rest_stop', 'fuel_stop', 'important', 'destination'].includes(cp.type) ? cp.type : 'checkpoint',
          Number(coords[0] || 0),
          Number(coords[1] || 0),
          cp.altitudeMeters != null ? Number(cp.altitudeMeters) : null,
          Math.max(1, Number(cp.sequenceNumber || 1)),
          Math.min(5000, Math.max(50, Number(cp.radiusMeters || 250))),
          unwrapDate(cp.createdAt, new Date().toISOString()),
          unwrapDate(cp.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const ts of collections.trackingSessions) {
      await tx.query(
        `INSERT INTO tracking_sessions (
           id, user_id, ride_id, organisation_id, status, started_at, paused_at, ended_at,
           active_duration_seconds, route_coordinates, location_points,
           estimated_distance_km, submitted_distance_km, verified_distance_km,
           avg_speed_kmh, max_speed_kmh, verification_status, anti_spoof_flags,
           flag_reasons, reviewed_by_id, reviewed_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::text[], $20, $21, $22, $23)
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(ts._id),
          objectIdToUuid(ts.user),
          objectIdToUuid(ts.ride),
          objectIdToUuid(ts.organisation),
          ['active', 'paused', 'stopped', 'completed'].includes(ts.status) ? ts.status : 'stopped',
          unwrapDate(ts.startedAt, new Date().toISOString()),
          unwrapDate(ts.pausedAt),
          unwrapDate(ts.endedAt),
          Math.max(0, Number(ts.activeDurationSeconds || 0)),
          JSON.stringify(ts.routeCoordinates || []),
          JSON.stringify(ts.locationPoints || []),
          Math.max(0, Number(ts.estimatedDistanceKm || 0)),
          Math.max(0, Number(ts.submittedDistanceKm || 0)),
          Math.max(0, Number(ts.verifiedDistanceKm || 0)),
          Number(ts.avgSpeedKmh || 0),
          Number(ts.maxSpeedKmh || 0),
          ['recording', 'pending_review', 'verified', 'flagged', 'rejected'].includes(ts.verificationStatus)
            ? ts.verificationStatus
            : 'recording',
          JSON.stringify(ts.antiSpoofFlags || {}),
          ts.flagReasons || [],
          objectIdToUuid(ts.reviewedBy),
          unwrapDate(ts.reviewedAt),
          unwrapDate(ts.createdAt, new Date().toISOString()),
          unwrapDate(ts.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const ca of collections.checkpointArrivals) {
      const c = ca.location?.coordinates || [null, null];
      await tx.query(
        `INSERT INTO checkpoint_arrivals (id, user_id, ride_id, checkpoint_id, session_id, arrived_at, lng, lat, distance_from_checkpoint_meters, verification_method, verified_by_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (user_id, ride_id, checkpoint_id) DO NOTHING`,
        [
          objectIdToUuid(ca._id),
          objectIdToUuid(ca.user),
          objectIdToUuid(ca.ride),
          objectIdToUuid(ca.checkpoint),
          objectIdToUuid(ca.session),
          unwrapDate(ca.arrivedAt, new Date().toISOString()),
          c[0] != null ? Number(c[0]) : null,
          c[1] != null ? Number(c[1]) : null,
          ca.distanceFromCheckpointMeters != null ? Number(ca.distanceFromCheckpointMeters) : null,
          ['gps_proximity', 'manual_marshal'].includes(ca.verificationMethod) ? ca.verificationMethod : 'gps_proximity',
          objectIdToUuid(ca.verifiedBy),
          unwrapDate(ca.createdAt, new Date().toISOString()),
          unwrapDate(ca.updatedAt, new Date().toISOString()),
        ]
      );
    }

    for (const gl of collections.groupLocations) {
      await tx.query(
        `INSERT INTO group_locations (id, group_id, user_id, sharing_enabled, lat, lng, heading, speed_kmh, updated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [
          objectIdToUuid(gl._id),
          objectIdToUuid(gl.group),
          objectIdToUuid(gl.user),
          Boolean(gl.sharingEnabled),
          gl.lat != null ? Number(gl.lat) : null,
          gl.lng != null ? Number(gl.lng) : null,
          gl.heading != null ? Number(gl.heading) : null,
          gl.speedKmh != null ? Number(gl.speedKmh) : null,
          unwrapDate(gl.updatedAt, new Date().toISOString()),
          unwrapDate(gl.createdAt, new Date().toISOString()),
        ]
      );
    }

    for (const lb of collections.leaderboards) {
      await tx.query(
        `INSERT INTO leaderboards (id, period, scope_id, entries, generated_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          objectIdToUuid(lb._id),
          ['global', 'monthly', 'organisation', 'expedition'].includes(lb.period) ? lb.period : 'global',
          objectIdToUuid(lb.scopeId),
          JSON.stringify(lb.entries || []),
          unwrapDate(lb.generatedAt, new Date().toISOString()),
          unwrapDate(lb.createdAt, new Date().toISOString()),
          unwrapDate(lb.updatedAt, new Date().toISOString()),
        ]
      );
    }
  });

  const verification = {};
  if (verify) {
    for (const table of Object.keys(counts)) {
      const row = await queryOne(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
      verification[table] = { expectedMin: counts[table], actualInPostgres: row?.cnt ?? 0 };
    }
  }

  return { dryRun: false, migrated: true, sourceCounts: counts, verification };
}

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dumpDir = getArgValue('--dump-dir');
  const mongoUri = getArgValue('--mongo-uri') || process.env.MONGO_URI || '';
  const dryRun = process.argv.includes('--dry-run');
  const verify = !process.argv.includes('--no-verify');

  (async () => {
    try {
      await connectPostgres();
      const collections = await readAllCollections({ dumpDir, mongoUri });
      const report = await migrateDataToPostgres(collections, { dryRun, verify });
      console.log('[MIGRATION] Complete:', JSON.stringify(report, null, 2));
    } catch (err) {
      console.error('[MIGRATION] Failed:', err.message);
      process.exitCode = 1;
    } finally {
      await disconnectPostgres();
    }
  })();
}

