import { env } from '../config/env.js';
import { query, queryOne, transaction } from '../config/pg.js';
import { findRideWithOrgBySlugOrId } from '../repositories/common.js';
import {
  mapCheckpoint,
  mapCheckpointArrival,
  mapOrganisation,
  mapRide,
} from '../repositories/mappers.js';
import { computeLineStringDistanceKm, isValidCoordPair, normalizeLngLat } from '../utils/geo.js';
import { isValidUuid } from '../utils/validators.js';

const ACTIVE_RIDE_STATUSES = ['published', 'upcoming', 'ongoing', 'completed'];

async function verifyRideOwnership(rideId, user) {
  if (!isValidUuid(String(rideId || ''))) {
    return { errorStatus: 400, errorMessage: 'Invalid expedition ID.' };
  }
  const ride = await findRideWithOrgBySlugOrId(rideId);
  if (!ride) {
    return { errorStatus: 404, errorMessage: 'Expedition not found.' };
  }
  const isOwner = String(ride.organisation?.owner || '') === String(user.id);
  if (!isOwner && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'You do not have permission to manage this expedition route.' };
  }
  return { ride };
}

export async function getMapsOverview(req, res, next) {
  try {
    const ridesRes = await query(
      `SELECT r.id, r.organisation_id, r.title, r.slug, r.region, r.start_location, r.end_location,
              r.max_altitude_meters, r.distance_km, r.duration_days, r.difficulty, r.start_date,
              r.status, r.is_featured, r.is_demo, r.cover_image_url, r.route, r.created_at, r.updated_at,
              row_to_json(o.*) AS org_row
       FROM rides r
       JOIN organisations o ON o.id = r.organisation_id
       WHERE r.status = ANY($1::text[])
       ORDER BY r.is_featured DESC, r.start_date ASC`,
      [ACTIVE_RIDE_STATUSES]
    );

    const rideIds = ridesRes.rows.map((r) => r.id);
    const cpCountMap = new Map();
    if (rideIds.length > 0) {
      const cpRes = await query(
        `SELECT ride_id, COUNT(*)::int AS count
         FROM checkpoints
         WHERE ride_id = ANY($1::uuid[])
         GROUP BY ride_id`,
        [rideIds]
      );
      for (const c of cpRes.rows) {
        cpCountMap.set(c.ride_id, c.count);
      }
    }

    const enriched = ridesRes.rows.map((row) => {
      const org = row.org_row ? mapOrganisation(row.org_row) : null;
      const mapped = mapRide(row, {
        organisation: org
          ? {
              _id: org.id,
              id: org.id,
              name: org.name,
              slug: org.slug,
              location: org.location,
              isVerified: org.isVerified,
              isDemo: org.isDemo,
            }
          : null,
      });
      const checkpointCount = cpCountMap.get(mapped.id) || 0;
      const geomCoords = mapped.route?.geometry?.coordinates || [];
      const hasRouteData = Boolean(
        mapped.route?.hasRouteData ||
          geomCoords.length >= 2 ||
          mapped.route?.startPoint?.coordinates?.length === 2 ||
          checkpointCount > 0
      );
      return {
        ...mapped,
        checkpointCount,
        hasRouteData,
      };
    });

    return res.json({
      success: true,
      data: enriched,
    });
  } catch (err) {
    next(err);
  }
}

export async function getRideRouteAndCheckpoints(req, res, next) {
  try {
    const ride = await findRideWithOrgBySlugOrId(req.params.slugOrId);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Expedition not found.' });
    }

    const isOwner =
      req.user &&
      (String(ride.organisation?.owner || '') === String(req.user.id) || req.user.role === 'admin');
    if (ride.status === 'draft' && !isOwner) {
      return res.status(404).json({ success: false, message: 'Expedition not found.' });
    }

    const [cpRes, arrivalsRes, progressRes] = await Promise.all([
      query('SELECT * FROM checkpoints WHERE ride_id = $1 ORDER BY sequence_number ASC, created_at ASC', [ride.id]),
      req.user
        ? query('SELECT * FROM checkpoint_arrivals WHERE ride_id = $1 AND user_id = $2', [ride.id, req.user.id])
        : Promise.resolve({ rows: [] }),
      isOwner
        ? query(
            `SELECT checkpoint_id, COUNT(*)::int AS completed_count
             FROM checkpoint_arrivals
             WHERE ride_id = $1 AND verified = TRUE
             GROUP BY checkpoint_id`,
            [ride.id]
          )
        : Promise.resolve(null),
    ]);

    const checkpoints = cpRes.rows.map((c) => mapCheckpoint(c));
    const myArrivals = arrivalsRes.rows.map((a) => mapCheckpointArrival(a));
    const checkpointProgress = progressRes
      ? progressRes.rows.map((c) => ({ checkpointId: c.checkpoint_id, completedCount: c.completed_count }))
      : null;

    const geomCoords = ride.route?.geometry?.coordinates || [];
    const hasRouteData = Boolean(
      ride.route?.hasRouteData ||
        geomCoords.length >= 2 ||
        ride.route?.startPoint?.coordinates?.length === 2 ||
        ride.route?.endPoint?.coordinates?.length === 2 ||
        checkpoints.length > 0
    );

    const routePayload = {
      startPoint: ride.route?.startPoint?.coordinates?.length === 2 ? ride.route.startPoint : null,
      endPoint: ride.route?.endPoint?.coordinates?.length === 2 ? ride.route.endPoint : null,
      geometry: geomCoords.length >= 2 ? { type: 'LineString', coordinates: geomCoords } : null,
      dailySegments: Array.isArray(ride.route?.dailySegments) ? ride.route.dailySegments : [],
      routeDescription: ride.route?.routeDescription || '',
      calculatedDistanceKm:
        ride.route?.calculatedDistanceKm > 0
          ? ride.route.calculatedDistanceKm
          : geomCoords.length >= 2
            ? computeLineStringDistanceKm(geomCoords)
            : 0,
      hasRouteData,
    };

    return res.json({
      success: true,
      data: {
        ride: {
          _id: ride._id,
          id: ride.id,
          title: ride.title,
          slug: ride.slug,
          region: ride.region,
          startLocation: ride.startLocation,
          endLocation: ride.endLocation,
          distanceKm: ride.distanceKm,
          durationDays: ride.durationDays,
          maxAltitudeMeters: ride.maxAltitudeMeters,
          difficulty: ride.difficulty,
          status: ride.status,
          isDemo: ride.isDemo,
          organisation: ride.organisation
            ? {
                _id: ride.organisation._id,
                id: ride.organisation.id,
                name: ride.organisation.name,
                slug: ride.organisation.slug,
                isVerified: ride.organisation.isVerified,
                isDemo: ride.organisation.isDemo,
              }
            : null,
        },
        route: routePayload,
        checkpoints,
        myArrivals,
        checkpointProgress,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateRideRoute(req, res, next) {
  try {
    const check = await verifyRideOwnership(req.params.id, req.user);
    if (check.errorStatus) {
      return res.status(check.errorStatus).json({ success: false, message: check.errorMessage });
    }
    const { ride } = check;
    const { startPoint, endPoint, geometryCoordinates, geometry, dailySegments, routeDescription } = req.body;

    const existingRoute = ride.route ? { ...ride.route } : {};

    let nextStart = existingRoute.startPoint || { label: ride.startLocation || '' };
    if (startPoint !== undefined) {
      if (startPoint === null) {
        nextStart = { label: ride.startLocation || '' };
      } else {
        const pair = normalizeLngLat(startPoint.coordinates ?? startPoint);
        if (!pair) {
          return res.status(400).json({ success: false, message: 'Start point coordinates must be valid [lng, lat].' });
        }
        nextStart = {
          label: String(startPoint.label || ride.startLocation || 'Starting Point').trim().slice(0, 140),
          coordinates: pair,
        };
      }
    }

    let nextEnd = existingRoute.endPoint || { label: ride.endLocation || '' };
    if (endPoint !== undefined) {
      if (endPoint === null) {
        nextEnd = { label: ride.endLocation || '' };
      } else {
        const pair = normalizeLngLat(endPoint.coordinates ?? endPoint);
        if (!pair) {
          return res.status(400).json({ success: false, message: 'Destination coordinates must be valid [lng, lat].' });
        }
        nextEnd = {
          label: String(endPoint.label || ride.endLocation || 'Destination').trim().slice(0, 140),
          coordinates: pair,
        };
      }
    }

    let nextGeometryCoords = existingRoute.geometry?.coordinates || [];
    const incomingGeom = geometryCoordinates ?? geometry?.coordinates;
    if (incomingGeom !== undefined) {
      if (!Array.isArray(incomingGeom)) {
        return res.status(400).json({ success: false, message: 'Route geometry coordinates must be an array.' });
      }
      const cleaned = incomingGeom.map(normalizeLngLat).filter(Boolean);
      if (incomingGeom.length > 0 && cleaned.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Route LineString must contain at least 2 valid [lng, lat] points.',
        });
      }
      nextGeometryCoords = cleaned;
    }

    let nextSegments = existingRoute.dailySegments || [];
    if (dailySegments !== undefined) {
      if (!Array.isArray(dailySegments)) {
        return res.status(400).json({ success: false, message: 'dailySegments must be an array.' });
      }
      nextSegments = dailySegments
        .filter((s) => s && (s.title || s.startLabel || s.endLabel || (Array.isArray(s.coordinates) && s.coordinates.length >= 2)))
        .map((seg, idx) => {
          const coords = Array.isArray(seg.coordinates) ? seg.coordinates.map(normalizeLngLat).filter(Boolean) : [];
          return {
            day: Math.max(1, Number(seg.day) || idx + 1),
            title: String(seg.title || `Day ${idx + 1}`).trim().slice(0, 140),
            description: String(seg.description || '').trim().slice(0, 500),
            startLabel: String(seg.startLabel || '').trim().slice(0, 120),
            endLabel: String(seg.endLabel || '').trim().slice(0, 120),
            coordinates: coords,
            distanceKm: coords.length >= 2 ? computeLineStringDistanceKm(coords) : Math.max(0, Number(seg.distanceKm) || 0),
          };
        });
    }

    const nextDesc =
      typeof routeDescription === 'string'
        ? routeDescription.trim().slice(0, 2000)
        : existingRoute.routeDescription || '';

    const cpRes = await queryOne('SELECT COUNT(*)::int AS cnt FROM checkpoints WHERE ride_id = $1', [ride.id]);
    const cpCount = cpRes?.cnt || 0;

    const calculatedDistanceKm =
      nextGeometryCoords.length >= 2
        ? computeLineStringDistanceKm(nextGeometryCoords)
        : nextStart?.coordinates?.length === 2 && nextEnd?.coordinates?.length === 2
          ? computeLineStringDistanceKm([nextStart.coordinates, nextEnd.coordinates])
          : 0;

    const hasRouteData = Boolean(
      nextGeometryCoords.length >= 2 ||
        nextStart?.coordinates?.length === 2 ||
        nextEnd?.coordinates?.length === 2 ||
        cpCount > 0
    );

    const nextRoute = {
      startPoint: nextStart,
      endPoint: nextEnd,
      geometry: {
        type: 'LineString',
        coordinates: nextGeometryCoords,
      },
      dailySegments: nextSegments,
      routeDescription: nextDesc,
      calculatedDistanceKm,
      hasRouteData,
    };

    await query('UPDATE rides SET route = $1::jsonb WHERE id = $2', [JSON.stringify(nextRoute), ride.id]);

    return res.json({
      success: true,
      message: 'Expedition route saved successfully.',
      data: nextRoute,
    });
  } catch (err) {
    next(err);
  }
}

export async function createCheckpoint(req, res, next) {
  try {
    const check = await verifyRideOwnership(req.params.id, req.user);
    if (check.errorStatus) {
      return res.status(check.errorStatus).json({ success: false, message: check.errorMessage });
    }
    const { ride } = check;
    const { name, description = '', type = 'checkpoint', coordinates, altitudeMeters, sequenceNumber, radiusMeters = 250 } = req.body;

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Checkpoint name must be at least 2 characters.' });
    }

    const pair = normalizeLngLat(coordinates ?? { lng: req.body.lng, lat: req.body.lat });
    if (!pair) {
      return res.status(400).json({ success: false, message: 'Valid checkpoint coordinates [lng, lat] are required.' });
    }

    const allowedTypes = ['start', 'checkpoint', 'rest_stop', 'fuel_stop', 'important', 'destination'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid checkpoint type.' });
    }

    const countRow = await queryOne('SELECT COUNT(*)::int AS cnt FROM checkpoints WHERE ride_id = $1', [ride.id]);
    const existingCount = countRow?.cnt || 0;
    const seq =
      Number.isFinite(Number(sequenceNumber)) && Number(sequenceNumber) >= 1
        ? Math.round(Number(sequenceNumber))
        : existingCount + 1;
    const radius = Math.min(5000, Math.max(50, Number(radiusMeters) || 250));
    const alt =
      altitudeMeters !== undefined && altitudeMeters !== '' && Number.isFinite(Number(altitudeMeters))
        ? Math.round(Number(altitudeMeters))
        : null;

    const cpRow = await queryOne(
      `INSERT INTO checkpoints
         (ride_id, organisation_id, name, description, type, lng, lat, altitude_meters, sequence_number, radius_meters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        ride.id,
        ride.organisation.id,
        String(name).trim().slice(0, 120),
        String(description || '').trim().slice(0, 500),
        type,
        pair[0],
        pair[1],
        alt,
        seq,
        radius,
      ]
    );

    if (!ride.route?.hasRouteData) {
      const updatedRoute = { ...(ride.route || {}), hasRouteData: true };
      await query('UPDATE rides SET route = $1::jsonb WHERE id = $2', [JSON.stringify(updatedRoute), ride.id]);
    }

    const listRes = await query('SELECT * FROM checkpoints WHERE ride_id = $1 ORDER BY sequence_number ASC, created_at ASC', [
      ride.id,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Checkpoint added successfully.',
      data: mapCheckpoint(cpRow),
      checkpoints: listRes.rows.map((c) => mapCheckpoint(c)),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCheckpoint(req, res, next) {
  try {
    const check = await verifyRideOwnership(req.params.id, req.user);
    if (check.errorStatus) {
      return res.status(check.errorStatus).json({ success: false, message: check.errorMessage });
    }
    const { ride } = check;
    const { checkpointId } = req.params;
    if (!isValidUuid(checkpointId)) {
      return res.status(400).json({ success: false, message: 'Invalid checkpoint ID.' });
    }

    const cp = await queryOne('SELECT * FROM checkpoints WHERE id = $1 AND ride_id = $2', [checkpointId, ride.id]);
    if (!cp) {
      return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    }

    const { name, description, type, coordinates, lng, lat, altitudeMeters, sequenceNumber, radiusMeters } = req.body;
    const nextName = typeof name === 'string' && name.trim().length >= 2 ? name.trim().slice(0, 120) : cp.name;
    const nextDesc = typeof description === 'string' ? description.trim().slice(0, 500) : cp.description;
    const nextType = ['start', 'checkpoint', 'rest_stop', 'fuel_stop', 'important', 'destination'].includes(type)
      ? type
      : cp.type;

    let nextLng = Number(cp.lng);
    let nextLat = Number(cp.lat);
    if (coordinates !== undefined || (lng !== undefined && lat !== undefined)) {
      const pair = normalizeLngLat(coordinates ?? { lng, lat });
      if (!pair) {
        return res.status(400).json({ success: false, message: 'Invalid checkpoint coordinates.' });
      }
      nextLng = pair[0];
      nextLat = pair[1];
    }

    const nextAlt =
      altitudeMeters !== undefined
        ? altitudeMeters === '' || altitudeMeters === null
          ? null
          : Math.round(Number(altitudeMeters))
        : cp.altitude_meters;
    const nextSeq =
      sequenceNumber !== undefined && Number(sequenceNumber) >= 1
        ? Math.round(Number(sequenceNumber))
        : cp.sequence_number;
    const nextRadius =
      radiusMeters !== undefined ? Math.min(5000, Math.max(50, Number(radiusMeters) || 250)) : cp.radius_meters;

    const updated = await queryOne(
      `UPDATE checkpoints SET
         name = $1, description = $2, type = $3, lng = $4, lat = $5,
         altitude_meters = $6, sequence_number = $7, radius_meters = $8
       WHERE id = $9
       RETURNING *`,
      [nextName, nextDesc, nextType, nextLng, nextLat, nextAlt, nextSeq, nextRadius, cp.id]
    );

    const listRes = await query('SELECT * FROM checkpoints WHERE ride_id = $1 ORDER BY sequence_number ASC, created_at ASC', [
      ride.id,
    ]);

    return res.json({
      success: true,
      message: 'Checkpoint updated.',
      data: mapCheckpoint(updated),
      checkpoints: listRes.rows.map((c) => mapCheckpoint(c)),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCheckpoint(req, res, next) {
  try {
    const check = await verifyRideOwnership(req.params.id, req.user);
    if (check.errorStatus) {
      return res.status(check.errorStatus).json({ success: false, message: check.errorMessage });
    }
    const { ride } = check;
    const { checkpointId } = req.params;
    if (!isValidUuid(checkpointId)) {
      return res.status(400).json({ success: false, message: 'Invalid checkpoint ID.' });
    }

    const remainingRows = await transaction(async (tx) => {
      const deleted = await tx.queryOne(
        'DELETE FROM checkpoints WHERE id = $1 AND ride_id = $2 RETURNING id',
        [checkpointId, ride.id]
      );
      if (!deleted) return null;

      await tx.query('DELETE FROM checkpoint_arrivals WHERE checkpoint_id = $1', [checkpointId]);

      const remaining = await tx.query(
        'SELECT * FROM checkpoints WHERE ride_id = $1 ORDER BY sequence_number ASC, created_at ASC',
        [ride.id]
      );
      for (let i = 0; i < remaining.rows.length; i += 1) {
        if (remaining.rows[i].sequence_number !== i + 1) {
          remaining.rows[i].sequence_number = i + 1;
          await tx.query('UPDATE checkpoints SET sequence_number = $1 WHERE id = $2', [
            i + 1,
            remaining.rows[i].id,
          ]);
        }
      }
      return remaining.rows;
    });

    if (!remainingRows) {
      return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    }

    return res.json({
      success: true,
      message: 'Checkpoint removed.',
      checkpoints: remainingRows.map((c) => mapCheckpoint(c)),
    });
  } catch (err) {
    next(err);
  }
}

export async function reorderCheckpoints(req, res, next) {
  try {
    const check = await verifyRideOwnership(req.params.id, req.user);
    if (check.errorStatus) {
      return res.status(check.errorStatus).json({ success: false, message: check.errorMessage });
    }
    const { ride } = check;
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderedIds array is required.' });
    }

    const updatedRows = await transaction(async (tx) => {
      const existingRes = await tx.query('SELECT id FROM checkpoints WHERE ride_id = $1', [ride.id]);
      const validIds = new Set(existingRes.rows.map((r) => r.id));

      let seq = 1;
      for (const id of orderedIds) {
        const key = String(id);
        if (validIds.has(key)) {
          await tx.query('UPDATE checkpoints SET sequence_number = $1 WHERE id = $2', [seq, key]);
          validIds.delete(key);
          seq += 1;
        }
      }
      for (const leftoverId of validIds) {
        await tx.query('UPDATE checkpoints SET sequence_number = $1 WHERE id = $2', [seq, leftoverId]);
        seq += 1;
      }

      const finalRes = await tx.query('SELECT * FROM checkpoints WHERE ride_id = $1 ORDER BY sequence_number ASC', [
        ride.id,
      ]);
      return finalRes.rows;
    });

    return res.json({
      success: true,
      message: 'Checkpoint order updated.',
      data: updatedRows.map((c) => mapCheckpoint(c)),
    });
  } catch (err) {
    next(err);
  }
}

export async function getOrganisationRideTrackingOverview(req, res, next) {
  try {
    const check = await verifyRideOwnership(req.params.id, req.user);
    if (check.errorStatus) {
      return res.status(check.errorStatus).json({ success: false, message: check.errorMessage });
    }
    const { ride } = check;

    const [cpRes, confirmedRes, liveRes, completedRes, arrivalsRes] = await Promise.all([
      query('SELECT * FROM checkpoints WHERE ride_id = $1 ORDER BY sequence_number ASC', [ride.id]),
      query(
        `SELECT rm.*, u.full_name, u.avatar_url
         FROM ride_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.ride_id = $1 AND rm.status IN ('confirmed', 'completed')`,
        [ride.id]
      ),
      query(
        `SELECT ts.*, u.full_name, u.avatar_url
         FROM tracking_sessions ts
         JOIN users u ON u.id = ts.user_id
         WHERE ts.ride_id = $1 AND ts.status IN ('active', 'paused') AND ts.is_location_sharing_enabled = TRUE`,
        [ride.id]
      ),
      query(
        "SELECT user_id, verified_distance_km, estimated_distance_km, verification_status, ended_at FROM tracking_sessions WHERE ride_id = $1 AND status = 'completed'",
        [ride.id]
      ),
      query(
        'SELECT user_id, checkpoint_id, arrived_at, verification_method FROM checkpoint_arrivals WHERE ride_id = $1 AND verified = TRUE',
        [ride.id]
      ),
    ]);

    const checkpoints = cpRes.rows.map((c) => mapCheckpoint(c));

    const consentedLiveRiders = liveRes.rows
      .filter((s) => Array.isArray(s.points) && s.points.length > 0)
      .map((s) => {
        const lastPt = s.points[s.points.length - 1];
        return {
          userId: s.user_id,
          fullName: s.full_name,
          avatarUrl: s.avatar_url || '',
          sessionId: s.id,
          status: s.status,
          lat: lastPt.lat,
          lng: lastPt.lng,
          accuracyMeters: lastPt.accuracyMeters,
          updatedAt: lastPt.timestamp || s.updated_at,
          verifiedDistanceKm: Number(s.verified_distance_km || 0),
        };
      });

    const arrivalByUser = new Map();
    for (const a of arrivalsRes.rows) {
      if (!arrivalByUser.has(a.user_id)) arrivalByUser.set(a.user_id, []);
      arrivalByUser.get(a.user_id).push(a);
    }

    const rosterProgress = confirmedRes.rows.map((m) => {
      const userArrivals = arrivalByUser.get(m.user_id) || [];
      return {
        userId: m.user_id,
        fullName: m.full_name,
        avatarUrl: m.avatar_url || '',
        status: m.status,
        checkpointsCompleted: userArrivals.length,
        totalCheckpoints: checkpoints.length,
        verifiedKmAwarded: Number(m.verified_km_awarded || 0),
      };
    });

    const totalVerifiedDistanceLoggedKm = Number(
      completedRes.rows.reduce((acc, s) => acc + Number(s.verified_distance_km || 0), 0).toFixed(1)
    );

    return res.json({
      success: true,
      data: {
        rideId: ride._id,
        title: ride.title,
        checkpoints,
        consentedLiveRiders,
        rosterProgress,
        stats: {
          confirmedRidersCount: rosterProgress.length,
          consentedLiveCount: consentedLiveRiders.length,
          completedSessionsCount: completedRes.rows.length,
          totalVerifiedDistanceLoggedKm,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

function formatDurationText(totalSeconds) {
  const secs = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(secs / 3600);
  const mins = Math.round((secs % 3600) / 60);
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, mins)}m`;
}

function flattenRouteGeometryCoords(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'LineString') {
    return geometry.coordinates.filter((pt) => Array.isArray(pt) && pt.length >= 2);
  }
  if (geometry.type === 'MultiLineString') {
    const merged = [];
    for (const segment of geometry.coordinates) {
      if (!Array.isArray(segment)) continue;
      for (const pt of segment) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const prev = merged[merged.length - 1];
        if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) {
          merged.push([Number(pt[0]), Number(pt[1])]);
        }
      }
    }
    return merged;
  }
  return [];
}

function handleGeoapifyUpstreamError(res, status, fallbackMessage) {
  if (status === 401 || status === 403) {
    return res.status(502).json({
      success: false,
      message: 'Map provider authentication failed. Please check server configuration.',
    });
  }
  if (status === 429) {
    return res.status(429).json({
      success: false,
      message: 'Map provider rate limit reached. Please retry shortly.',
    });
  }
  return res.status(502).json({
    success: false,
    message: fallbackMessage,
  });
}

export async function geocodeLocation(req, res, next) {
  try {
    const rawText = String(req.query.text || '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (rawText.length < 2 || rawText.length > 160) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be between 2 and 160 characters.',
      });
    }

    const apiKey = String(env.geoapifyApiKey || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Geocoding service is not configured on the server.',
      });
    }

    const params = new URLSearchParams({
      text: rawText,
      filter: 'countrycode:in',
      limit: '7',
      format: 'json',
      apiKey,
    });

    let upstreamRes;
    try {
      upstreamRes = await globalThis.fetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`,
        { signal: AbortSignal.timeout(8000) }
      );
    } catch (fetchErr) {
      if (fetchErr?.name === 'TimeoutError' || fetchErr?.name === 'AbortError') {
        return res.status(504).json({
          success: false,
          message: 'Location search timed out. Please try again.',
        });
      }
      return res.status(502).json({
        success: false,
        message: 'Unable to reach location search service.',
      });
    }

    if (!upstreamRes.ok) {
      return handleGeoapifyUpstreamError(res, upstreamRes.status, 'Location search service returned an error.');
    }

    const payload = await upstreamRes.json();
    const rawResults = Array.isArray(payload?.results) ? payload.results : [];

    const results = rawResults
      .filter((item) => isValidCoordPair(Number(item.lon), Number(item.lat)))
      .map((item, idx) => ({
        id: item.place_id || `${item.lat}_${item.lon}_${idx}`,
        name:
          item.name ||
          item.address_line1 ||
          item.city ||
          item.town ||
          item.village ||
          item.state ||
          item.formatted,
        formatted: item.formatted || item.address_line1 || '',
        city: item.city || item.town || item.village || '',
        state: item.state || '',
        country: item.country || 'India',
        lat: Number(Number(item.lat).toFixed(6)),
        lng: Number(Number(item.lon).toFixed(6)),
        resultType: item.result_type || '',
      }));

    return res.json({
      success: true,
      data: {
        query: rawText,
        results,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function calculateMotorcycleRoute(req, res, next) {
  try {
    const rawWaypoints = req.body?.waypoints;
    if (!Array.isArray(rawWaypoints) || rawWaypoints.length < 2 || rawWaypoints.length > 25) {
      return res.status(400).json({
        success: false,
        message: 'Provide between 2 and 25 ordered waypoints with valid lat and lng.',
      });
    }

    const normalizedWaypoints = [];
    for (let i = 0; i < rawWaypoints.length; i += 1) {
      const wp = rawWaypoints[i];
      const lat = Number(wp?.lat ?? wp?.latitude);
      const lng = Number(wp?.lng ?? wp?.lon ?? wp?.longitude);
      if (!isValidCoordPair(lng, lat)) {
        return res.status(400).json({
          success: false,
          message: `Waypoint #${i + 1} has invalid latitude or longitude.`,
        });
      }
      normalizedWaypoints.push({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        label: wp?.label ? String(wp.label).trim().slice(0, 120) : `Waypoint ${i + 1}`,
      });
    }

    const apiKey = String(env.geoapifyApiKey || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Routing service is not configured on the server.',
      });
    }

    const waypointParam = normalizedWaypoints.map((w) => `${w.lat},${w.lng}`).join('|');
    const params = new URLSearchParams({
      waypoints: waypointParam,
      mode: 'motorcycle',
      units: 'metric',
      apiKey,
    });

    let upstreamRes;
    try {
      upstreamRes = await globalThis.fetch(
        `https://api.geoapify.com/v1/routing?${params.toString()}`,
        { signal: AbortSignal.timeout(12000) }
      );
    } catch (fetchErr) {
      if (fetchErr?.name === 'TimeoutError' || fetchErr?.name === 'AbortError') {
        return res.status(504).json({
          success: false,
          message: 'Motorcycle route calculation timed out. Please try again.',
        });
      }
      return res.status(502).json({
        success: false,
        message: 'Unable to reach motorcycle routing service.',
      });
    }

    if (!upstreamRes.ok) {
      return handleGeoapifyUpstreamError(res, upstreamRes.status, 'Motorcycle routing service returned an error.');
    }

    const payload = await upstreamRes.json();
    const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
    const coords = flattenRouteGeometryCoords(feature?.geometry);
    if (!feature || coords.length < 2) {
      return res.status(422).json({
        success: false,
        message: 'No drivable motorcycle route could be found between the selected waypoints.',
      });
    }

    const props = feature.properties || {};
    const distanceMeters = Number(props.distance || 0);
    const distanceKm =
      distanceMeters > 0
        ? Number((distanceMeters / 1000).toFixed(2))
        : computeLineStringDistanceKm(coords);
    const durationSeconds = Math.max(0, Math.round(Number(props.time || 0)));

    const instructions = [];
    if (Array.isArray(props.legs)) {
      props.legs.forEach((leg, legIndex) => {
        if (!Array.isArray(leg?.steps)) return;
        leg.steps.forEach((step) => {
          const text = step?.instruction?.text;
          if (!text) return;
          instructions.push({
            legIndex,
            text,
            type: step?.instruction?.type || '',
            distanceMeters: Math.round(Number(step?.distance || 0)),
            timeSeconds: Math.round(Number(step?.time || 0)),
          });
        });
      });
    }

    return res.json({
      success: true,
      data: {
        mode: 'motorcycle',
        units: 'metric',
        waypoints: normalizedWaypoints,
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
        distanceKm,
        durationSeconds,
        durationText: formatDurationText(durationSeconds),
        instructions,
      },
    });
  } catch (err) {
    next(err);
  }
}
