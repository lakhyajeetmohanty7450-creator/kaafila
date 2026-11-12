import { query, queryOne, transaction } from '../config/pg.js';
import {
  mapCheckpoint,
  mapCheckpointArrival,
  mapTrackingSession,
} from '../repositories/mappers.js';
import {
  analyzeAndFilterTrackPoints,
  createSimplifiedPublicRoute,
  haversineMeters,
} from '../utils/geo.js';
import { evaluateAndAwardAchievements } from '../utils/achievements.js';
import { getSocketIO } from '../utils/notify.js';
import { isValidUuid, parsePagination } from '../utils/validators.js';

async function syncGroupLiveLocation({ session, user, io, lastPoint }, db = null) {
  if (!session.group) return;
  const runner = db || { query };
  const gId = String(session.group);
  const userId = String(user.id);

  if (!session.isLocationSharingEnabled) {
    await runner.query(
      'UPDATE group_locations SET sharing_enabled = FALSE, updated_at = NOW() WHERE group_id = $1 AND user_id = $2',
      [gId, userId]
    );
    if (io) {
      const stopPayload = { groupId: gId, userId };
      io.to(`group:${gId}`).emit('group:location_stop', stopPayload);
      io.to(`group-loc:${gId}`).emit('group:location_stop', stopPayload);
    }
    return;
  }

  if (!lastPoint) return;

  await runner.query(
    `INSERT INTO group_locations
       (group_id, user_id, tracking_session_id, sharing_enabled, lat, lng, accuracy_meters, updated_at)
     VALUES ($1, $2, $3, TRUE, $4, $5, $6, NOW())
     ON CONFLICT (group_id, user_id)
     DO UPDATE SET
       tracking_session_id = EXCLUDED.tracking_session_id,
       sharing_enabled = TRUE,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       accuracy_meters = EXCLUDED.accuracy_meters,
       updated_at = NOW()`,
    [gId, userId, session.id, lastPoint.lat, lastPoint.lng, Math.round(lastPoint.accuracyMeters || 25)]
  );

  if (io) {
    const updatePayload = {
      groupId: gId,
      userId,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl || '',
      lat: lastPoint.lat,
      lng: lastPoint.lng,
      accuracyMeters: lastPoint.accuracyMeters || 25,
      updatedAt: new Date().toISOString(),
    };
    io.to(`group:${gId}`).emit('group:location_update', updatePayload);
    io.to(`group-loc:${gId}`).emit('group:location_update', updatePayload);
  }
}

export async function startTrackingSession(req, res, next) {
  try {
    const existingRow = await queryOne(
      "SELECT * FROM tracking_sessions WHERE user_id = $1 AND status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1",
      [req.user.id]
    );

    if (existingRow) {
      const existingDto = mapTrackingSession(existingRow);
      return res.status(409).json({
        success: false,
        message: 'You already have an active or paused tracking session. Resume or stop it first.',
        existingSessionId: existingDto._id,
        data: existingDto,
      });
    }

    const { rideId = null, groupId = null, title = '', enableLocationSharing = false } = req.body || {};

    let rideRow = null;
    if (rideId) {
      if (!isValidUuid(String(rideId))) {
        return res.status(400).json({ success: false, message: 'Invalid expedition ID.' });
      }
      rideRow = await queryOne('SELECT * FROM rides WHERE id = $1', [rideId]);
      if (!rideRow || rideRow.status === 'draft') {
        return res.status(404).json({ success: false, message: 'Expedition not found.' });
      }
    }

    let validGroupId = null;
    if (groupId) {
      if (!isValidUuid(String(groupId))) {
        return res.status(400).json({ success: false, message: 'Invalid KAAFILA group ID.' });
      }
      const member = await queryOne(
        "SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
        [groupId, req.user.id]
      );
      if (!member) {
        return res.status(403).json({ success: false, message: 'Only active group members can link a group ride session.' });
      }
      validGroupId = groupId;
    }

    const sessionRow = await queryOne(
      `INSERT INTO tracking_sessions
         (user_id, ride_id, group_id, title, status, is_location_sharing_enabled, started_at)
       VALUES ($1, $2, $3, $4, 'active', $5, NOW())
       RETURNING *`,
      [
        req.user.id,
        rideRow?.id || null,
        validGroupId,
        String(title || '').trim().slice(0, 140) ||
          (rideRow ? `${rideRow.title} Tracking` : 'Expedition Ride Session'),
        Boolean(enableLocationSharing),
      ]
    );

    const populatedRow = await queryOne(
      `SELECT ts.*,
         r.title AS ride_title, r.slug AS ride_slug, r.region AS ride_region, r.distance_km AS ride_distance_km,
         g.name AS group_name, g.slug AS group_slug
       FROM tracking_sessions ts
       LEFT JOIN rides r ON r.id = ts.ride_id
       LEFT JOIN kafila_groups g ON g.id = ts.group_id
       WHERE ts.id = $1`,
      [sessionRow.id]
    );

    const populated = mapTrackingSession(populatedRow, {
      ride: populatedRow.ride_id
        ? {
            _id: populatedRow.ride_id,
            id: populatedRow.ride_id,
            title: populatedRow.ride_title,
            slug: populatedRow.ride_slug,
            region: populatedRow.ride_region,
            distanceKm: populatedRow.ride_distance_km,
          }
        : null,
      group: populatedRow.group_id
        ? {
            _id: populatedRow.group_id,
            id: populatedRow.group_id,
            name: populatedRow.group_name,
            slug: populatedRow.group_slug,
          }
        : null,
    });

    return res.status(201).json({
      success: true,
      message: 'GPS tracking session started.',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
}

export async function pauseTrackingSession(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking session ID.' });
    }
    const row = await queryOne('SELECT * FROM tracking_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Tracking session not found.' });
    }
    if (row.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Only an active session can be paused.' });
    }

    const now = new Date();
    const activeSince = new Date(row.paused_at || row.started_at);
    const deltaSec = Math.max(0, Math.round((now.getTime() - activeSince.getTime()) / 1000));
    const nextDuration = Math.max(Number(row.active_duration_seconds || 0), deltaSec);

    const updated = await queryOne(
      `UPDATE tracking_sessions
       SET active_duration_seconds = $1, paused_at = $2, status = 'paused'
       WHERE id = $3
       RETURNING *`,
      [nextDuration, now, row.id]
    );

    const session = mapTrackingSession(updated);
    return res.json({ success: true, message: 'Tracking paused.', data: session });
  } catch (err) {
    next(err);
  }
}

export async function resumeTrackingSession(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking session ID.' });
    }
    const row = await queryOne('SELECT * FROM tracking_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Tracking session not found.' });
    }
    if (row.status !== 'paused') {
      return res.status(400).json({ success: false, message: 'Only a paused session can be resumed.' });
    }

    const updated = await queryOne(
      "UPDATE tracking_sessions SET paused_at = NULL, status = 'active' WHERE id = $1 RETURNING *",
      [row.id]
    );

    return res.json({ success: true, message: 'Tracking resumed.', data: mapTrackingSession(updated) });
  } catch (err) {
    next(err);
  }
}

function applyTrackBatchToSession(session, incomingPoints) {
  const existingPoints = Array.isArray(session.points) ? session.points : [];
  const prevPointsCount = existingPoints.length;
  const prevStats = session.stats || {};
  const prevFlags = Array.isArray(session.suspiciousFlags) ? [...session.suspiciousFlags] : [];

  const priorPoor = Number(prevStats.filteredPoorAccuracy || 0);
  const priorDupes = Number(prevStats.filteredDuplicates || 0);
  const priorJumps = Number(prevStats.filteredJumps || 0);

  const combined = [
    ...existingPoints.map((p) => ({
      lng: p.lng,
      lat: p.lat,
      accuracyMeters: p.accuracyMeters,
      altitudeMeters: p.altitudeMeters,
      timestamp: p.timestamp,
    })),
    ...incomingPoints,
  ];

  const analysis = analyzeAndFilterTrackPoints(combined);
  session.points = analysis.acceptedPoints;
  session.estimatedDistanceKm = analysis.estimatedDistanceKm;
  session.verifiedDistanceKm = analysis.verifiedDistanceKm;

  const flagKeys = new Set(prevFlags.map((f) => `${f.code}:${new Date(f.detectedAt).toISOString()}`));
  for (const f of analysis.suspiciousFlags || []) {
    const key = `${f.code}:${new Date(f.detectedAt).toISOString()}`;
    if (!flagKeys.has(key)) {
      flagKeys.add(key);
      prevFlags.push(f);
    }
  }
  session.suspiciousFlags = prevFlags;

  const newRejectedPoor = analysis.stats.filteredPoorAccuracy || 0;
  const newRejectedDupes = analysis.stats.filteredDuplicates || 0;
  const newRejectedJumps = analysis.stats.filteredJumps || 0;
  const totalRejected = priorPoor + newRejectedPoor + priorDupes + newRejectedDupes + priorJumps + newRejectedJumps;

  session.stats = {
    totalPoints: Math.max(
      Number(prevStats.totalPoints || 0) + incomingPoints.length,
      analysis.acceptedPoints.length + totalRejected,
      prevPointsCount
    ),
    acceptedCount: analysis.acceptedPoints.length,
    filteredPoorAccuracy: priorPoor + newRejectedPoor,
    filteredDuplicates: priorDupes + newRejectedDupes,
    filteredJumps: priorJumps + newRejectedJumps,
    maxObservedSpeedKmh: Math.max(Number(prevStats.maxObservedSpeedKmh || 0), analysis.stats.maxObservedSpeedKmh || 0),
    averageAccuracyMeters: analysis.stats.averageAccuracyMeters || prevStats.averageAccuracyMeters || 0,
  };

  return analysis;
}

export async function uploadTrackingPoints(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking session ID.' });
    }
    const row = await queryOne('SELECT * FROM tracking_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Tracking session not found.' });
    }
    if (row.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Points can only be recorded while tracking is active.',
      });
    }

    const incoming = Array.isArray(req.body?.points) ? req.body.points : req.body?.point ? [req.body.point] : [];
    if (incoming.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one GPS point is required.' });
    }
    if (incoming.length > 500) {
      return res.status(400).json({ success: false, message: 'Maximum 500 points per batch.' });
    }

    const session = mapTrackingSession(row);
    const analysis = applyTrackBatchToSession(session, incoming);

    const updatedRow = await queryOne(
      `UPDATE tracking_sessions SET
         points = $1::jsonb,
         estimated_distance_km = $2,
         verified_distance_km = $3,
         suspicious_flags = $4::jsonb,
         stats = $5::jsonb
       WHERE id = $6
       RETURNING *`,
      [
        JSON.stringify(session.points),
        session.estimatedDistanceKm,
        session.verifiedDistanceKm,
        JSON.stringify(session.suspiciousFlags),
        JSON.stringify(session.stats),
        session.id,
      ]
    );
    const savedSession = mapTrackingSession(updatedRow);

    const newlyVerifiedCheckpoints = [];
    if (savedSession.ride && analysis.acceptedPoints.length > 0) {
      const cpRes = await query('SELECT * FROM checkpoints WHERE ride_id = $1 ORDER BY sequence_number ASC', [
        savedSession.ride,
      ]);
      for (const cp of cpRes.rows) {
        let bestPt = null;
        let bestDist = Infinity;
        for (const pt of analysis.acceptedPoints) {
          if ((pt.accuracyMeters ?? 25) > 120) continue;
          const dist = haversineMeters(pt.lat, pt.lng, Number(cp.lat), Number(cp.lng));
          if (dist <= (cp.radius_meters || 250) && dist < bestDist) {
            bestDist = dist;
            bestPt = pt;
          }
        }
        if (bestPt) {
          const inserted = await queryOne(
            `INSERT INTO checkpoint_arrivals
               (user_id, ride_id, checkpoint_id, tracking_session_id, verified,
                verification_method, distance_from_checkpoint_meters, reported_accuracy_meters, arrived_at)
             VALUES ($1, $2, $3, $4, TRUE, 'gps_proximity', $5, $6, $7)
             ON CONFLICT (ride_id, checkpoint_id, user_id) DO NOTHING
             RETURNING id`,
            [
              req.user.id,
              savedSession.ride,
              cp.id,
              savedSession.id,
              Math.round(bestDist),
              Math.round(bestPt.accuracyMeters || 0),
              bestPt.timestamp || new Date(),
            ]
          );
          if (inserted) {
            newlyVerifiedCheckpoints.push({
              checkpointId: cp.id,
              name: cp.name,
              sequenceNumber: cp.sequence_number,
            });
          }
        }
      }
    }

    const io = req.app.get('io') || getSocketIO();
    if (newlyVerifiedCheckpoints.length > 0) {
      await evaluateAndAwardAchievements({
        userId: req.user.id,
        io,
        reason: 'checkpoint_verified',
      });
    }

    const lastPt = analysis.acceptedPoints[analysis.acceptedPoints.length - 1] || null;
    await syncGroupLiveLocation({ session: savedSession, user: req.user, io, lastPoint: lastPt });

    return res.json({
      success: true,
      data: {
        session: savedSession,
        newlyVerifiedCheckpoints,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyCheckpointArrival(req, res, next) {
  try {
    const { id, checkpointId } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking session ID.' });
    }
    const row = await queryOne('SELECT * FROM tracking_sessions WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Tracking session not found.' });
    }
    if (row.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Tracking session must be active to verify a checkpoint.' });
    }
    if (!isValidUuid(checkpointId)) {
      return res.status(400).json({ success: false, message: 'Invalid checkpoint ID.' });
    }

    const cpRow = await queryOne('SELECT * FROM checkpoints WHERE id = $1', [checkpointId]);
    if (!cpRow) {
      return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    }
    if (row.ride_id && cpRow.ride_id !== row.ride_id) {
      return res.status(400).json({ success: false, message: 'Checkpoint does not belong to your active expedition.' });
    }

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const accuracyMeters = Number(req.body?.accuracyMeters ?? 25);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Valid GPS coordinates (lat, lng) are required for server-side checkpoint verification.',
      });
    }

    if (accuracyMeters > 120) {
      return res.status(422).json({
        success: false,
        message: `GPS accuracy (${Math.round(accuracyMeters)}m) is too coarse to verify this checkpoint. Move to open sky and retry.`,
      });
    }

    const distMeters = haversineMeters(lat, lng, Number(cpRow.lat), Number(cpRow.lng));
    const allowedRadius = cpRow.radius_meters || 250;
    if (distMeters > allowedRadius) {
      return res.status(422).json({
        success: false,
        message: `You are ${Math.round(distMeters)}m away from ${cpRow.name} (required within ${allowedRadius}m).`,
        distanceMeters: Math.round(distMeters),
        allowedRadiusMeters: allowedRadius,
      });
    }

    const existing = await queryOne(
      'SELECT * FROM checkpoint_arrivals WHERE ride_id = $1 AND checkpoint_id = $2 AND user_id = $3',
      [cpRow.ride_id, cpRow.id, req.user.id]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `${cpRow.name} has already been verified for your account.`,
        alreadyVerified: true,
        data: mapCheckpointArrival(existing),
      });
    }

    const arrivalRow = await queryOne(
      `INSERT INTO checkpoint_arrivals
         (user_id, ride_id, checkpoint_id, tracking_session_id, verified,
          verification_method, distance_from_checkpoint_meters, reported_accuracy_meters, arrived_at)
       VALUES ($1, $2, $3, $4, TRUE, 'gps_proximity', $5, $6, NOW())
       RETURNING *`,
      [req.user.id, cpRow.ride_id, cpRow.id, row.id, Math.round(distMeters), Math.round(accuracyMeters)]
    );

    const io = req.app.get('io') || getSocketIO();
    const achievementResult = await evaluateAndAwardAchievements({
      userId: req.user.id,
      io,
      reason: 'checkpoint_verified',
    });

    return res.status(201).json({
      success: true,
      message: `Checkpoint ${cpRow.name} verified (${Math.round(distMeters)}m from centre).`,
      data: mapCheckpointArrival(arrivalRow),
      newlyAwarded: achievementResult.newlyAwarded || [],
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleLocationSharing(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking session ID.' });
    }
    const row = await queryOne('SELECT * FROM tracking_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Tracking session not found.' });
    }
    if (!['active', 'paused'].includes(row.status)) {
      return res.status(400).json({ success: false, message: 'Only an active or paused session can toggle live sharing.' });
    }

    const enabled = Boolean(req.body?.enabled);
    let nextGroupId = row.group_id;

    if (req.body?.groupId) {
      if (!isValidUuid(String(req.body.groupId))) {
        return res.status(400).json({ success: false, message: 'Invalid group ID.' });
      }
      const member = await queryOne(
        "SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
        [req.body.groupId, req.user.id]
      );
      if (!member) {
        return res.status(403).json({ success: false, message: 'Only active group members can share live location with this group.' });
      }
      nextGroupId = req.body.groupId;
    }

    const updated = await queryOne(
      'UPDATE tracking_sessions SET group_id = $1, is_location_sharing_enabled = $2 WHERE id = $3 RETURNING *',
      [nextGroupId, enabled, row.id]
    );
    const session = mapTrackingSession(updated);

    const io = req.app.get('io') || getSocketIO();
    const lastPt = session.points?.length ? session.points[session.points.length - 1] : null;
    await syncGroupLiveLocation({ session, user: req.user, io, lastPoint: lastPt });

    return res.json({
      success: true,
      message: enabled
        ? 'Opt-in live location sharing enabled for your selected group/expedition.'
        : 'Live location sharing stopped immediately.',
      data: session,
    });
  } catch (err) {
    next(err);
  }
}

export async function stopTrackingSession(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking session ID.' });
    }

    const io = req.app.get('io') || getSocketIO();

    const outcome = await transaction(async (tx) => {
      const row = await tx.queryOne(
        'SELECT * FROM tracking_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [req.params.id, req.user.id]
      );
      if (!row) return { errorStatus: 404, errorMessage: 'Tracking session not found.' };

      const session = mapTrackingSession(row);
      if (['stopped', 'completed'].includes(session.status)) {
        return { errorStatus: 409, errorMessage: 'This tracking session has already been stopped and finalized.', session };
      }

      if (Array.isArray(req.body?.points) && req.body.points.length > 0) {
        applyTrackBatchToSession(session, req.body.points.slice(0, 500));
      } else if ((session.points || []).length > 1 && Number(session.stats?.totalPoints || 0) === 0) {
        applyTrackBatchToSession(session, []);
      }

      const now = new Date();
      if (session.status === 'active') {
        const elapsedSec = Math.max(0, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000));
        session.activeDurationSeconds = Math.max(session.activeDurationSeconds, elapsedSec);
      }

      session.endedAt = now;
      session.isLocationSharingEnabled = false;
      session.status = 'completed';
      session.submittedDistanceKm = session.estimatedDistanceKm;

      if (req.body?.shareSimplifiedRoutePublic === true) {
        session.shareSimplifiedRoutePublic = true;
        session.simplifiedPublicRoute = createSimplifiedPublicRoute(session.points);
      }

      await syncGroupLiveLocation({ session, user: req.user, io, lastPoint: null }, tx);

      let kmAwardedNow = 0;
      let achievementResult = { newlyAwarded: [], rankChanged: false };

      if (session.suspiciousFlags.length > 0 && session.verifiedDistanceKm === 0) {
        session.verificationStatus = 'flagged';
      } else if (session.verifiedDistanceKm > 0) {
        session.verificationStatus = session.suspiciousFlags.length > 0 ? 'flagged' : 'verified';
        if (!session.pointsAwardedToProfile && session.verificationStatus === 'verified') {
          kmAwardedNow = Number(session.verifiedDistanceKm.toFixed(1));
          session.pointsAwardedToProfile = true;

          await tx.query(
            'UPDATE rider_profiles SET verified_kilometres = ROUND((verified_kilometres + $1)::numeric, 1) WHERE user_id = $2',
            [kmAwardedNow, req.user.id]
          );
          achievementResult = await evaluateAndAwardAchievements({
            userId: req.user.id,
            io,
            reason: 'gps_tracking_verified',
            db: tx,
          });
        }
      } else {
        session.verificationStatus = 'verified';
      }

      const finalRow = await tx.queryOne(
        `UPDATE tracking_sessions SET
           status = $1,
           is_location_sharing_enabled = FALSE,
           share_simplified_route_public = $2,
           ended_at = $3,
           active_duration_seconds = $4,
           points = $5::jsonb,
           simplified_public_route = $6::jsonb,
           estimated_distance_km = $7,
           submitted_distance_km = $8,
           verified_distance_km = $9,
           points_awarded_to_profile = $10,
           verification_status = $11,
           suspicious_flags = $12::jsonb,
           stats = $13::jsonb
         WHERE id = $14
         RETURNING *`,
        [
          session.status,
          session.shareSimplifiedRoutePublic,
          session.endedAt,
          session.activeDurationSeconds,
          JSON.stringify(session.points),
          JSON.stringify(session.simplifiedPublicRoute),
          session.estimatedDistanceKm,
          session.submittedDistanceKm,
          session.verifiedDistanceKm,
          session.pointsAwardedToProfile,
          session.verificationStatus,
          JSON.stringify(session.suspiciousFlags),
          JSON.stringify(session.stats),
          session.id,
        ]
      );

      if (kmAwardedNow > 0) {
        await tx.query(
          `INSERT INTO notifications (recipient_id, type, title, body, link, metadata)
           VALUES ($1, 'tracking_verified', $2, $3, '/dashboard/rider/stats', $4::jsonb)`,
          [
            req.user.id,
            `Verified Ride Logged: +${kmAwardedNow} km`,
            `${session.title} added ${kmAwardedNow} verified kilometres to your KAAFILA riding log.`,
            JSON.stringify({ sessionId: session.id, verifiedDistanceKm: kmAwardedNow }),
          ]
        );
      }

      return { finalSession: mapTrackingSession(finalRow), kmAwardedNow, achievementResult };
    });

    if (outcome.errorStatus) {
      return res.status(outcome.errorStatus).json({
        success: false,
        message: outcome.errorMessage,
        ...(outcome.session ? { data: outcome.session } : {}),
      });
    }

    const { finalSession, kmAwardedNow, achievementResult } = outcome;

    return res.json({
      success: true,
      message:
        finalSession.verificationStatus === 'flagged'
          ? 'Session saved with suspicious speed flags under review; only verified segments were counted.'
          : kmAwardedNow > 0
            ? `Ride completed! ${kmAwardedNow} verified km added to your riding record.`
            : 'Tracking session stopped cleanly.',
      data: {
        session: finalSession,
        kmAwardedNow,
        newlyAwarded: achievementResult.newlyAwarded || [],
        rankChanged: Boolean(achievementResult.rankChanged),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function togglePublicRouteSummary(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking session ID.' });
    }
    const row = await queryOne('SELECT * FROM tracking_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Tracking session not found.' });
    }
    const share = Boolean(req.body?.shareSimplifiedRoutePublic);
    const simplified = share ? createSimplifiedPublicRoute(row.points) : [];

    await query(
      'UPDATE tracking_sessions SET share_simplified_route_public = $1, simplified_public_route = $2::jsonb WHERE id = $3',
      [share, JSON.stringify(simplified), row.id]
    );

    return res.json({
      success: true,
      message: share
        ? 'Coarsened route summary enabled on your public profile.'
        : 'Route summary hidden from public view.',
      data: {
        _id: row.id,
        id: row.id,
        shareSimplifiedRoutePublic: share,
        simplifiedPublicRoute: simplified,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listMyTrackingSessions(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 15, maxLimit: 50 });

    const [sessionsRes, totalRes, activeRow] = await Promise.all([
      query(
        `SELECT ts.*,
           r.title AS ride_title, r.slug AS ride_slug, r.region AS ride_region, r.distance_km AS ride_distance_km,
           g.name AS group_name, g.slug AS group_slug
         FROM tracking_sessions ts
         LEFT JOIN rides r ON r.id = ts.ride_id
         LEFT JOIN kafila_groups g ON g.id = ts.group_id
         WHERE ts.user_id = $1
         ORDER BY ts.started_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, skip]
      ),
      queryOne('SELECT COUNT(*)::int AS total FROM tracking_sessions WHERE user_id = $1', [req.user.id]),
      queryOne(
        `SELECT ts.*,
           r.title AS ride_title, r.slug AS ride_slug, r.region AS ride_region,
           g.name AS group_name, g.slug AS group_slug
         FROM tracking_sessions ts
         LEFT JOIN rides r ON r.id = ts.ride_id
         LEFT JOIN kafila_groups g ON g.id = ts.group_id
         WHERE ts.user_id = $1 AND ts.status IN ('active', 'paused')
         ORDER BY ts.started_at DESC
         LIMIT 1`,
        [req.user.id]
      ),
    ]);

    const sessionIds = sessionsRes.rows.map((s) => s.id);
    const cpMap = new Map();
    if (sessionIds.length > 0) {
      const cpRes = await query(
        `SELECT tracking_session_id, COUNT(*)::int AS count
         FROM checkpoint_arrivals
         WHERE user_id = $1 AND tracking_session_id = ANY($2::uuid[]) AND verified = TRUE
         GROUP BY tracking_session_id`,
        [req.user.id, sessionIds]
      );
      for (const c of cpRes.rows) {
        cpMap.set(c.tracking_session_id, c.count);
      }
    }

    const enriched = sessionsRes.rows.map((row) => ({
      ...mapTrackingSession(row, {
        ride: row.ride_id
          ? {
              _id: row.ride_id,
              id: row.ride_id,
              title: row.ride_title,
              slug: row.ride_slug,
              region: row.ride_region,
              distanceKm: row.ride_distance_km,
            }
          : null,
        group: row.group_id
          ? { _id: row.group_id, id: row.group_id, name: row.group_name, slug: row.group_slug }
          : null,
      }),
      checkpointsCompleted: cpMap.get(row.id) || 0,
    }));

    const activeSession = activeRow
      ? mapTrackingSession(activeRow, {
          ride: activeRow.ride_id
            ? {
                _id: activeRow.ride_id,
                id: activeRow.ride_id,
                title: activeRow.ride_title,
                slug: activeRow.ride_slug,
                region: activeRow.ride_region,
              }
            : null,
          group: activeRow.group_id
            ? { _id: activeRow.group_id, id: activeRow.group_id, name: activeRow.group_name, slug: activeRow.group_slug }
            : null,
        })
      : null;

    const total = totalRes?.total || 0;

    return res.json({
      success: true,
      data: enriched,
      activeSession,
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

export async function getTrackingSessionById(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID.' });
    }
    const row = await queryOne(
      `SELECT ts.*,
         r.title AS ride_title, r.slug AS ride_slug, r.region AS ride_region,
         r.start_location AS ride_start_location, r.end_location AS ride_end_location,
         r.distance_km AS ride_distance_km, r.route AS ride_route,
         g.name AS group_name, g.slug AS group_slug
       FROM tracking_sessions ts
       LEFT JOIN rides r ON r.id = ts.ride_id
       LEFT JOIN kafila_groups g ON g.id = ts.group_id
       WHERE ts.id = $1 AND ts.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!row) {
      return res.status(404).json({ success: false, message: 'Tracking session not found.' });
    }

    const arrivalsRes = await query(
      `SELECT ca.*, cp.name AS cp_name, cp.type AS cp_type, cp.sequence_number AS cp_seq,
              cp.lng AS cp_lng, cp.lat AS cp_lat
       FROM checkpoint_arrivals ca
       JOIN checkpoints cp ON cp.id = ca.checkpoint_id
       WHERE ca.user_id = $1 AND ca.tracking_session_id = $2`,
      [req.user.id, row.id]
    );

    const session = mapTrackingSession(row, {
      ride: row.ride_id
        ? {
            _id: row.ride_id,
            id: row.ride_id,
            title: row.ride_title,
            slug: row.ride_slug,
            region: row.ride_region,
            startLocation: row.ride_start_location,
            endLocation: row.ride_end_location,
            distanceKm: row.ride_distance_km,
            route: row.ride_route,
          }
        : null,
      group: row.group_id
        ? { _id: row.group_id, id: row.group_id, name: row.group_name, slug: row.group_slug }
        : null,
    });

    const arrivals = arrivalsRes.rows.map((a) =>
      mapCheckpointArrival(a, {
        checkpoint: {
          _id: a.checkpoint_id,
          id: a.checkpoint_id,
          name: a.cp_name,
          type: a.cp_type,
          sequenceNumber: a.cp_seq,
          coordinates: [Number(a.cp_lng), Number(a.cp_lat)],
        },
      })
    );

    return res.json({
      success: true,
      data: {
        session,
        arrivals,
      },
    });
  } catch (err) {
    next(err);
  }
}
