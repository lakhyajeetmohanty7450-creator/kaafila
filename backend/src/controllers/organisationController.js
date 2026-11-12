import { query, queryOne, transaction } from '../config/pg.js';
import {
  escapeIlike,
  fetchUsersMap,
  findOrganisationBySlugOrId,
} from '../repositories/common.js';
import {
  mapOrganisation,
  mapReview,
  mapRide,
  mapRideMember,
} from '../repositories/mappers.js';
import { isValidHttpUrl, isValidImageUrl, isValidUuid, parsePagination } from '../utils/validators.js';

const ACTIVE_RIDE_STATUSES = ['published', 'upcoming', 'ongoing'];

async function buildOrganisationAnalytics(organisationId) {
  const [orgRidesRes, statusAggRes] = await Promise.all([
    query('SELECT * FROM rides WHERE organisation_id = $1 ORDER BY start_date ASC', [organisationId]),
    query('SELECT status, COUNT(*)::int AS count FROM rides WHERE organisation_id = $1 GROUP BY status', [
      organisationId,
    ]),
  ]);

  const orgRides = orgRidesRes.rows.map((r) => mapRide(r));
  const rideIds = orgRides.map((r) => r.id);

  let memberAggRows = [];
  if (rideIds.length > 0) {
    const memberAggRes = await query(
      `SELECT ride_id, status, COUNT(*)::int AS count
       FROM ride_members
       WHERE ride_id = ANY($1::uuid[])
       GROUP BY ride_id, status`,
      [rideIds]
    );
    memberAggRows = memberAggRes.rows;
  }

  const memberCountByRide = new Map();
  for (const row of memberAggRows) {
    const key = row.ride_id;
    if (!memberCountByRide.has(key)) {
      memberCountByRide.set(key, { interested: 0, confirmed: 0, completed: 0, cancelled: 0 });
    }
    memberCountByRide.get(key)[row.status] = row.count;
  }

  const statusBreakdown = { draft: 0, published: 0, upcoming: 0, ongoing: 0, completed: 0, cancelled: 0 };
  for (const row of statusAggRes.rows) {
    if (statusBreakdown[row.status] !== undefined) {
      statusBreakdown[row.status] = row.count;
    }
  }

  let totalInterestedRiders = 0;
  let totalConfirmedRiders = 0;
  let totalCompletedParticipants = 0;
  let activeExpeditions = 0;

  const expeditionWiseParticipation = orgRides.map((ride) => {
    const counts = memberCountByRide.get(ride.id) || { interested: 0, confirmed: 0, completed: 0, cancelled: 0 };
    totalInterestedRiders += counts.interested;
    totalConfirmedRiders += counts.confirmed;
    totalCompletedParticipants += counts.completed;
    if (ACTIVE_RIDE_STATUSES.includes(ride.status)) activeExpeditions += 1;

    return {
      _id: ride.id,
      rideId: ride.id,
      title: ride.title,
      slug: ride.slug,
      region: ride.region,
      status: ride.status,
      startDate: ride.startDate,
      maxRiders: ride.maxRiders,
      spotsRemaining: ride.spotsRemaining,
      distanceKm: ride.distanceKm,
      ...counts,
      totalActiveInterest: counts.interested + counts.confirmed + counts.completed,
    };
  });

  return {
    orgRides,
    statusBreakdown,
    expeditionWiseParticipation,
    summary: {
      totalExpeditions: orgRides.length,
      totalPublishedExpeditions: orgRides.length - statusBreakdown.draft,
      activeExpeditions,
      completedExpeditions: statusBreakdown.completed,
      draftExpeditions: statusBreakdown.draft,
      totalInterestedRiders,
      totalConfirmedRiders,
      totalCompletedParticipants,
      recordedRegistrations: totalInterestedRiders + totalConfirmedRiders + totalCompletedParticipants,
      confirmedRegistrations: totalConfirmedRiders,
      totalRidersEngaged: totalInterestedRiders + totalConfirmedRiders + totalCompletedParticipants,
    },
  };
}

export async function listOrganisations(req, res, next) {
  try {
    const { search = '', region = '', location = '', verified = '' } = req.query;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 12, maxLimit: 50 });

    const conditions = [];
    const params = [];

    if (search.trim()) {
      const pattern = `%${escapeIlike(search.trim())}%`;
      params.push(pattern);
      const pIdx = params.length;
      conditions.push(`(
        name ILIKE $${pIdx}
        OR short_description ILIKE $${pIdx}
        OR COALESCE(location->>'city', '') ILIKE $${pIdx}
        OR COALESCE(location->>'region', '') ILIKE $${pIdx}
        OR EXISTS (SELECT 1 FROM unnest(operating_regions) reg WHERE reg ILIKE $${pIdx})
      )`);
    }

    const regionOrLocation = String(region || location || '').trim();
    if (regionOrLocation && regionOrLocation !== 'all') {
      const pattern = `%${escapeIlike(regionOrLocation)}%`;
      params.push(pattern);
      const pIdx = params.length;
      conditions.push(`(
        EXISTS (SELECT 1 FROM unnest(operating_regions) reg WHERE reg ILIKE $${pIdx})
        OR COALESCE(location->>'city', '') ILIKE $${pIdx}
        OR COALESCE(location->>'state', '') ILIKE $${pIdx}
        OR COALESCE(location->>'region', '') ILIKE $${pIdx}
      )`);
    }

    if (verified === 'true') {
      conditions.push('is_verified = TRUE');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataParams = [...params, limit, skip];
    const [orgRes, countRes] = await Promise.all([
      query(
        `SELECT * FROM organisations
         ${whereClause}
         ORDER BY is_verified DESC, rating_average DESC, created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        dataParams
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM organisations ${whereClause}`, params),
    ]);

    const organisations = orgRes.rows.map((r) => mapOrganisation(r));
    const orgIds = organisations.map((o) => o.id);

    const rideCountMap = new Map();
    if (orgIds.length > 0) {
      const rcRes = await query(
        `SELECT organisation_id, COUNT(*)::int AS count
         FROM rides
         WHERE organisation_id = ANY($1::uuid[]) AND status <> 'draft'
         GROUP BY organisation_id`,
        [orgIds]
      );
      for (const row of rcRes.rows) {
        rideCountMap.set(row.organisation_id, row.count);
      }
    }

    const enriched = organisations.map((org) => {
      const cnt = rideCountMap.get(org.id) || 0;
      return {
        ...org,
        availableRidesCount: cnt,
        rideCount: cnt,
      };
    });

    const total = countRes?.total || 0;

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

export async function getOrganisationBySlug(req, res, next) {
  try {
    const organisation = await findOrganisationBySlugOrId(req.params.slugOrId);
    if (!organisation) {
      return res.status(404).json({ success: false, message: 'Organisation not found.' });
    }

    const [ridesRes, reviewsRes] = await Promise.all([
      query(
        `SELECT * FROM rides
         WHERE organisation_id = $1 AND status <> 'draft'
         ORDER BY is_featured DESC, start_date ASC`,
        [organisation.id]
      ),
      query(
        `SELECT rev.*,
           u.full_name AS author_full_name, u.avatar_url AS author_avatar_url, u.city AS author_city,
           r.title AS ride_title, r.slug AS ride_slug
         FROM reviews rev
         JOIN users u ON u.id = rev.author_id
         LEFT JOIN rides r ON r.id = rev.ride_id
         WHERE rev.organisation_id = $1
         ORDER BY rev.created_at DESC
         LIMIT 20`,
        [organisation.id]
      ),
    ]);

    const rides = ridesRes.rows.map((r) => mapRide(r));
    const reviews = reviewsRes.rows.map((row) =>
      mapReview(row, {
        author: {
          _id: row.author_id,
          id: row.author_id,
          fullName: row.author_full_name,
          avatarUrl: row.author_avatar_url || '',
          city: row.author_city || '',
        },
        ride: row.ride_id ? { _id: row.ride_id, id: row.ride_id, title: row.ride_title, slug: row.ride_slug } : null,
      })
    );

    return res.json({
      success: true,
      data: {
        organisation,
        expeditions: rides,
        rides,
        reviews,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyOrganisationDashboard(req, res, next) {
  try {
    const orgRow = await queryOne('SELECT * FROM organisations WHERE owner_id = $1 LIMIT 1', [req.user.id]);
    if (!orgRow) {
      return res.status(404).json({ success: false, message: 'Organisation profile not found for this account.' });
    }
    const organisation = mapOrganisation(orgRow);

    const [analyticsBundle, recentReviewsRes] = await Promise.all([
      buildOrganisationAnalytics(organisation.id),
      query(
        `SELECT rev.*, u.full_name AS author_full_name, u.avatar_url AS author_avatar_url,
                r.title AS ride_title, r.slug AS ride_slug
         FROM reviews rev
         JOIN users u ON u.id = rev.author_id
         LEFT JOIN rides r ON r.id = rev.ride_id
         WHERE rev.organisation_id = $1
         ORDER BY rev.created_at DESC
         LIMIT 5`,
        [organisation.id]
      ),
    ]);

    const recentReviews = recentReviewsRes.rows.map((row) =>
      mapReview(row, {
        author: {
          _id: row.author_id,
          id: row.author_id,
          fullName: row.author_full_name,
          avatarUrl: row.author_avatar_url || '',
        },
        ride: row.ride_id ? { _id: row.ride_id, id: row.ride_id, title: row.ride_title, slug: row.ride_slug } : null,
      })
    );

    return res.json({
      success: true,
      data: {
        organisation,
        rides: analyticsBundle.orgRides,
        recentReviews,
        stats: {
          ...analyticsBundle.summary,
          totalRides: analyticsBundle.summary.totalExpeditions,
          activeRides: analyticsBundle.summary.activeExpeditions,
          totalInterested: analyticsBundle.summary.totalInterestedRiders,
          totalConfirmed: analyticsBundle.summary.totalConfirmedRiders,
          totalCompleted: analyticsBundle.summary.totalCompletedParticipants,
          ratingAverage: organisation.ratingAverage,
          reviewCount: organisation.reviewCount,
          verificationStatus: organisation.verificationStatus,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateOrganisation(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid organisation ID.' });
    }

    const orgRow = await queryOne('SELECT * FROM organisations WHERE id = $1', [id]);
    if (!orgRow) {
      return res.status(404).json({ success: false, message: 'Organisation not found.' });
    }

    if (orgRow.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not own this organisation profile.' });
    }

    const {
      name,
      shortDescription,
      about,
      logoUrl,
      coverImageUrl,
      officialWebsite,
      bookingUrl,
      contactNumber,
      foundedYear,
      operatingRegions,
      location,
      facilities,
    } = req.body;

    if (officialWebsite && !isValidHttpUrl(officialWebsite)) {
      return res.status(400).json({ success: false, message: 'Official website must be a valid http/https URL.' });
    }
    if (bookingUrl && !isValidHttpUrl(bookingUrl)) {
      return res.status(400).json({ success: false, message: 'Booking URL must be a valid http/https URL.' });
    }
    if (logoUrl && !isValidImageUrl(logoUrl)) {
      return res.status(400).json({ success: false, message: 'Logo must be a valid image URL or uploaded image.' });
    }
    if (coverImageUrl && !isValidImageUrl(coverImageUrl)) {
      return res.status(400).json({ success: false, message: 'Cover image must be a valid image URL or uploaded image.' });
    }

    const nextName = name !== undefined ? String(name).trim() : orgRow.name;
    const nextShort = shortDescription !== undefined ? String(shortDescription).trim() : orgRow.short_description;
    const nextAbout = about !== undefined ? String(about).trim() : orgRow.about;
    const nextLogo = logoUrl !== undefined ? String(logoUrl).trim() : orgRow.logo_url;
    const nextCover = coverImageUrl !== undefined ? String(coverImageUrl).trim() : orgRow.cover_image_url;
    const nextWebsite = officialWebsite !== undefined ? String(officialWebsite).trim() : orgRow.official_website;
    const nextBooking = bookingUrl !== undefined ? String(bookingUrl).trim() : orgRow.booking_url;
    const nextContact = contactNumber !== undefined ? String(contactNumber).trim() : orgRow.contact_number;
    const nextFounded = foundedYear !== undefined ? (foundedYear ? Number(foundedYear) : null) : orgRow.founded_year;
    const nextRegions = Array.isArray(operatingRegions)
      ? operatingRegions.map((r) => String(r).trim()).filter(Boolean)
      : orgRow.operating_regions;
    const nextLocation = location && typeof location === 'object' ? { ...orgRow.location, ...location } : orgRow.location;
    const nextFacilities = facilities && typeof facilities === 'object' ? { ...orgRow.facilities, ...facilities } : orgRow.facilities;

    const updated = await queryOne(
      `UPDATE organisations SET
         name = $1,
         short_description = $2,
         about = $3,
         logo_url = $4,
         cover_image_url = $5,
         official_website = $6,
         booking_url = $7,
         contact_number = $8,
         founded_year = $9,
         operating_regions = $10::text[],
         location = $11::jsonb,
         facilities = $12::jsonb
       WHERE id = $13
       RETURNING *`,
      [
        nextName,
        nextShort,
        nextAbout,
        nextLogo,
        nextCover,
        nextWebsite,
        nextBooking,
        nextContact,
        nextFounded,
        nextRegions,
        JSON.stringify(nextLocation),
        JSON.stringify(nextFacilities),
        id,
      ]
    );

    return res.json({
      success: true,
      message: 'Organisation profile updated successfully.',
      data: mapOrganisation(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function createOrganisationReview(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid organisation ID.' });
    }

    const orgRow = await queryOne('SELECT * FROM organisations WHERE id = $1', [id]);
    if (!orgRow) {
      return res.status(404).json({ success: false, message: 'Organisation not found.' });
    }

    const { rating, title, comment, rideId } = req.body;
    const numericRating = Number(rating);

    if (!numericRating || numericRating < 1 || numericRating > 5 || !title || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Rating (1 to 5), title, and comment are required.',
      });
    }

    const validRideId = rideId && isValidUuid(String(rideId)) ? String(rideId) : null;

    const { reviewDto, ratingAverage, reviewCount } = await transaction(async (tx) => {
      const participation = await tx.queryOne(
        `SELECT rm.id FROM ride_members rm
         JOIN rides r ON r.id = rm.ride_id
         WHERE r.organisation_id = $1 AND rm.user_id = $2 AND rm.status IN ('confirmed', 'completed')
         LIMIT 1`,
        [orgRow.id, req.user.id]
      );

      const savedReview = await tx.queryOne(
        `INSERT INTO reviews (organisation_id, author_id, ride_id, rating, title, comment, is_verified_participant)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organisation_id, author_id)
         DO UPDATE SET
           ride_id = EXCLUDED.ride_id,
           rating = EXCLUDED.rating,
           title = EXCLUDED.title,
           comment = EXCLUDED.comment,
           is_verified_participant = EXCLUDED.is_verified_participant
         RETURNING *`,
        [
          orgRow.id,
          req.user.id,
          validRideId,
          Math.round(numericRating),
          String(title).trim(),
          String(comment).trim(),
          Boolean(participation),
        ]
      );

      const statsRow = await tx.queryOne(
        `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS review_count
         FROM reviews WHERE organisation_id = $1`,
        [orgRow.id]
      );

      const nextAvg = statsRow ? Number(statsRow.avg_rating || 0) : 0;
      const nextCount = statsRow ? Number(statsRow.review_count || 0) : 0;

      await tx.query(
        'UPDATE organisations SET rating_average = $1, review_count = $2 WHERE id = $3',
        [nextAvg, nextCount, orgRow.id]
      );

      return {
        reviewDto: mapReview(savedReview, {
          author: {
            _id: req.user.id,
            id: req.user.id,
            fullName: req.user.fullName,
            avatarUrl: req.user.avatarUrl,
            city: req.user.city,
          },
        }),
        ratingAverage: nextAvg,
        reviewCount: nextCount,
      };
    });

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully.',
      data: {
        review: reviewDto,
        ratingAverage,
        reviewCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyOrganisationParticipants(req, res, next) {
  try {
    const orgRow = await queryOne('SELECT * FROM organisations WHERE owner_id = $1 LIMIT 1', [req.user.id]);
    if (!orgRow) {
      return res.status(404).json({ success: false, message: 'Organisation profile not found for this account.' });
    }

    const { rideId = '', status = 'all' } = req.query;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20, maxLimit: 50 });

    const ridesRes = await query(
      'SELECT id, title, slug, start_date, distance_km, status, spots_remaining, max_riders FROM rides WHERE organisation_id = $1 ORDER BY start_date ASC',
      [orgRow.id]
    );

    const orgRides = ridesRes.rows.map((r) => ({
      _id: r.id,
      id: r.id,
      title: r.title,
      slug: r.slug,
      startDate: r.start_date,
      distanceKm: r.distance_km,
      status: r.status,
      spotsRemaining: r.spots_remaining,
      maxRiders: r.max_riders,
    }));

    const rideIds = orgRides.map((r) => r.id);
    if (rideIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        rides: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      });
    }

    const conditions = [];
    const params = [];

    if (rideId && rideId !== 'all') {
      if (!isValidUuid(String(rideId)) || !rideIds.includes(String(rideId))) {
        return res.status(404).json({ success: false, message: 'Expedition not found in your organisation.' });
      }
      params.push(String(rideId));
      conditions.push(`rm.ride_id = $${params.length}`);
    } else {
      params.push(rideIds);
      conditions.push(`rm.ride_id = ANY($${params.length}::uuid[])`);
    }

    if (status && status !== 'all' && ['interested', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      params.push(status);
      conditions.push(`rm.status = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const dataParams = [...params, limit, skip];

    const [membersRes, totalRes] = await Promise.all([
      query(
        `SELECT rm.*,
           r.title AS ride_title, r.slug AS ride_slug, r.start_date AS ride_start_date,
           r.distance_km AS ride_distance_km, r.status AS ride_status
         FROM ride_members rm
         JOIN rides r ON r.id = rm.ride_id
         ${whereClause}
         ORDER BY rm.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        dataParams
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM ride_members rm ${whereClause}`, params),
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

      const baseMember = mapRideMember(m, {
        ride: {
          _id: m.ride_id,
          id: m.ride_id,
          title: m.ride_title,
          slug: m.ride_slug,
          startDate: m.ride_start_date,
          distanceKm: m.ride_distance_km,
          status: m.ride_status,
        },
        user: safeUser,
      });

      return {
        ...baseMember,
        contactAuthorized,
        riderProfile: safeProfile,
      };
    });

    const total = totalRes?.total || 0;

    return res.json({
      success: true,
      data: enriched,
      rides: orgRides,
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

export async function getMyOrganisationAnalytics(req, res, next) {
  try {
    const orgRow = await queryOne('SELECT * FROM organisations WHERE owner_id = $1 LIMIT 1', [req.user.id]);
    if (!orgRow) {
      return res.status(404).json({ success: false, message: 'Organisation profile not found for this account.' });
    }
    const organisation = mapOrganisation(orgRow);

    const bundle = await buildOrganisationAnalytics(organisation.id);

    return res.json({
      success: true,
      data: {
        organisation: {
          _id: organisation.id,
          id: organisation.id,
          name: organisation.name,
          verificationStatus: organisation.verificationStatus,
          isVerified: organisation.isVerified,
          isDemo: organisation.isDemo,
        },
        summary: bundle.summary,
        statusBreakdown: bundle.statusBreakdown,
        expeditionWiseParticipation: bundle.expeditionWiseParticipation,
      },
    });
  } catch (err) {
    next(err);
  }
}
