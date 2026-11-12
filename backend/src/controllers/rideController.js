import { query, queryOne, transaction } from '../config/pg.js';
import {
  escapeIlike,
  fetchUsersMap,
  findRideWithOrgBySlugOrId,
} from '../repositories/common.js';
import {
  mapOrganisation,
  mapRide,
  mapRideMember,
} from '../repositories/mappers.js';
import { evaluateAndAwardAchievements } from '../utils/achievements.js';
import { getSocketIO } from '../utils/notify.js';
import { isValidHttpUrl, isValidImageUrl, isValidUuid, parsePagination } from '../utils/validators.js';
import { toSlug, uniqueSlug } from '../utils/slugify.js';

const ACTIVE_RIDE_STATUSES = ['published', 'upcoming', 'ongoing'];
const VALID_RIDE_STATUSES = ['draft', 'published', 'upcoming', 'ongoing', 'completed', 'cancelled'];

function normalizeItinerary(itinerary) {
  if (!Array.isArray(itinerary)) return [];
  return itinerary
    .filter((day) => day && (String(day.title || '').trim() || String(day.description || '').trim()))
    .map((day, idx) => ({
      day: Math.max(1, Number(day.day ?? day.dayNumber) || idx + 1),
      title: String(day.title || `Day ${idx + 1}`).trim(),
      route: String(day.route || day.title || `Day ${idx + 1} Route`).trim(),
      description: String(day.description || day.title || 'Riding day').trim(),
      altitudeMeters:
        day.altitudeMeters !== undefined && day.altitudeMeters !== '' && !Number.isNaN(Number(day.altitudeMeters))
          ? Number(day.altitudeMeters)
          : undefined,
      distanceKm:
        day.distanceKm !== undefined && day.distanceKm !== '' && !Number.isNaN(Number(day.distanceKm))
          ? Number(day.distanceKm)
          : undefined,
    }));
}

export async function listRides(req, res, next) {
  try {
    const { search = '', region = '', difficulty = '', featured = '', status = 'active' } = req.query;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 24, maxLimit: 50 });

    const conditions = [];
    const params = [];

    if (status === 'active') {
      params.push(ACTIVE_RIDE_STATUSES);
      conditions.push(`r.status = ANY($${params.length}::text[])`);
    } else if (status === 'all') {
      conditions.push(`r.status <> 'draft'`);
    } else if (VALID_RIDE_STATUSES.includes(status) && status !== 'draft') {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    } else {
      params.push(ACTIVE_RIDE_STATUSES);
      conditions.push(`r.status = ANY($${params.length}::text[])`);
    }

    if (search.trim()) {
      const pattern = `%${escapeIlike(search.trim())}%`;
      params.push(pattern);
      const pIdx = params.length;
      conditions.push(`(
        r.title ILIKE $${pIdx}
        OR r.region ILIKE $${pIdx}
        OR r.start_location ILIKE $${pIdx}
        OR r.end_location ILIKE $${pIdx}
        OR r.tagline ILIKE $${pIdx}
      )`);
    }

    if (region.trim() && region !== 'all') {
      params.push(`%${escapeIlike(region.trim())}%`);
      conditions.push(`r.region ILIKE $${params.length}`);
    }

    if (difficulty.trim() && difficulty !== 'all') {
      params.push(difficulty.toLowerCase());
      conditions.push(`r.difficulty = $${params.length}`);
    }

    if (featured === 'true') {
      conditions.push('r.is_featured = TRUE');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataParams = [...params, limit, skip];

    const [ridesRes, countRes] = await Promise.all([
      query(
        `SELECT r.*, row_to_json(o.*) AS org_row
         FROM rides r
         JOIN organisations o ON o.id = r.organisation_id
         ${whereClause}
         ORDER BY r.is_featured DESC, r.start_date ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        dataParams
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM rides r ${whereClause}`, params),
    ]);

    const rides = ridesRes.rows.map((row) => {
      const org = row.org_row ? mapOrganisation(row.org_row) : null;
      return mapRide(row, {
        organisation: org
          ? {
              _id: org.id,
              id: org.id,
              name: org.name,
              slug: org.slug,
              location: org.location,
              isVerified: org.isVerified,
              isDemo: org.isDemo,
              bookingUrl: org.bookingUrl,
              officialWebsite: org.officialWebsite,
              logoUrl: org.logoUrl,
            }
          : null,
      });
    });

    const total = countRes?.total || 0;

    return res.json({
      success: true,
      data: rides,
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

export async function getRideBySlug(req, res, next) {
  try {
    const ride = await findRideWithOrgBySlugOrId(req.params.slugOrId);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Expedition not found.' });
    }

    if (ride.status === 'draft') {
      const isOwner =
        req.user &&
        (String(ride.organisation?.owner || '') === String(req.user.id) || req.user.role === 'admin');
      if (!isOwner) {
        return res.status(404).json({ success: false, message: 'Expedition not found.' });
      }
    }

    const [statsRes, myRow] = await Promise.all([
      query(
        `SELECT status, COUNT(*)::int AS cnt
         FROM ride_members
         WHERE ride_id = $1 AND status IN ('interested', 'confirmed', 'completed')
         GROUP BY status`,
        [ride.id]
      ),
      req.user
        ? queryOne('SELECT * FROM ride_members WHERE ride_id = $1 AND user_id = $2', [ride.id, req.user.id])
        : Promise.resolve(null),
    ]);

    let interestedCount = 0;
    let confirmedCount = 0;
    for (const s of statsRes.rows) {
      if (s.status === 'interested') interestedCount = s.cnt;
      if (s.status === 'confirmed' || s.status === 'completed') confirmedCount += s.cnt;
    }

    return res.json({
      success: true,
      data: {
        ...ride,
        participantStats: { interestedCount, confirmedCount },
        myParticipation: myRow ? mapRideMember(myRow) : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createRide(req, res, next) {
  try {
    const orgRow = await queryOne('SELECT * FROM organisations WHERE owner_id = $1 LIMIT 1', [req.user.id]);
    if (!orgRow && req.user.role !== 'admin') {
      return res.status(404).json({
        success: false,
        message: 'No organisation profile found for your account.',
      });
    }

    let targetOrgRow = orgRow;
    if (!targetOrgRow && req.body.organisationId && isValidUuid(String(req.body.organisationId))) {
      targetOrgRow = await queryOne('SELECT * FROM organisations WHERE id = $1', [req.body.organisationId]);
    }
    if (!targetOrgRow) {
      return res.status(400).json({ success: false, message: 'Target organisation not found.' });
    }

    const {
      title,
      tagline = '',
      description = '',
      region,
      startLocation,
      endLocation,
      maxAltitudeMeters,
      distanceKm,
      durationDays,
      difficulty = 'challenging',
      startDate,
      endDate,
      priceInr,
      priceOwnBikeInr,
      maxRiders = 12,
      coverImageUrl = '',
      bookingUrl = '',
      bikeRentalAvailable = true,
      facilitiesSummary = '',
      highlights = [],
      itinerary = [],
      inclusions = [],
      exclusions = [],
      status = 'published',
    } = req.body;

    if (!title || !region || !startLocation || !endLocation || !startDate || !endDate || priceInr === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Title, region, start/end locations, dates, and price are required.',
      });
    }

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ success: false, message: 'End date cannot be earlier than start date.' });
    }

    if (coverImageUrl && !isValidImageUrl(coverImageUrl)) {
      return res.status(400).json({ success: false, message: 'Cover image must be a valid image URL or uploaded image.' });
    }

    if (bookingUrl && !isValidHttpUrl(bookingUrl)) {
      return res.status(400).json({ success: false, message: 'Official booking URL must start with http:// or https://.' });
    }

    if (!VALID_RIDE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid expedition status.' });
    }

    let slug = toSlug(title);
    const existingSlug = await queryOne('SELECT id FROM rides WHERE LOWER(slug) = LOWER($1)', [slug]);
    if (existingSlug) {
      slug = uniqueSlug(title);
    }

    const maxRidersNum = Math.max(1, Number(maxRiders) || 12);
    const defaultRoute = {
      startPoint: { label: String(startLocation).trim() },
      endPoint: { label: String(endLocation).trim() },
      geometry: { type: 'LineString', coordinates: [] },
      dailySegments: [],
      routeDescription: '',
      calculatedDistanceKm: 0,
      hasRouteData: false,
    };

    const row = await queryOne(
      `INSERT INTO rides (
         organisation_id, title, slug, tagline, description, region,
         start_location, end_location, max_altitude_meters, distance_km, duration_days,
         difficulty, start_date, end_date, price_inr, price_own_bike_inr,
         max_riders, spots_remaining, cover_image_url, booking_url, bike_rental_available,
         facilities_summary, highlights, itinerary, route, inclusions, exclusions, status, is_demo
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16,
         $17, $18, $19, $20, $21,
         $22, $23::text[], $24::jsonb, $25::jsonb, $26::text[], $27::text[], $28, FALSE
       )
       RETURNING *`,
      [
        targetOrgRow.id,
        String(title).trim(),
        slug,
        String(tagline || '').trim(),
        String(description || '').trim(),
        String(region).trim(),
        String(startLocation).trim(),
        String(endLocation).trim(),
        Math.max(0, Number(maxAltitudeMeters) || 0),
        Math.max(1, Number(distanceKm) || 100),
        Math.max(1, Number(durationDays) || 1),
        difficulty,
        new Date(startDate),
        new Date(endDate),
        Math.max(0, Number(priceInr)),
        priceOwnBikeInr !== undefined && priceOwnBikeInr !== '' ? Math.max(0, Number(priceOwnBikeInr)) : null,
        maxRidersNum,
        maxRidersNum,
        coverImageUrl || targetOrgRow.cover_image_url || '/images/expedition-ladakh.png',
        String(bookingUrl || '').trim(),
        Boolean(bikeRentalAvailable),
        String(facilitiesSummary || '').trim(),
        Array.isArray(highlights) ? highlights.map((h) => String(h).trim()).filter(Boolean) : [],
        JSON.stringify(normalizeItinerary(itinerary)),
        JSON.stringify(defaultRoute),
        Array.isArray(inclusions) ? inclusions.map((i) => String(i).trim()).filter(Boolean) : [],
        Array.isArray(exclusions) ? exclusions.map((e) => String(e).trim()).filter(Boolean) : [],
        status,
      ]
    );

    return res.status(201).json({
      success: true,
      message: status === 'draft' ? 'Expedition saved as draft.' : 'Expedition published successfully.',
      data: mapRide(row),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateRide(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid expedition ID.' });
    }

    const existing = await findRideWithOrgBySlugOrId(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Expedition not found.' });
    }

    const isOwner = String(existing.organisation?.owner || '') === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not own this expedition.' });
    }

    if (req.body.coverImageUrl && !isValidImageUrl(req.body.coverImageUrl)) {
      return res.status(400).json({ success: false, message: 'Cover image must be a valid image URL or uploaded image.' });
    }

    if (req.body.bookingUrl && !isValidHttpUrl(req.body.bookingUrl)) {
      return res.status(400).json({ success: false, message: 'Official booking URL must start with http:// or https://.' });
    }

    if (req.body.status !== undefined && !VALID_RIDE_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: 'Invalid expedition status.' });
    }

    const b = req.body;
    const nextStart = b.startDate !== undefined ? new Date(b.startDate) : new Date(existing.startDate);
    const nextEnd = b.endDate !== undefined ? new Date(b.endDate) : new Date(existing.endDate);
    if (nextEnd < nextStart) {
      return res.status(400).json({ success: false, message: 'End date cannot be earlier than start date.' });
    }

    const nextItinerary = b.itinerary !== undefined ? normalizeItinerary(b.itinerary) : existing.itinerary;

    const updated = await queryOne(
      `UPDATE rides SET
         title = $1,
         tagline = $2,
         description = $3,
         region = $4,
         start_location = $5,
         end_location = $6,
         max_altitude_meters = $7,
         distance_km = $8,
         duration_days = $9,
         difficulty = $10,
         start_date = $11,
         end_date = $12,
         price_inr = $13,
         price_own_bike_inr = $14,
         max_riders = $15,
         spots_remaining = $16,
         cover_image_url = $17,
         booking_url = $18,
         bike_rental_available = $19,
         facilities_summary = $20,
         highlights = $21::text[],
         inclusions = $22::text[],
         exclusions = $23::text[],
         itinerary = $24::jsonb,
         status = $25
       WHERE id = $26
       RETURNING *`,
      [
        b.title !== undefined ? String(b.title).trim() : existing.title,
        b.tagline !== undefined ? String(b.tagline).trim() : existing.tagline,
        b.description !== undefined ? String(b.description).trim() : existing.description,
        b.region !== undefined ? String(b.region).trim() : existing.region,
        b.startLocation !== undefined ? String(b.startLocation).trim() : existing.startLocation,
        b.endLocation !== undefined ? String(b.endLocation).trim() : existing.endLocation,
        b.maxAltitudeMeters !== undefined ? Math.max(0, Number(b.maxAltitudeMeters) || 0) : existing.maxAltitudeMeters,
        b.distanceKm !== undefined ? Math.max(1, Number(b.distanceKm) || 1) : existing.distanceKm,
        b.durationDays !== undefined ? Math.max(1, Number(b.durationDays) || 1) : existing.durationDays,
        b.difficulty !== undefined ? b.difficulty : existing.difficulty,
        nextStart,
        nextEnd,
        b.priceInr !== undefined ? Math.max(0, Number(b.priceInr)) : existing.priceInr,
        b.priceOwnBikeInr !== undefined
          ? b.priceOwnBikeInr === '' || b.priceOwnBikeInr === null
            ? null
            : Math.max(0, Number(b.priceOwnBikeInr))
          : existing.priceOwnBikeInr ?? null,
        b.maxRiders !== undefined ? Math.max(1, Number(b.maxRiders) || 1) : existing.maxRiders,
        b.spotsRemaining !== undefined ? Math.max(0, Number(b.spotsRemaining)) : existing.spotsRemaining,
        b.coverImageUrl !== undefined ? b.coverImageUrl : existing.coverImageUrl,
        b.bookingUrl !== undefined ? b.bookingUrl : existing.bookingUrl,
        b.bikeRentalAvailable !== undefined ? Boolean(b.bikeRentalAvailable) : existing.bikeRentalAvailable,
        b.facilitiesSummary !== undefined ? String(b.facilitiesSummary).trim() : existing.facilitiesSummary,
        Array.isArray(b.highlights) ? b.highlights.map((x) => String(x).trim()).filter(Boolean) : existing.highlights,
        Array.isArray(b.inclusions) ? b.inclusions.map((x) => String(x).trim()).filter(Boolean) : existing.inclusions,
        Array.isArray(b.exclusions) ? b.exclusions.map((x) => String(x).trim()).filter(Boolean) : existing.exclusions,
        JSON.stringify(nextItinerary),
        b.status !== undefined ? b.status : existing.status,
        existing.id,
      ]
    );

    return res.json({
      success: true,
      message: 'Expedition updated successfully.',
      data: mapRide(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteRide(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid expedition ID.' });
    }

    const ride = await findRideWithOrgBySlugOrId(id);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Expedition not found.' });
    }

    const isOwner = String(ride.organisation?.owner || '') === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not own this expedition.' });
    }

    await transaction(async (tx) => {
      await tx.query('DELETE FROM checkpoint_arrivals WHERE ride_id = $1', [ride.id]);
      await tx.query('DELETE FROM checkpoints WHERE ride_id = $1', [ride.id]);
      await tx.query('DELETE FROM ride_members WHERE ride_id = $1', [ride.id]);
      await tx.query('DELETE FROM rides WHERE id = $1', [ride.id]);
    });

    return res.json({
      success: true,
      message: 'Expedition deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function participateInRide(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid expedition ID.' });
    }

    const rideRow = await queryOne('SELECT * FROM rides WHERE id = $1', [id]);
    if (!rideRow || rideRow.status === 'draft') {
      return res.status(404).json({ success: false, message: 'Expedition not found.' });
    }

    const { status = 'interested', bikeChoice = 'rental', shareContactWithOrganisation } = req.body;
    if (!['interested', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Riders may only mark interested or cancelled. Confirmed/completed status is set by the organisation.',
      });
    }

    const safeBikeChoice = ['rental', 'own_bike'].includes(bikeChoice) ? bikeChoice : 'rental';
    const existing = await queryOne('SELECT * FROM ride_members WHERE ride_id = $1 AND user_id = $2', [
      rideRow.id,
      req.user.id,
    ]);

    if (existing) {
      if (existing.status === 'completed') {
        return res.status(400).json({ success: false, message: 'Completed expeditions cannot be cancelled.' });
      }
      const updated = await queryOne(
        `UPDATE ride_members SET
           status = $1,
           bike_choice = $2,
           share_contact_with_organisation = $3
         WHERE id = $4
         RETURNING *`,
        [
          status,
          ['rental', 'own_bike'].includes(bikeChoice) ? bikeChoice : existing.bike_choice,
          typeof shareContactWithOrganisation === 'boolean'
            ? shareContactWithOrganisation
            : existing.share_contact_with_organisation,
          existing.id,
        ]
      );

      return res.json({
        success: true,
        message: status === 'interested' ? 'Interest recorded on your rider roster.' : 'Participation cancelled.',
        data: mapRideMember(updated),
      });
    }

    const created = await queryOne(
      `INSERT INTO ride_members (ride_id, user_id, status, bike_choice, share_contact_with_organisation)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [rideRow.id, req.user.id, status, safeBikeChoice, Boolean(shareContactWithOrganisation)]
    );

    return res.status(201).json({
      success: true,
      message: 'Interest recorded! Complete final booking on the organisation official site.',
      data: mapRideMember(created),
    });
  } catch (err) {
    next(err);
  }
}

export async function getRideParticipants(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid expedition ID.' });
    }

    const ride = await findRideWithOrgBySlugOrId(id);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Expedition not found.' });
    }

    const isOwner = String(ride.organisation?.owner || '') === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20, maxLimit: 50 });

    const [membersRes, totalRes] = await Promise.all([
      query(
        'SELECT * FROM ride_members WHERE ride_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [ride.id, limit, skip]
      ),
      queryOne('SELECT COUNT(*)::int AS total FROM ride_members WHERE ride_id = $1', [ride.id]),
    ]);

    const userIds = membersRes.rows.map((m) => m.user_id);
    const [usersMap, profilesRes] = await Promise.all([
      fetchUsersMap(userIds, { includeEmail: true, includePhone: true }),
      userIds.length > 0
        ? query(
            'SELECT user_id, handle, rank, verified_kilometres, primary_motorcycle, home_city, emergency_contact FROM rider_profiles WHERE user_id = ANY($1::uuid[])',
            [userIds]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const profileMap = new Map(profilesRes.rows.map((p) => [p.user_id, p]));

    const enriched = membersRes.rows.map((m) => {
      const u = usersMap.get(m.user_id) || null;
      const profile = profileMap.get(m.user_id) || null;
      const ec = profile?.emergency_contact || {};
      const contactAuthorized =
        ['confirmed', 'completed'].includes(m.status) &&
        Boolean(m.share_contact_with_organisation || ec.shareWithOrganisers);

      const safeUser = u
        ? {
            _id: u.id,
            id: u.id,
            fullName: u.fullName,
            avatarUrl: u.avatarUrl || '',
            city: u.city || '',
            ...(contactAuthorized ? { phoneNumber: u.phoneNumber || '', email: u.email || '' } : {}),
          }
        : null;

      const safeProfile = profile
        ? {
            handle: profile.handle,
            rank: profile.rank,
            verifiedKilometres: Number(profile.verified_kilometres || 0),
            primaryMotorcycle: profile.primary_motorcycle || '',
            homeCity: profile.home_city || '',
            ...(contactAuthorized && ec.shareWithOrganisers
              ? {
                  emergencyContact: {
                    name: ec.name || '',
                    relationship: ec.relationship || '',
                    phone: ec.phone || '',
                    bloodGroup: ec.bloodGroup || '',
                  },
                }
              : {}),
          }
        : null;

      return {
        ...mapRideMember(m, { user: safeUser }),
        contactAuthorized,
        riderProfile: safeProfile,
      };
    });

    const total = totalRes?.total || 0;

    return res.json({
      success: true,
      data: enriched,
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

export async function updateRideParticipantStatus(req, res, next) {
  try {
    const { id, memberId } = req.params;
    const { status } = req.body;

    if (!isValidUuid(id) || !isValidUuid(memberId)) {
      return res.status(400).json({ success: false, message: 'Invalid expedition or participant ID.' });
    }

    if (!['interested', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid participant status.' });
    }

    const ride = await findRideWithOrgBySlugOrId(id);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Expedition not found.' });
    }

    const isOwner = String(ride.organisation?.owner || '') === String(req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const result = await transaction(async (tx) => {
      const memberRow = await tx.queryOne(
        'SELECT * FROM ride_members WHERE id = $1 AND ride_id = $2 FOR UPDATE',
        [memberId, ride.id]
      );
      if (!memberRow) return null;

      const previousStatus = memberRow.status;
      let nextKmAwarded = Number(memberRow.verified_km_awarded || 0);
      let kmAwardedNow = 0;

      if (status === 'completed' && nextKmAwarded === 0 && (ride.organisation?.isVerified || isAdmin)) {
        kmAwardedNow = Number(ride.distanceKm || 0);
        nextKmAwarded = kmAwardedNow;

        const updatedProfile = await tx.queryOne(
          `UPDATE rider_profiles SET
             verified_kilometres = verified_kilometres + $1,
             completed_expeditions = completed_expeditions + 1
           WHERE user_id = $2
           RETURNING *`,
          [kmAwardedNow, memberRow.user_id]
        );

        if (updatedProfile) {
          await evaluateAndAwardAchievements({
            userId: memberRow.user_id,
            io: getSocketIO(),
            reason: 'expedition_completed',
            db: tx,
          });
        }
      }

      if (previousStatus !== 'confirmed' && status === 'confirmed' && ride.spotsRemaining > 0) {
        await tx.query(
          'UPDATE rides SET spots_remaining = GREATEST(0, spots_remaining - 1) WHERE id = $1',
          [ride.id]
        );
      } else if (previousStatus === 'confirmed' && status === 'cancelled' && ride.spotsRemaining < ride.maxRiders) {
        await tx.query(
          'UPDATE rides SET spots_remaining = LEAST(max_riders, spots_remaining + 1) WHERE id = $1',
          [ride.id]
        );
      }

      const updatedMember = await tx.queryOne(
        'UPDATE ride_members SET status = $1, verified_km_awarded = $2 WHERE id = $3 RETURNING *',
        [status, nextKmAwarded, memberRow.id]
      );

      return { updatedMember, kmAwardedNow };
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Participant record not found.' });
    }

    const { updatedMember, kmAwardedNow } = result;

    return res.json({
      success: true,
      message:
        kmAwardedNow > 0
          ? `Participant marked completed and awarded ${kmAwardedNow} verified km.`
          : status === 'completed' && !ride.organisation?.isVerified && !isAdmin
            ? 'Participant marked completed (verified km accrue only for verified organisations).'
            : `Participant status updated to ${status}.`,
      data: mapRideMember(updatedMember),
    });
  } catch (err) {
    next(err);
  }
}
