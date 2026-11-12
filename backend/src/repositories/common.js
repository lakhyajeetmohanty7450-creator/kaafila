import { query, queryOne } from '../config/pg.js';
import { isValidUuid } from '../utils/validators.js';
import {
  mapRiderProfile,
  mapUser,
  mapOrganisation,
  mapRide,
  mapGroup,
} from './mappers.js';

/**
 * Escapes LIKE / ILIKE wildcards so user search strings match literally.
 */
export function escapeIlike(str = '') {
  return String(str).replace(/[\\%_]/g, '\\$&');
}

/**
 * Normalizes two UUIDs into a deterministic lexicographical conversation key.
 */
export function makeParticipantKey(idA, idB) {
  return [String(idA), String(idB)].sort().join(':');
}

/**
 * Resolves user summary rows into a Map<userId, mappedUser>.
 */
export async function fetchUsersMap(userIds, options = { includeEmail: false, includePhone: false }, db = null) {
  const uniqueIds = Array.from(new Set((userIds || []).filter((id) => isValidUuid(String(id))).map(String)));
  if (uniqueIds.length === 0) return new Map();

  const runner = db || { query };
  const res = await runner.query(
    `SELECT id, full_name, email, role, phone_number, city, avatar_url, is_active, last_login_at, created_at, updated_at
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [uniqueIds]
  );

  const map = new Map();
  for (const row of res.rows) {
    map.set(row.id, mapUser(row, options));
  }
  return map;
}

/**
 * Fetches badges keyed by user_id from rider_achievements.
 */
export async function fetchBadgesByUserIds(userIds, db = null) {
  const uniqueIds = Array.from(new Set((userIds || []).filter((id) => isValidUuid(String(id))).map(String)));
  if (uniqueIds.length === 0) return new Map();

  const runner = db || { query };
  const res = await runner.query(
    `SELECT user_id, achievement_code, title, awarded_at
     FROM rider_achievements
     WHERE user_id = ANY($1::uuid[])
     ORDER BY awarded_at ASC`,
    [uniqueIds]
  );

  const map = new Map();
  for (const row of res.rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push(row);
  }
  return map;
}

/**
 * Loads a rider profile by user_id, optionally including rankHistory & user object.
 */
export async function getHydratedRiderProfile(userId, options = {}, db = null) {
  const runner = db || { query, queryOne };
  const row = await runner.queryOne('SELECT * FROM rider_profiles WHERE user_id = $1', [userId]);
  if (!row) return null;

  const [badgesRes, historyRes] = await Promise.all([
    runner.query(
      'SELECT achievement_code, title, awarded_at FROM rider_achievements WHERE user_id = $1 ORDER BY awarded_at ASC',
      [userId]
    ),
    options.includeRankHistory
      ? runner.query(
          'SELECT * FROM rider_rank_history WHERE user_id = $1 ORDER BY changed_at DESC LIMIT 25',
          [userId]
        )
      : Promise.resolve({ rows: undefined }),
  ]);

  return mapRiderProfile(row, {
    badges: badgesRes.rows,
    rankHistory: historyRes.rows,
    includeEmergencyContact: options.includeEmergencyContact ?? true,
    user: options.user,
  });
}

/**
 * Resolves an organisation by UUID id OR lowercase slug.
 */
export async function findOrganisationBySlugOrId(slugOrId, db = null) {
  const runner = db || { queryOne };
  const clean = String(slugOrId || '').trim();
  if (!clean) return null;
  const row = isValidUuid(clean)
    ? await runner.queryOne('SELECT * FROM organisations WHERE id = $1 OR LOWER(slug) = LOWER($2)', [clean, clean])
    : await runner.queryOne('SELECT * FROM organisations WHERE LOWER(slug) = LOWER($1)', [clean]);
  return row ? mapOrganisation(row) : null;
}

/**
 * Resolves a ride (and joined organisation) by UUID id OR lowercase slug.
 */
export async function findRideWithOrgBySlugOrId(slugOrId, db = null) {
  const runner = db || { queryOne };
  const clean = String(slugOrId || '').trim();
  if (!clean) return null;

  const sql = `
    SELECT r.*,
      row_to_json(o.*) AS org_row
    FROM rides r
    JOIN organisations o ON o.id = r.organisation_id
    WHERE ${isValidUuid(clean) ? '(r.id = $1 OR LOWER(r.slug) = LOWER($2))' : 'LOWER(r.slug) = LOWER($1)'}
    LIMIT 1
  `;
  const params = isValidUuid(clean) ? [clean, clean] : [clean];
  const row = await runner.queryOne(sql, params);
  if (!row) return null;

  const org = row.org_row ? mapOrganisation(row.org_row) : null;
  return mapRide(row, { organisation: org });
}

/**
 * Resolves a kafila_group (with organisation, ride, createdBy) by UUID id OR lowercase slug.
 */
export async function findGroupWithRefsBySlugOrId(slugOrId, db = null) {
  const runner = db || { queryOne };
  const clean = String(slugOrId || '').trim();
  if (!clean) return null;

  const sql = `
    SELECT g.*,
      CASE WHEN o.id IS NOT NULL THEN row_to_json(o.*) ELSE NULL END AS org_row,
      CASE WHEN r.id IS NOT NULL THEN row_to_json(r.*) ELSE NULL END AS ride_row,
      CASE WHEN u.id IS NOT NULL THEN json_build_object(
        'id', u.id, 'full_name', u.full_name, 'avatar_url', u.avatar_url, 'role', u.role
      ) ELSE NULL END AS creator_row
    FROM kafila_groups g
    LEFT JOIN organisations o ON o.id = g.organisation_id
    LEFT JOIN rides r ON r.id = g.ride_id
    LEFT JOIN users u ON u.id = g.created_by_id
    WHERE ${isValidUuid(clean) ? '(g.id = $1 OR LOWER(g.slug) = LOWER($2))' : 'LOWER(g.slug) = LOWER($1)'}
    LIMIT 1
  `;
  const params = isValidUuid(clean) ? [clean, clean] : [clean];
  const row = await runner.queryOne(sql, params);
  if (!row) return null;

  const org = row.org_row ? mapOrganisation(row.org_row) : null;
  const ride = row.ride_row ? mapRide(row.ride_row) : null;
  const createdBy = row.creator_row ? mapUser(row.creator_row, { includeEmail: false, includePhone: false }) : null;
  return mapGroup(row, { organisation: org, ride, createdBy });
}

