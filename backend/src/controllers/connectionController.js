import { query, queryOne, transaction } from '../config/pg.js';
import { fetchUsersMap } from '../repositories/common.js';
import { mapConnection } from '../repositories/mappers.js';
import { createAndEmitNotification } from '../utils/notify.js';
import { isValidUuid } from '../utils/validators.js';

function sanitizeRiderPeer(user, profile, badgeRows) {
  if (!user) return null;
  return {
    _id: user.id,
    id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl || '',
    handle: profile?.handle || '',
    homeCity: profile?.home_city || user.city || '',
    primaryMotorcycle: profile?.primary_motorcycle || '',
    ridingExperience: profile?.riding_experience || 'beginner',
    verifiedKilometres: Number(profile?.verified_kilometres || 0),
    completedExpeditions: Number(profile?.completed_expeditions || 0),
    rank: profile?.rank || 'Beginner',
    badges: badgeRows || [],
  };
}

async function fetchProfilesMap(userIds) {
  const uniqueIds = Array.from(new Set(userIds.filter((id) => isValidUuid(String(id))).map(String)));
  if (uniqueIds.length === 0) return new Map();

  const [profilesRes, badgesRes] = await Promise.all([
    query('SELECT * FROM rider_profiles WHERE user_id = ANY($1::uuid[])', [uniqueIds]),
    query(
      'SELECT user_id, achievement_code AS code, title, awarded_at FROM rider_achievements WHERE user_id = ANY($1::uuid[]) ORDER BY awarded_at ASC',
      [uniqueIds]
    ),
  ]);

  const badgeMap = new Map();
  for (const b of badgesRes.rows) {
    if (!badgeMap.has(b.user_id)) badgeMap.set(b.user_id, []);
    badgeMap.get(b.user_id).push({ code: b.code, title: b.title, awardedAt: b.awarded_at });
  }

  return new Map(
    profilesRes.rows.map((p) => [p.user_id, { profile: p, badges: badgeMap.get(p.user_id) || [] }])
  );
}

export async function listConnections(req, res, next) {
  try {
    const userId = req.user.id;
    const connRes = await query(
      `SELECT * FROM connections
       WHERE status = 'accepted' AND (requester_id = $1 OR recipient_id = $1)
       ORDER BY updated_at DESC`,
      [userId]
    );

    const peerIds = connRes.rows.map((c) => (c.requester_id === userId ? c.recipient_id : c.requester_id));
    const [usersMap, profileBundleMap] = await Promise.all([
      fetchUsersMap(peerIds, { includeEmail: false, includePhone: false }),
      fetchProfilesMap(peerIds),
    ]);

    const data = connRes.rows
      .map((conn) => {
        const peerId = conn.requester_id === userId ? conn.recipient_id : conn.requester_id;
        const peerUser = usersMap.get(peerId);
        if (!peerUser) return null;
        const bundle = profileBundleMap.get(peerId);
        const peerProfile = bundle?.profile;
        const badges = bundle?.badges || [];
        return {
          _id: conn.id,
          id: conn.id,
          status: conn.status,
          connectedAt: conn.updated_at,
          user: {
            _id: peerUser.id,
            id: peerUser.id,
            fullName: peerUser.fullName,
            avatarUrl: peerUser.avatarUrl || '',
            city: peerUser.city || '',
          },
          riderProfile: peerProfile
            ? {
                _id: peerProfile.id,
                id: peerProfile.id,
                handle: peerProfile.handle,
                homeCity: peerProfile.home_city || peerUser.city || '',
                primaryMotorcycle: peerProfile.primary_motorcycle || '',
                ridingExperience: peerProfile.riding_experience || 'beginner',
                verifiedKilometres: Number(peerProfile.verified_kilometres || 0),
                completedExpeditions: Number(peerProfile.completed_expeditions || 0),
                rank: peerProfile.rank || 'Beginner',
                badges,
              }
            : null,
          rider: sanitizeRiderPeer(peerUser, peerProfile, badges),
        };
      })
      .filter(Boolean);

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listConnectionRequests(req, res, next) {
  try {
    const userId = req.user.id;
    const [incomingRes, outgoingRes] = await Promise.all([
      query(
        "SELECT * FROM connections WHERE recipient_id = $1 AND status = 'pending' ORDER BY created_at DESC",
        [userId]
      ),
      query(
        "SELECT * FROM connections WHERE requester_id = $1 AND status = 'pending' ORDER BY created_at DESC",
        [userId]
      ),
    ]);

    const userIds = [
      ...incomingRes.rows.map((c) => c.requester_id),
      ...outgoingRes.rows.map((c) => c.recipient_id),
    ];

    const [usersMap, profileBundleMap] = await Promise.all([
      fetchUsersMap(userIds, { includeEmail: false, includePhone: false }),
      fetchProfilesMap(userIds),
    ]);

    const mapReq = (conn, isIncoming) => {
      const peerId = isIncoming ? conn.requester_id : conn.recipient_id;
      const peerUser = usersMap.get(peerId);
      const bundle = profileBundleMap.get(peerId);
      const peerProfile = bundle?.profile;
      const badges = bundle?.badges || [];
      return {
        _id: conn.id,
        id: conn.id,
        status: conn.status,
        createdAt: conn.created_at,
        user: peerUser
          ? {
              _id: peerUser.id,
              id: peerUser.id,
              fullName: peerUser.fullName,
              avatarUrl: peerUser.avatarUrl || '',
              city: peerUser.city || '',
            }
          : null,
        riderProfile: peerProfile
          ? {
              _id: peerProfile.id,
              id: peerProfile.id,
              handle: peerProfile.handle,
              homeCity: peerProfile.home_city || peerUser?.city || '',
              primaryMotorcycle: peerProfile.primary_motorcycle || '',
              ridingExperience: peerProfile.riding_experience || 'beginner',
              verifiedKilometres: Number(peerProfile.verified_kilometres || 0),
              completedExpeditions: Number(peerProfile.completed_expeditions || 0),
              rank: peerProfile.rank || 'Beginner',
              badges,
            }
          : null,
        rider: sanitizeRiderPeer(peerUser, peerProfile, badges),
      };
    };

    return res.json({
      success: true,
      data: {
        incoming: incomingRes.rows.map((c) => mapReq(c, true)).filter((item) => item.user),
        outgoing: outgoingRes.rows.map((c) => mapReq(c, false)).filter((item) => item.user),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function sendConnectionRequest(req, res, next) {
  try {
    const { riderId } = req.params;
    if (!isValidUuid(riderId)) {
      return res.status(400).json({ success: false, message: 'Invalid rider ID.' });
    }

    if (riderId === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot connect with yourself.' });
    }

    const targetUser = await queryOne(
      'SELECT id, role, is_active, full_name FROM users WHERE id = $1',
      [riderId]
    );
    if (!targetUser || !targetUser.is_active || targetUser.role !== 'rider') {
      return res.status(404).json({ success: false, message: 'Target rider account not found.' });
    }

    const existing = await queryOne(
      `SELECT * FROM connections
       WHERE (requester_id = $1 AND recipient_id = $2)
          OR (requester_id = $2 AND recipient_id = $1)
       LIMIT 1`,
      [req.user.id, riderId]
    );

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(409).json({ success: false, message: 'You are already connected with this rider.' });
      }
      if (existing.status === 'pending') {
        return res.status(409).json({
          success: false,
          message:
            existing.requester_id === req.user.id
              ? 'Connection request already sent.'
              : 'This rider has already sent you a request.',
        });
      }
      if (existing.status === 'blocked') {
        return res.status(403).json({ success: false, message: 'Unable to connect with this rider.' });
      }

      const updated = await queryOne(
        `UPDATE connections SET requester_id = $1, recipient_id = $2, status = 'pending'
         WHERE id = $3
         RETURNING *`,
        [req.user.id, riderId, existing.id]
      );

      await createAndEmitNotification({
        recipient: riderId,
        actor: req.user.id,
        type: 'connection_request',
        title: `${req.user.fullName} wants to connect`,
        body: 'Review incoming rider connection requests on KAAFILA.',
        link: '/community/riders?tab=requests',
        metadata: { connectionId: updated.id },
      });

      return res.status(201).json({
        success: true,
        message: 'Connection request sent.',
        data: mapConnection(updated),
      });
    }

    const created = await queryOne(
      `INSERT INTO connections (requester_id, recipient_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [req.user.id, riderId]
    );

    await createAndEmitNotification({
      recipient: riderId,
      actor: req.user.id,
      type: 'connection_request',
      title: `${req.user.fullName} sent you a connection request`,
      body: 'Open your KAAFILA connections to accept or respond.',
      link: '/community/riders?tab=requests',
      metadata: { connectionId: created.id },
    });

    return res.status(201).json({
      success: true,
      message: 'Connection request sent.',
      data: mapConnection(created),
    });
  } catch (err) {
    next(err);
  }
}

export async function acceptConnectionRequest(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid connection ID.' });
    }

    const updated = await transaction(async (tx) => {
      const existing = await tx.queryOne('SELECT * FROM connections WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!existing) return { errorStatus: 404, errorMessage: 'Connection request not found.' };

      if (existing.recipient_id !== req.user.id) {
        return { errorStatus: 403, errorMessage: 'Only the recipient can accept a connection request.' };
      }

      if (existing.status !== 'pending') {
        return {
          errorStatus: 400,
          errorMessage: `Cannot accept a connection with status "${existing.status}".`,
        };
      }

      const row = await tx.queryOne(
        "UPDATE connections SET status = 'accepted' WHERE id = $1 RETURNING *",
        [existing.id]
      );

      await createAndEmitNotification(
        {
          recipient: row.requester_id,
          actor: req.user.id,
          type: 'connection_accepted',
          title: `${req.user.fullName} accepted your connection request`,
          body: 'You can now message each other in KAAFILA direct chat.',
          link: '/community/messages',
          metadata: { connectionId: row.id },
        },
        tx
      );

      return { row };
    });

    if (updated.errorStatus) {
      return res.status(updated.errorStatus).json({ success: false, message: updated.errorMessage });
    }

    return res.json({
      success: true,
      message: 'Connection accepted.',
      data: mapConnection(updated.row),
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectConnectionRequest(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid connection ID.' });
    }

    const conn = await queryOne('SELECT * FROM connections WHERE id = $1', [req.params.id]);
    if (!conn) {
      return res.status(404).json({ success: false, message: 'Connection request not found.' });
    }

    if (conn.recipient_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the recipient can reject a connection request.' });
    }

    if (conn.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot reject a connection with status "${conn.status}".`,
      });
    }

    const updated = await queryOne(
      "UPDATE connections SET status = 'declined' WHERE id = $1 RETURNING *",
      [conn.id]
    );

    return res.json({
      success: true,
      message: 'Connection request declined.',
      data: mapConnection(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteConnection(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid connection ID.' });
    }

    const conn = await queryOne('SELECT * FROM connections WHERE id = $1', [req.params.id]);
    if (!conn) {
      return res.status(404).json({ success: false, message: 'Connection not found.' });
    }

    const isRequester = conn.requester_id === req.user.id;
    const isRecipient = conn.recipient_id === req.user.id;

    if (!isRequester && !isRecipient) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (conn.status === 'pending' && !isRequester) {
      return res.status(403).json({
        success: false,
        message: 'Only the sender can cancel an outgoing request. Recipients can reject it instead.',
      });
    }

    await query('DELETE FROM connections WHERE id = $1', [conn.id]);

    return res.json({
      success: true,
      message: conn.status === 'pending' ? 'Connection request cancelled.' : 'Connection removed.',
    });
  } catch (err) {
    next(err);
  }
}
