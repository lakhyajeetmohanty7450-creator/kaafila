import { query, queryOne } from '../config/pg.js';
import { getHydratedRiderProfile } from '../repositories/common.js';
import { mapNotification } from '../repositories/mappers.js';
import { computeRiderRank } from './ranking.js';

export const ACHIEVEMENT_CATALOG = [
  {
    code: 'FIRST_100_KM',
    title: 'First 100 KM',
    description: 'Logged your first 100 verified riding kilometres on KAAFILA.',
    tier: 'bronze',
    icon: 'route',
    criteriaKm: 100,
    criteriaRides: 0,
    criteriaCheckpoints: 0,
  },
  {
    code: 'FIRST_EXPEDITION',
    title: 'First Expedition',
    description: 'Completed your inaugural verified motorcycle expedition.',
    tier: 'bronze',
    icon: 'flag',
    criteriaKm: 0,
    criteriaRides: 1,
    criteriaCheckpoints: 0,
  },
  {
    code: 'FIRST_KAAFILA',
    title: 'First Kaafila',
    description: 'Completed a verified expedition and passed 500 verified kilometres.',
    tier: 'bronze',
    icon: 'compass',
    criteriaKm: 500,
    criteriaRides: 1,
    criteriaCheckpoints: 0,
  },
  {
    code: 'KM_500',
    title: '500 KM Rider',
    description: 'Crossed 500 verified riding kilometres across documented tours.',
    tier: 'bronze',
    icon: 'gauge',
    criteriaKm: 500,
    criteriaRides: 0,
    criteriaCheckpoints: 0,
  },
  {
    code: 'KM_1000',
    title: '1,000 KM Iron Saddle',
    description: 'Accumulated 1,000+ verified riding kilometres.',
    tier: 'silver',
    icon: 'shield',
    criteriaKm: 1000,
    criteriaRides: 0,
    criteriaCheckpoints: 0,
  },
  {
    code: 'CHECKPOINT_CHAMPION',
    title: 'Checkpoint Champion',
    description: 'Verified arrival at 3 or more official expedition checkpoints.',
    tier: 'silver',
    icon: 'map-pin',
    criteriaKm: 0,
    criteriaRides: 0,
    criteriaCheckpoints: 3,
  },
  {
    code: 'HIGH_PASS_5000',
    title: '5,000m Pass Conqueror',
    description: 'Conquered high-altitude terrain with 1,000+ verified km and 1 expedition.',
    tier: 'gold',
    icon: 'mountain',
    criteriaKm: 1000,
    criteriaRides: 1,
    criteriaCheckpoints: 0,
  },
  {
    code: 'SPITI_SURVIVOR',
    title: 'Spiti Canyon Runner',
    description: 'Completed 2 expeditions and 2,000+ verified mountain kilometres.',
    tier: 'silver',
    icon: 'flame',
    criteriaKm: 2000,
    criteriaRides: 2,
    criteriaCheckpoints: 0,
  },
  {
    code: 'MULTI_EXPEDITION_FINISHER',
    title: 'Multiple Expedition Finisher',
    description: 'Finished 3 or more verified touring expeditions.',
    tier: 'gold',
    icon: 'award',
    criteriaKm: 1500,
    criteriaRides: 3,
    criteriaCheckpoints: 0,
  },
  {
    code: 'MOUNTAIN_EXPLORER',
    title: 'Mountain Explorer',
    description: 'Logged 5,000+ verified kilometres across 4 expeditions.',
    tier: 'gold',
    icon: 'compass',
    criteriaKm: 5000,
    criteriaRides: 4,
    criteriaCheckpoints: 0,
  },
  {
    code: 'HIMALAYAN_LEGEND_20K',
    title: 'Summit Vanguard',
    description: 'Logged over 20,000 verified kilometres and 12 completed expeditions.',
    tier: 'legend',
    icon: 'crown',
    criteriaKm: 20000,
    criteriaRides: 12,
    criteriaCheckpoints: 0,
  },
];

export async function ensureAchievementCatalog(db = null) {
  const runner = db || { query };
  for (const def of ACHIEVEMENT_CATALOG) {
    await runner.query(
      `INSERT INTO achievements
         (code, title, description, tier, icon, criteria_km, criteria_rides, criteria_checkpoints)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (code) DO NOTHING`,
      [
        def.code,
        def.title,
        def.description,
        def.tier,
        def.icon,
        def.criteriaKm,
        def.criteriaRides,
        def.criteriaCheckpoints || 0,
      ]
    );
  }
}

export async function evaluateAndAwardAchievements({
  userId,
  riderProfile = null,
  io = null,
  emitNotifications = true,
  reason = 'activity_update',
  db = null,
}) {
  const runner = db || { query, queryOne };
  const uid = String(userId || riderProfile?.userId || riderProfile?.user?._id || riderProfile?.user || '');
  if (!uid) return { newlyAwarded: [], rankChanged: false, profile: null };

  const profileRow = await runner.queryOne('SELECT * FROM rider_profiles WHERE user_id = $1', [uid]);
  if (!profileRow) return { newlyAwarded: [], rankChanged: false, profile: null };

  const [cpRes, existingBadgesRes] = await Promise.all([
    runner.queryOne(
      'SELECT COUNT(*)::int AS cnt FROM checkpoint_arrivals WHERE user_id = $1 AND verified = TRUE',
      [uid]
    ),
    runner.query(
      'SELECT achievement_code, title, awarded_at FROM rider_achievements WHERE user_id = $1 ORDER BY awarded_at ASC',
      [uid]
    ),
  ]);

  const verifiedCheckpoints = Number(cpRes?.cnt || 0);
  const km = Number(profileRow.verified_kilometres || 0);
  const rides = Number(profileRow.completed_expeditions || 0);

  const existingCodes = new Set(existingBadgesRes.rows.map((b) => String(b.achievement_code).toUpperCase()));
  const newlyAwarded = [];

  for (const def of ACHIEVEMENT_CATALOG) {
    if (existingCodes.has(def.code)) continue;
    const meetsKm = km >= (def.criteriaKm || 0);
    const meetsRides = rides >= (def.criteriaRides || 0);
    const meetsCp = verifiedCheckpoints >= (def.criteriaCheckpoints || 0);

    if (meetsKm && meetsRides && meetsCp) {
      await runner.query(
        `INSERT INTO rider_achievements (user_id, achievement_code, title, awarded_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, achievement_code) DO NOTHING`,
        [uid, def.code, def.title]
      );
      existingCodes.add(def.code);
      newlyAwarded.push(def);
    }
  }

  const totalBadgeCount = existingCodes.size;
  const prevRank = profileRow.rank || 'Beginner';
  const nextRank = computeRiderRank(km, rides, totalBadgeCount);
  const rankChanged = nextRank !== prevRank;

  if (rankChanged) {
    await runner.query('UPDATE rider_profiles SET rank = $1 WHERE user_id = $2', [nextRank, uid]);
    await runner.query(
      `INSERT INTO rider_rank_history
         (user_id, from_rank, to_rank, verified_kilometres, completed_expeditions, achievement_count, reason, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [uid, prevRank, nextRank, km, rides, totalBadgeCount, reason]
    );
  }

  if (emitNotifications) {
    for (const def of newlyAwarded) {
      const notifRow = await runner.queryOne(
        `INSERT INTO notifications (recipient_id, type, title, body, link, metadata)
         VALUES ($1, 'achievement_earned', $2, $3, '/dashboard/rider/stats', $4::jsonb)
         RETURNING *`,
        [
          uid,
          `Achievement Unlocked: ${def.title}`,
          def.description,
          JSON.stringify({ code: def.code, tier: def.tier }),
        ]
      );
      if (io && notifRow) {
        io.to(`user:${uid}`).emit('notification:new', mapNotification(notifRow));
        io.to(`user:${uid}`).emit('achievement_earned', {
          code: def.code,
          title: def.title,
          description: def.description,
          tier: def.tier,
          awardedAt: new Date().toISOString(),
        });
      }
    }

    if (rankChanged) {
      const rankNotifRow = await runner.queryOne(
        `INSERT INTO notifications (recipient_id, type, title, body, link, metadata)
         VALUES ($1, 'rank_promoted', $2, $3, '/dashboard/rider', $4::jsonb)
         RETURNING *`,
        [
          uid,
          `Rank Promoted to ${nextRank}`,
          `Your verified riding record (${km} km, ${rides} expeditions) earned the ${nextRank} rank.`,
          JSON.stringify({ fromRank: prevRank, toRank: nextRank }),
        ]
      );
      if (io && rankNotifRow) {
        io.to(`user:${uid}`).emit('notification:new', mapNotification(rankNotifRow));
      }
    }
  }

  const hydratedProfile = await getHydratedRiderProfile(uid, { includeRankHistory: true }, runner);
  return {
    newlyAwarded,
    rankChanged,
    previousRank: prevRank,
    currentRank: nextRank,
    profile: hydratedProfile,
  };
}

export function buildAchievementProgressList(profile, verifiedCheckpoints = 0, definitions = ACHIEVEMENT_CATALOG) {
  const badgeMap = new Map((profile?.badges || []).map((b) => [String(b.code).toUpperCase(), b]));
  const km = Number(profile?.verifiedKilometres || 0);
  const rides = Number(profile?.completedExpeditions || 0);

  return definitions.map((def) => {
    const earned = badgeMap.get(def.code) || null;
    const kmPct = def.criteriaKm > 0 ? Math.min(100, Math.round((km / def.criteriaKm) * 100)) : 100;
    const ridesPct = def.criteriaRides > 0 ? Math.min(100, Math.round((rides / def.criteriaRides) * 100)) : 100;
    const cpPct =
      (def.criteriaCheckpoints || 0) > 0
        ? Math.min(100, Math.round((verifiedCheckpoints / def.criteriaCheckpoints) * 100))
        : 100;

    const activeMetrics = [];
    if (def.criteriaKm > 0) activeMetrics.push(kmPct);
    if (def.criteriaRides > 0) activeMetrics.push(ridesPct);
    if ((def.criteriaCheckpoints || 0) > 0) activeMetrics.push(cpPct);
    const progressPercent = earned
      ? 100
      : activeMetrics.length > 0
        ? Math.round(activeMetrics.reduce((a, b) => a + b, 0) / activeMetrics.length)
        : 0;

    return {
      code: def.code,
      title: def.title,
      description: def.description,
      tier: def.tier,
      icon: def.icon,
      criteriaKm: def.criteriaKm || 0,
      criteriaRides: def.criteriaRides || 0,
      criteriaCheckpoints: def.criteriaCheckpoints || 0,
      earned: Boolean(earned),
      awardedAt: earned?.awardedAt || null,
      progressPercent,
    };
  });
}
