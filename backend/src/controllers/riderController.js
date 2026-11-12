import { query, queryOne, transaction } from '../config/pg.js';
import {
  escapeIlike,
  fetchBadgesByUserIds,
  getHydratedRiderProfile,
} from '../repositories/common.js';
import {
  mapAchievement,
  mapConnection,
  mapOrganisation,
  mapRide,
  mapRideMember,
  mapRiderProfile,
  mapTrackingSession,
  mapUser,
} from '../repositories/mappers.js';
import { RANK_TIERS, getTierProgress } from '../utils/ranking.js';
import {
  ACHIEVEMENT_CATALOG,
  buildAchievementProgressList,
  ensureAchievementCatalog,
} from '../utils/achievements.js';
import { isValidImageUrl, parsePagination } from '../utils/validators.js';

const ACTIVE_RIDE_STATUSES = ['published', 'upcoming', 'ongoing'];

function classifyParticipation(p) {
  if (!p?.ride) return null;
  if (p.status === 'cancelled' || p.ride.status === 'cancelled') return 'cancelled';
  if (p.status === 'completed' || p.ride.status === 'completed') return 'completed';
  if (ACTIVE_RIDE_STATUSES.includes(p.ride.status)) return 'upcoming';
  return 'upcoming';
}

export async function listRiders(req, res, next) {
  try {
    const { search = '', rank = '', city = '', motorcycle = '', experience = '', excludeSelf = '' } = req.query;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 24, maxLimit: 50 });

    const conditions = ['rp.is_profile_public <> FALSE', "u.role = 'rider'"];
    const params = [];

    if (excludeSelf === 'true' && req.user) {
      params.push(req.user.id);
      conditions.push(`rp.user_id <> $${params.length}`);
    }

    if (rank && rank !== 'all') {
      params.push(rank);
      conditions.push(`rp.rank = $${params.length}`);
    }

    if (city.trim() && city !== 'all') {
      params.push(`%${escapeIlike(city.trim())}%`);
      conditions.push(`rp.home_city ILIKE $${params.length}`);
    }

    if (motorcycle.trim() && motorcycle !== 'all') {
      params.push(`%${escapeIlike(motorcycle.trim())}%`);
      conditions.push(`rp.primary_motorcycle ILIKE $${params.length}`);
    }

    if (experience && experience !== 'all') {
      params.push(experience);
      conditions.push(`rp.riding_experience = $${params.length}`);
    }

    if (search.trim()) {
      const pattern = `%${escapeIlike(search.trim())}%`;
      params.push(pattern);
      const pIdx = params.length;
      conditions.push(`(
        rp.handle ILIKE $${pIdx}
        OR rp.home_city ILIKE $${pIdx}
        OR rp.primary_motorcycle ILIKE $${pIdx}
        OR u.full_name ILIKE $${pIdx}
      )`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const dataParams = [...params, limit, skip];

    const [profilesRes, countRes] = await Promise.all([
      query(
        `SELECT rp.*, u.full_name, u.avatar_url
         FROM rider_profiles rp
         JOIN users u ON u.id = rp.user_id
         ${whereClause}
         ORDER BY rp.verified_kilometres DESC, rp.completed_expeditions DESC, rp.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        dataParams
      ),
      queryOne(
        `SELECT COUNT(*)::int AS total
         FROM rider_profiles rp
         JOIN users u ON u.id = rp.user_id
         ${whereClause}`,
        params
      ),
    ]);

    const userIds = profilesRes.rows.map((p) => p.user_id);
    const badgesMap = await fetchBadgesByUserIds(userIds);

    const connectionMap = new Map();
    if (req.user && userIds.length > 0) {
      const connRes = await query(
        `SELECT * FROM connections
         WHERE (requester_id = $1 AND recipient_id = ANY($2::uuid[]))
            OR (recipient_id = $1 AND requester_id = ANY($2::uuid[]))`,
        [req.user.id, userIds]
      );

      for (const conn of connRes.rows) {
        const isRequester = conn.requester_id === req.user.id;
        const partnerId = isRequester ? conn.recipient_id : conn.requester_id;
        let connectionStatus = conn.status;
        if (conn.status === 'pending') {
          connectionStatus = isRequester ? 'pending_sent' : 'pending_received';
        }
        connectionMap.set(partnerId, { connectionId: conn.id, connectionStatus });
      }
    }

    const data = profilesRes.rows.map((row) => {
      const uid = row.user_id;
      const connInfo = connectionMap.get(uid) || { connectionId: null, connectionStatus: 'none' };
      const isSelf = Boolean(req.user && uid === req.user.id);
      const mapped = mapRiderProfile(row, {
        badges: badgesMap.get(uid) || [],
        includeEmergencyContact: false,
      });

      return {
        _id: mapped._id,
        id: mapped.id,
        userId: uid,
        handle: mapped.handle,
        fullName: row.full_name || 'Rider',
        avatarUrl: row.avatar_url || '',
        bio: mapped.bio,
        homeCity: mapped.homeCity,
        primaryMotorcycle: mapped.primaryMotorcycle,
        ridingExperience: mapped.ridingExperience,
        verifiedKilometres: mapped.verifiedKilometres,
        completedExpeditions: mapped.completedExpeditions,
        rank: mapped.rank,
        badges: mapped.badges,
        isDemo: mapped.isDemo,
        isSelf,
        connectionStatus: isSelf ? 'self' : connInfo.connectionStatus,
        connectionId: connInfo.connectionId,
      };
    });

    const total = countRes?.total || 0;

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getRiderByHandle(req, res, next) {
  try {
    const handle = String(req.params.handle || '').toLowerCase().trim();
    const row = await queryOne(
      `SELECT rp.*, u.full_name, u.avatar_url, u.created_at AS user_created_at
       FROM rider_profiles rp
       JOIN users u ON u.id = rp.user_id
       WHERE LOWER(rp.handle) = LOWER($1)
       LIMIT 1`,
      [handle]
    );

    if (!row) {
      return res.status(404).json({ success: false, message: 'Rider profile not found.' });
    }

    const isOwner = Boolean(req.user && row.user_id === req.user.id);
    if (row.is_profile_public === false && !isOwner) {
      return res.status(404).json({ success: false, message: 'This rider profile is private.' });
    }

    const profile = await getHydratedRiderProfile(row.user_id, {
      includeEmergencyContact: false,
    });

    let connectionStatus = isOwner ? 'self' : 'none';
    let connectionId = null;
    if (req.user && !isOwner) {
      const connRow = await queryOne(
        `SELECT * FROM connections
         WHERE (requester_id = $1 AND recipient_id = $2)
            OR (requester_id = $2 AND recipient_id = $1)
         LIMIT 1`,
        [req.user.id, row.user_id]
      );
      if (connRow) {
        connectionId = connRow.id;
        if (connRow.status === 'pending') {
          connectionStatus = connRow.requester_id === req.user.id ? 'pending_sent' : 'pending_received';
        } else {
          connectionStatus = connRow.status;
        }
      }
    }

    const [partRes, publicRoutesRes] = await Promise.all([
      query(
        `SELECT rm.*,
           row_to_json(r.*) AS ride_row,
           row_to_json(o.*) AS org_row
         FROM ride_members rm
         JOIN rides r ON r.id = rm.ride_id
         JOIN organisations o ON o.id = r.organisation_id
         WHERE rm.user_id = $1 AND rm.status IN ('confirmed', 'completed')
         ORDER BY rm.created_at DESC
         LIMIT 10`,
        [row.user_id]
      ),
      query(
        `SELECT ts.id, ts.title, ts.started_at, ts.verified_distance_km, ts.simplified_public_route,
                r.id AS ride_id, r.title AS ride_title, r.slug AS ride_slug, r.region AS ride_region
         FROM tracking_sessions ts
         LEFT JOIN rides r ON r.id = ts.ride_id
         WHERE ts.user_id = $1
           AND ts.status = 'completed'
           AND ts.share_simplified_route_public = TRUE
           AND jsonb_array_length(ts.simplified_public_route) >= 2
         ORDER BY ts.started_at DESC
         LIMIT 5`,
        [row.user_id]
      ),
    ]);

    const participations = partRes.rows.map((p) => {
      const org = p.org_row ? mapOrganisation(p.org_row) : null;
      const ride = p.ride_row
        ? mapRide(p.ride_row, {
            organisation: org
              ? { _id: org.id, id: org.id, name: org.name, slug: org.slug, isVerified: org.isVerified, isDemo: org.isDemo }
              : null,
          })
        : null;
      return mapRideMember(p, { ride });
    });

    const publicRouteSummaries = publicRoutesRes.rows.map((ts) => ({
      _id: ts.id,
      id: ts.id,
      title: ts.title,
      startedAt: ts.started_at,
      verifiedDistanceKm: Number(ts.verified_distance_km || 0),
      simplifiedPublicRoute: ts.simplified_public_route || [],
      ride: ts.ride_id
        ? { _id: ts.ride_id, id: ts.ride_id, title: ts.ride_title, slug: ts.ride_slug, region: ts.ride_region }
        : null,
    }));

    const tierProgress = getTierProgress(
      profile.verifiedKilometres,
      profile.completedExpeditions,
      profile.rank,
      profile.badges.length
    );

    // Never expose private email, phoneNumber, or emergencyContact on public rider profiles
    return res.json({
      success: true,
      data: {
        rider: {
          _id: profile._id,
          id: profile.id,
          userId: row.user_id,
          handle: profile.handle,
          fullName: row.full_name,
          avatarUrl: row.avatar_url || '',
          joinedAt: row.user_created_at,
          bio: profile.bio,
          homeCity: profile.homeCity,
          primaryMotorcycle: profile.primaryMotorcycle,
          ridingExperience: profile.ridingExperience,
          verifiedKilometres: profile.verifiedKilometres,
          completedExpeditions: profile.completedExpeditions,
          rank: profile.rank,
          badges: profile.badges,
          isDemo: profile.isDemo,
          isProfilePublic: profile.isProfilePublic,
          connectionStatus,
          connectionId,
        },
        tierProgress,
        tiers: RANK_TIERS,
        expeditions: participations.filter((p) => p.ride && p.ride.status !== 'draft'),
        publicRouteSummaries,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyRiderDashboard(req, res, next) {
  try {
    const profile = await getHydratedRiderProfile(req.user.id, { includeRankHistory: true });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Rider profile not found.' });
    }

    const partRes = await query(
      `SELECT rm.*, row_to_json(r.*) AS ride_row, row_to_json(o.*) AS org_row
       FROM ride_members rm
       JOIN rides r ON r.id = rm.ride_id
       JOIN organisations o ON o.id = r.organisation_id
       WHERE rm.user_id = $1
       ORDER BY rm.updated_at DESC, rm.created_at DESC`,
      [req.user.id]
    );

    const participations = partRes.rows.map((p) => {
      const org = p.org_row ? mapOrganisation(p.org_row) : null;
      const ride = p.ride_row
        ? mapRide(p.ride_row, {
            organisation: org
              ? {
                  _id: org.id,
                  id: org.id,
                  name: org.name,
                  slug: org.slug,
                  logoUrl: org.logoUrl,
                  location: org.location,
                  bookingUrl: org.bookingUrl,
                  officialWebsite: org.officialWebsite,
                  isVerified: org.isVerified,
                  isDemo: org.isDemo,
                }
              : null,
          })
        : null;
      return mapRideMember(p, { ride });
    });

    const upcomingRides = [];
    const completedRides = [];
    const cancelledRides = [];
    const joinedOrgIds = new Set();

    for (const p of participations) {
      const category = classifyParticipation(p);
      if (p.status !== 'cancelled' && p.ride?.organisation?._id) {
        joinedOrgIds.add(String(p.ride.organisation._id));
      }
      if (category === 'upcoming') upcomingRides.push(p);
      else if (category === 'completed') completedRides.push(p);
      else if (category === 'cancelled') cancelledRides.push(p);
    }

    const totalCompletedRides = Math.max(profile.completedExpeditions || 0, completedRides.length);
    const tierProgress = getTierProgress(
      profile.verifiedKilometres,
      profile.completedExpeditions,
      profile.rank,
      profile.badges.length
    );

    await ensureAchievementCatalog();

    const [
      achRes,
      cpRes,
      activeSessRow,
      recentSessRes,
      higherRankedRow,
    ] = await Promise.all([
      query('SELECT * FROM achievements ORDER BY criteria_km ASC, criteria_rides ASC'),
      queryOne('SELECT COUNT(*)::int AS cnt FROM checkpoint_arrivals WHERE user_id = $1 AND verified = TRUE', [
        req.user.id,
      ]),
      queryOne(
        `SELECT ts.*, r.title AS ride_title, r.slug AS ride_slug, r.region AS ride_region,
                g.name AS group_name, g.slug AS group_slug
         FROM tracking_sessions ts
         LEFT JOIN rides r ON r.id = ts.ride_id
         LEFT JOIN kafila_groups g ON g.id = ts.group_id
         WHERE ts.user_id = $1 AND ts.status IN ('active', 'paused')
         ORDER BY ts.started_at DESC
         LIMIT 1`,
        [req.user.id]
      ),
      query(
        `SELECT ts.id, ts.title, ts.ride_id, ts.started_at, ts.ended_at, ts.active_duration_seconds,
                ts.estimated_distance_km, ts.verified_distance_km, ts.verification_status,
                r.title AS ride_title, r.slug AS ride_slug, r.region AS ride_region
         FROM tracking_sessions ts
         LEFT JOIN rides r ON r.id = ts.ride_id
         WHERE ts.user_id = $1 AND ts.status = 'completed'
         ORDER BY ts.started_at DESC
         LIMIT 5`,
        [req.user.id]
      ),
      profile.isProfilePublic !== false
        ? queryOne(
            `SELECT COUNT(*)::int AS cnt FROM rider_profiles
             WHERE is_profile_public <> FALSE
               AND (verified_kilometres > $1
                    OR (verified_kilometres = $1 AND completed_expeditions > $2))`,
            [profile.verifiedKilometres || 0, profile.completedExpeditions || 0]
          )
        : Promise.resolve(null),
    ]);

    const achievementDefs = achRes.rows.length ? achRes.rows.map((a) => mapAchievement(a)) : ACHIEVEMENT_CATALOG;
    const verifiedCheckpointsCount = cpRes?.cnt || 0;
    const achievements = buildAchievementProgressList(profile, verifiedCheckpointsCount, achievementDefs);
    const leaderboardPosition = higherRankedRow ? higherRankedRow.cnt + 1 : null;

    const activeTrackingSession = activeSessRow
      ? mapTrackingSession(activeSessRow, {
          ride: activeSessRow.ride_id
            ? {
                _id: activeSessRow.ride_id,
                id: activeSessRow.ride_id,
                title: activeSessRow.ride_title,
                slug: activeSessRow.ride_slug,
                region: activeSessRow.ride_region,
              }
            : null,
          group: activeSessRow.group_id
            ? {
                _id: activeSessRow.group_id,
                id: activeSessRow.group_id,
                name: activeSessRow.group_name,
                slug: activeSessRow.group_slug,
              }
            : null,
        })
      : null;

    const recentTrackingSessions = recentSessRes.rows.map((ts) => ({
      _id: ts.id,
      id: ts.id,
      title: ts.title,
      startedAt: ts.started_at,
      endedAt: ts.ended_at,
      activeDurationSeconds: Number(ts.active_duration_seconds || 0),
      estimatedDistanceKm: Number(ts.estimated_distance_km || 0),
      verifiedDistanceKm: Number(ts.verified_distance_km || 0),
      verificationStatus: ts.verification_status,
      ride: ts.ride_id
        ? { _id: ts.ride_id, id: ts.ride_id, title: ts.ride_title, slug: ts.ride_slug, region: ts.ride_region }
        : null,
    }));

    const recentActivity = [
      ...participations.slice(0, 6).map((p) => ({
        id: String(p._id),
        type: 'expedition',
        title: p.ride.title,
        organisationName: p.ride.organisation?.name || 'Touring Organisation',
        status: p.status,
        slug: p.ride.slug,
        timestamp: p.updatedAt || p.createdAt,
      })),
      ...(profile.updatedAt
        ? [
            {
              id: `profile-${profile._id}`,
              type: 'profile',
              title: 'Rider profile updated',
              organisationName: profile.homeCity || 'KAAFILA Account',
              status: 'active',
              timestamp: profile.updatedAt,
            },
          ]
        : []),
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8);

    return res.json({
      success: true,
      data: {
        user: {
          _id: req.user.id,
          id: req.user.id,
          fullName: req.user.fullName,
          email: req.user.email,
          phoneNumber: req.user.phoneNumber || '',
          city: req.user.city || '',
          avatarUrl: req.user.avatarUrl || '',
          createdAt: req.user.createdAt,
        },
        riderProfile: {
          ...profile,
          emergencyContact: {
            name: profile.emergencyContact?.name || '',
            relationship: profile.emergencyContact?.relationship || '',
            phone: profile.emergencyContact?.phone || '',
            bloodGroup: profile.emergencyContact?.bloodGroup || '',
            shareWithOrganisers: Boolean(profile.emergencyContact?.shareWithOrganisers),
          },
        },
        stats: {
          totalCompletedRides,
          totalRidingKm: profile.verifiedKilometres || 0,
          upcomingRidesCount: upcomingRides.length,
          cancelledRidesCount: cancelledRides.length,
          joinedOrganisationsCount: joinedOrgIds.size,
        },
        tierProgress,
        tiers: RANK_TIERS,
        achievements,
        verifiedCheckpointsCount,
        leaderboardPosition,
        activeTrackingSession,
        recentTrackingSessions,
        participations,
        upcomingRides,
        recentActivity,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyRiderRides(req, res, next) {
  try {
    const { category = 'all' } = req.query;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 12, maxLimit: 50 });

    const partRes = await query(
      `SELECT rm.*, row_to_json(r.*) AS ride_row, row_to_json(o.*) AS org_row
       FROM ride_members rm
       JOIN rides r ON r.id = rm.ride_id
       JOIN organisations o ON o.id = r.organisation_id
       WHERE rm.user_id = $1
       ORDER BY rm.updated_at DESC, rm.created_at DESC`,
      [req.user.id]
    );

    const valid = partRes.rows.map((p) => {
      const org = p.org_row ? mapOrganisation(p.org_row) : null;
      const ride = p.ride_row
        ? mapRide(p.ride_row, {
            organisation: org
              ? {
                  _id: org.id,
                  id: org.id,
                  name: org.name,
                  slug: org.slug,
                  logoUrl: org.logoUrl,
                  location: org.location,
                  bookingUrl: org.bookingUrl,
                  officialWebsite: org.officialWebsite,
                  isVerified: org.isVerified,
                  isDemo: org.isDemo,
                }
              : null,
          })
        : null;
      return mapRideMember(p, { ride });
    });

    const counts = { all: valid.length, upcoming: 0, completed: 0, cancelled: 0 };

    const categorized = valid.map((p) => {
      const cat = classifyParticipation(p);
      if (cat && counts[cat] !== undefined) counts[cat] += 1;
      return { ...p, category: cat };
    });

    const filtered =
      category && ['upcoming', 'completed', 'cancelled'].includes(category)
        ? categorized.filter((p) => p.category === category)
        : categorized;

    const paginated = filtered.slice(skip, skip + limit);

    return res.json({
      success: true,
      data: paginated,
      counts,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMyRiderProfile(req, res, next) {
  try {
    const {
      fullName,
      phoneNumber,
      bio,
      homeCity,
      city,
      primaryMotorcycle,
      ridingExperience,
      avatarUrl,
      emergencyContact,
      isProfilePublic,
    } = req.body;

    const existingRow = await queryOne('SELECT * FROM rider_profiles WHERE user_id = $1', [req.user.id]);
    if (!existingRow) {
      return res.status(404).json({ success: false, message: 'Rider profile not found.' });
    }

    if (typeof fullName === 'string' && fullName.trim().length > 0 && fullName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 2 characters.',
      });
    }

    if (avatarUrl && !isValidImageUrl(avatarUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Avatar URL must be a valid image URL or uploaded image.',
      });
    }

    const nextFullName =
      typeof fullName === 'string' && fullName.trim().length >= 2
        ? fullName.trim().slice(0, 100)
        : req.user.fullName;
    const nextPhone = typeof phoneNumber === 'string' ? phoneNumber.trim().slice(0, 25) : req.user.phoneNumber;
    const nextAvatar = typeof avatarUrl === 'string' ? avatarUrl.trim() : req.user.avatarUrl;
    const resolvedCity = typeof homeCity === 'string' ? homeCity : city;
    const nextCity = typeof resolvedCity === 'string' ? resolvedCity.trim().slice(0, 100) : req.user.city;
    const nextHomeCity = typeof resolvedCity === 'string' ? resolvedCity.trim().slice(0, 100) : existingRow.home_city;

    // verifiedKilometres, completedExpeditions, rank, badges remain strictly immutable to the rider
    const nextBio = typeof bio === 'string' ? bio.trim().slice(0, 500) : existingRow.bio;
    const nextMoto =
      typeof primaryMotorcycle === 'string'
        ? primaryMotorcycle.trim().slice(0, 120)
        : existingRow.primary_motorcycle;
    const nextExp =
      typeof ridingExperience === 'string' &&
      ['beginner', 'intermediate', 'advanced', 'expedition_veteran'].includes(ridingExperience)
        ? ridingExperience
        : existingRow.riding_experience;

    const oldEc = existingRow.emergency_contact || {};
    const nextEc =
      emergencyContact && typeof emergencyContact === 'object'
        ? {
            name: String(emergencyContact.name ?? oldEc.name ?? '').trim().slice(0, 100),
            relationship: String(emergencyContact.relationship ?? oldEc.relationship ?? '').trim().slice(0, 60),
            phone: String(emergencyContact.phone ?? oldEc.phone ?? '').trim().slice(0, 25),
            bloodGroup: String(emergencyContact.bloodGroup ?? oldEc.bloodGroup ?? '').trim().slice(0, 10),
            shareWithOrganisers:
              typeof emergencyContact.shareWithOrganisers === 'boolean'
                ? emergencyContact.shareWithOrganisers
                : Boolean(oldEc.shareWithOrganisers),
          }
        : oldEc;

    const nextPublic = typeof isProfilePublic === 'boolean' ? isProfilePublic : existingRow.is_profile_public;

    const { updatedUser, updatedProfile } = await transaction(async (tx) => {
      const uRow = await tx.queryOne(
        `UPDATE users SET full_name = $1, phone_number = $2, avatar_url = $3, city = $4
         WHERE id = $5
         RETURNING *`,
        [nextFullName, nextPhone, nextAvatar, nextCity, req.user.id]
      );

      await tx.queryOne(
        `UPDATE rider_profiles SET
           home_city = $1,
           bio = $2,
           primary_motorcycle = $3,
           riding_experience = $4,
           emergency_contact = $5::jsonb,
           is_profile_public = $6
         WHERE user_id = $7
         RETURNING *`,
        [nextHomeCity, nextBio, nextMoto, nextExp, JSON.stringify(nextEc), nextPublic, req.user.id]
      );

      const hydratedProfile = await getHydratedRiderProfile(req.user.id, { includeRankHistory: true }, tx);
      return {
        updatedUser: mapUser(uRow, { includeEmail: true, includePhone: true }),
        updatedProfile: hydratedProfile,
      };
    });

    return res.json({
      success: true,
      message: 'Rider profile updated successfully.',
      data: {
        user: {
          _id: updatedUser.id,
          id: updatedUser.id,
          fullName: updatedUser.fullName,
          email: updatedUser.email,
          role: updatedUser.role,
          phoneNumber: updatedUser.phoneNumber,
          city: updatedUser.city,
          avatarUrl: updatedUser.avatarUrl,
        },
        riderProfile: updatedProfile,
      },
    });
  } catch (err) {
    next(err);
  }
}
