import { query, queryOne } from '../config/pg.js';
import {
  fetchBadgesByUserIds,
  getHydratedRiderProfile,
} from '../repositories/common.js';
import { mapAchievement } from '../repositories/mappers.js';
import {
  ACHIEVEMENT_CATALOG,
  buildAchievementProgressList,
  ensureAchievementCatalog,
} from '../utils/achievements.js';
import { RANK_TIERS } from '../utils/ranking.js';
import { isValidUuid } from '../utils/validators.js';

function sanitizeRiderRow(row, position, metricKm, metricExpeditions, badgeCount, extra = {}) {
  return {
    position,
    userId: row.user_id,
    handle: row.handle,
    fullName: row.full_name || 'Rider',
    avatarUrl: row.avatar_url || '',
    homeCity: row.home_city || '',
    primaryMotorcycle: row.primary_motorcycle || '',
    rank: row.rank || 'Beginner',
    verifiedKilometres: Number(metricKm || 0),
    completedExpeditions: Number(metricExpeditions || 0),
    badgeCount: Number(badgeCount || 0),
    isDemo: Boolean(row.is_demo),
    ...extra,
  };
}

export async function getLeaderboard(req, res, next) {
  try {
    const {
      category = 'global',
      period = '',
      organisationId = '',
      rideId = '',
      limit: rawLimit = '25',
    } = req.query;

    const limit = Math.min(50, Math.max(5, Number.parseInt(rawLimit, 10) || 25));

    if (category === 'global') {
      const profilesRes = await query(
        `SELECT rp.*, u.full_name, u.avatar_url
         FROM rider_profiles rp
         JOIN users u ON u.id = rp.user_id
         WHERE rp.is_profile_public <> FALSE
         ORDER BY rp.verified_kilometres DESC, rp.completed_expeditions DESC, rp.created_at ASC`
      );

      const userIds = profilesRes.rows.map((p) => p.user_id);
      const badgesMap = await fetchBadgesByUserIds(userIds);

      const entries = profilesRes.rows.map((p, idx) =>
        sanitizeRiderRow(
          p,
          idx + 1,
          p.verified_kilometres,
          p.completed_expeditions,
          (badgesMap.get(p.user_id) || []).length
        )
      );

      const myEntry = req.user
        ? entries.find((row) => String(row.userId) === String(req.user.id)) || null
        : null;

      return res.json({
        success: true,
        data: {
          category: 'global',
          periodKey: 'all-time',
          entries: entries.slice(0, limit),
          totalRanked: entries.length,
          myEntry,
        },
      });
    }

    if (category === 'monthly') {
      const now = new Date();
      const targetMonth = /^\d{4}-\d{2}$/.test(period)
        ? period
        : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const [y, m] = targetMonth.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));

      const aggRes = await query(
        `SELECT ts.user_id,
                SUM(ts.verified_distance_km)::numeric(10, 1) AS monthly_km,
                COUNT(*)::int AS sessions_count,
                rp.handle, rp.home_city, rp.primary_motorcycle, rp.rank,
                rp.completed_expeditions, rp.is_demo,
                u.full_name, u.avatar_url
         FROM tracking_sessions ts
         JOIN rider_profiles rp ON rp.user_id = ts.user_id AND rp.is_profile_public <> FALSE
         JOIN users u ON u.id = ts.user_id
         WHERE ts.status = 'completed'
           AND ts.verification_status = 'verified'
           AND ts.verified_distance_km > 0
           AND ts.ended_at >= $1 AND ts.ended_at < $2
         GROUP BY ts.user_id, rp.id, u.id
         ORDER BY monthly_km DESC, sessions_count DESC`,
        [start, end]
      );

      const badgesMap = await fetchBadgesByUserIds(aggRes.rows.map((r) => r.user_id));

      const entries = aggRes.rows.map((item, idx) =>
        sanitizeRiderRow(
          item,
          idx + 1,
          Number(Number(item.monthly_km || 0).toFixed(1)),
          item.completed_expeditions,
          (badgesMap.get(item.user_id) || []).length,
          { sessionsCount: item.sessions_count }
        )
      );

      const myEntry = req.user
        ? entries.find((row) => String(row.userId) === String(req.user.id)) || null
        : null;

      return res.json({
        success: true,
        data: {
          category: 'monthly',
          periodKey: targetMonth,
          entries: entries.slice(0, limit),
          totalRanked: entries.length,
          myEntry,
        },
      });
    }

    if (category === 'organisation') {
      if (!organisationId || !isValidUuid(String(organisationId))) {
        const orgsRes = await query(
          'SELECT id, name, slug, location, is_demo, is_verified FROM organisations ORDER BY name ASC'
        );
        const orgs = orgsRes.rows.map((o) => ({
          _id: o.id,
          id: o.id,
          name: o.name,
          slug: o.slug,
          location: o.location,
          isDemo: Boolean(o.is_demo),
          isVerified: Boolean(o.is_verified),
        }));
        return res.json({
          success: true,
          data: {
            category: 'organisation',
            organisations: orgs,
            entries: [],
            totalRanked: 0,
            myEntry: null,
          },
        });
      }

      const org = await queryOne(
        'SELECT id, name, slug, location, is_demo, is_verified FROM organisations WHERE id = $1',
        [organisationId]
      );
      if (!org) {
        return res.status(404).json({ success: false, message: 'Organisation not found.' });
      }

      const aggRes = await query(
        `SELECT rm.user_id,
                SUM(rm.verified_km_awarded)::numeric(10, 1) AS org_km,
                SUM(CASE WHEN rm.status = 'completed' THEN 1 ELSE 0 END)::int AS org_completed,
                rp.handle, rp.home_city, rp.primary_motorcycle, rp.rank,
                rp.verified_kilometres, rp.is_demo,
                u.full_name, u.avatar_url
         FROM ride_members rm
         JOIN rides r ON r.id = rm.ride_id
         JOIN rider_profiles rp ON rp.user_id = rm.user_id AND rp.is_profile_public <> FALSE
         JOIN users u ON u.id = rm.user_id
         WHERE r.organisation_id = $1 AND rm.status IN ('confirmed', 'completed')
         GROUP BY rm.user_id, rp.id, u.id`,
        [org.id]
      );

      const badgesMap = await fetchBadgesByUserIds(aggRes.rows.map((r) => r.user_id));

      const sorted = aggRes.rows
        .map((p) => ({
          profile: p,
          km: Number(p.org_km || 0),
          completed: Number(p.org_completed || 0),
          badgeCount: (badgesMap.get(p.user_id) || []).length,
        }))
        .sort(
          (a, b) =>
            b.km - a.km ||
            b.completed - a.completed ||
            Number(b.profile.verified_kilometres || 0) - Number(a.profile.verified_kilometres || 0)
        );

      const entries = sorted.map((row, idx) =>
        sanitizeRiderRow(row.profile, idx + 1, row.km, row.completed, row.badgeCount)
      );

      const myEntry = req.user
        ? entries.find((row) => String(row.userId) === String(req.user.id)) || null
        : null;

      return res.json({
        success: true,
        data: {
          category: 'organisation',
          organisation: {
            _id: org.id,
            id: org.id,
            name: org.name,
            slug: org.slug,
            location: org.location,
            isDemo: Boolean(org.is_demo),
            isVerified: Boolean(org.is_verified),
          },
          entries: entries.slice(0, limit),
          totalRanked: entries.length,
          myEntry,
        },
      });
    }

    if (category === 'expedition') {
      if (!rideId || !isValidUuid(String(rideId))) {
        const ridesRes = await query(
          `SELECT id, title, slug, region, distance_km, status
           FROM rides
           WHERE status <> 'draft'
           ORDER BY start_date DESC`
        );
        const rides = ridesRes.rows.map((r) => ({
          _id: r.id,
          id: r.id,
          title: r.title,
          slug: r.slug,
          region: r.region,
          distanceKm: r.distance_km,
          status: r.status,
        }));
        return res.json({
          success: true,
          data: {
            category: 'expedition',
            rides,
            entries: [],
            totalRanked: 0,
            myEntry: null,
          },
        });
      }

      const ride = await queryOne(
        'SELECT id, title, slug, region, distance_km FROM rides WHERE id = $1',
        [rideId]
      );
      if (!ride) {
        return res.status(404).json({ success: false, message: 'Expedition not found.' });
      }

      const [membersRes, cpAggRes, sessRes] = await Promise.all([
        query(
          `SELECT rm.user_id, rm.status, rm.verified_km_awarded
           FROM ride_members rm
           WHERE rm.ride_id = $1 AND rm.status IN ('confirmed', 'completed')`,
          [ride.id]
        ),
        query(
          `SELECT user_id, COUNT(*)::int AS count
           FROM checkpoint_arrivals
           WHERE ride_id = $1 AND verified = TRUE
           GROUP BY user_id`,
          [ride.id]
        ),
        query(
          `SELECT user_id, SUM(verified_distance_km)::numeric(10, 1) AS total_km
           FROM tracking_sessions
           WHERE ride_id = $1 AND status = 'completed' AND verification_status = 'verified'
           GROUP BY user_id`,
          [ride.id]
        ),
      ]);

      const cpCountMap = new Map(cpAggRes.rows.map((c) => [c.user_id, c.count]));
      const sessKmMap = new Map(sessRes.rows.map((s) => [s.user_id, Number(s.total_km || 0)]));
      const memberMap = new Map(membersRes.rows.map((m) => [m.user_id, m]));

      const candidateUserIds = Array.from(
        new Set([
          ...membersRes.rows.map((m) => m.user_id),
          ...cpAggRes.rows.map((c) => c.user_id),
          ...sessRes.rows.map((s) => s.user_id),
        ])
      );

      let profileRows = [];
      if (candidateUserIds.length > 0) {
        const profRes = await query(
          `SELECT rp.user_id, rp.handle, rp.home_city, rp.primary_motorcycle, rp.rank,
                  rp.completed_expeditions, rp.is_demo,
                  u.full_name, u.avatar_url
           FROM rider_profiles rp
           JOIN users u ON u.id = rp.user_id
           WHERE rp.user_id = ANY($1::uuid[]) AND rp.is_profile_public <> FALSE`,
          [candidateUserIds]
        );
        profileRows = profRes.rows;
      }

      const badgesMap = await fetchBadgesByUserIds(profileRows.map((p) => p.user_id));

      const sorted = profileRows
        .map((p) => {
          const rm = memberMap.get(p.user_id);
          const verifiedKm = Number(rm?.verified_km_awarded || 0) + (sessKmMap.get(p.user_id) || 0);
          const cpCount = cpCountMap.get(p.user_id) || 0;
          return {
            profile: p,
            verifiedKm: Number(verifiedKm.toFixed(1)),
            checkpointsCompleted: cpCount,
            status: rm?.status || 'completed',
            badgeCount: (badgesMap.get(p.user_id) || []).length,
          };
        })
        .sort((a, b) => b.checkpointsCompleted - a.checkpointsCompleted || b.verifiedKm - a.verifiedKm);

      const entries = sorted.map((row, idx) =>
        sanitizeRiderRow(
          row.profile,
          idx + 1,
          row.verifiedKm,
          row.profile.completed_expeditions,
          row.badgeCount,
          { checkpointsCompleted: row.checkpointsCompleted, participationStatus: row.status }
        )
      );

      const myEntry = req.user
        ? entries.find((row) => String(row.userId) === String(req.user.id)) || null
        : null;

      return res.json({
        success: true,
        data: {
          category: 'expedition',
          ride: {
            _id: ride.id,
            id: ride.id,
            title: ride.title,
            slug: ride.slug,
            region: ride.region,
            distanceKm: ride.distance_km,
          },
          entries: entries.slice(0, limit),
          totalRanked: entries.length,
          myEntry,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid leaderboard category. Use global, monthly, organisation, or expedition.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getAchievementDefinitions(_req, res, next) {
  try {
    await ensureAchievementCatalog();
    const defsRes = await query('SELECT * FROM achievements ORDER BY criteria_km ASC, criteria_rides ASC');
    const definitions = defsRes.rows.map((a) => mapAchievement(a));
    return res.json({
      success: true,
      data: {
        achievements: definitions.length ? definitions : ACHIEVEMENT_CATALOG,
        tiers: RANK_TIERS,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyAchievements(req, res, next) {
  try {
    await ensureAchievementCatalog();
    const [profile, defsRes, cpRes] = await Promise.all([
      getHydratedRiderProfile(req.user.id, { includeRankHistory: true }),
      query('SELECT * FROM achievements ORDER BY criteria_km ASC, criteria_rides ASC'),
      queryOne('SELECT COUNT(*)::int AS cnt FROM checkpoint_arrivals WHERE user_id = $1 AND verified = TRUE', [
        req.user.id,
      ]),
    ]);

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Rider profile not found.' });
    }

    const definitions = defsRes.rows.map((a) => mapAchievement(a));
    const list = buildAchievementProgressList(
      profile,
      cpRes?.cnt || 0,
      definitions.length ? definitions : ACHIEVEMENT_CATALOG
    );

    return res.json({
      success: true,
      data: {
        items: list,
        achievements: list,
        earnedCount: list.filter((a) => a.earned).length,
        totalCount: list.length,
        currentRank: profile.rank,
        rankHistory: profile.rankHistory || [],
        tiers: RANK_TIERS,
      },
    });
  } catch (err) {
    next(err);
  }
}
