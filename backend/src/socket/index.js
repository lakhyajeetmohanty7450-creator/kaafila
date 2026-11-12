import { Server } from 'socket.io';
import { query, queryOne, transaction } from '../config/pg.js';
import { env } from '../config/env.js';
import { verifyToken } from '../middleware/auth.js';
import { mapMessage, mapUser } from '../repositories/mappers.js';
import { haversineMeters, isValidCoordPair } from '../utils/geo.js';
import { createAndEmitNotification, setSocketIO } from '../utils/notify.js';
import { isValidUuid } from '../utils/validators.js';

const onlineSocketsByUser = new Map(); // userId -> Set<socketId>

export function getOnlineUserIds() {
  return Array.from(onlineSocketsByUser.keys());
}

export function isUserOnline(userId) {
  return onlineSocketsByUser.has(String(userId));
}

function addOnlineSocket(userId, socketId) {
  const key = String(userId);
  if (!onlineSocketsByUser.has(key)) {
    onlineSocketsByUser.set(key, new Set());
  }
  onlineSocketsByUser.get(key).add(socketId);
  return onlineSocketsByUser.get(key).size === 1;
}

function removeOnlineSocket(userId, socketId) {
  const key = String(userId);
  const set = onlineSocketsByUser.get(key);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    onlineSocketsByUser.delete(key);
    return true;
  }
  return false;
}

export function attachSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientUrl.split(',').map((s) => s.trim()),
      credentials: true,
    },
  });

  setSocketIO(io);

  // Strict JWT authentication middleware for all Socket.IO connections
  io.use(async (socket, next) => {
    try {
      const authToken =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.split(' ')[1]
          : null);

      if (!authToken) {
        return next(new Error('Authentication required.'));
      }

      const decoded = verifyToken(authToken);
      if (!isValidUuid(String(decoded.id || ''))) {
        return next(new Error('Invalid or expired socket token.'));
      }

      const userRow = await queryOne(
        'SELECT id, full_name, avatar_url, role, is_active, token_version FROM users WHERE id = $1',
        [decoded.id]
      );
      if (!userRow || !userRow.is_active) {
        return next(new Error('Account not found or inactive.'));
      }
      if (Number(decoded.tv ?? 0) !== Number(userRow.token_version ?? 0)) {
        return next(new Error('Session has been invalidated. Please log in again.'));
      }

      socket.user = mapUser(userRow, { includeEmail: false, includePhone: false });
      return next();
    } catch {
      return next(new Error('Invalid or expired socket token.'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = String(socket.user.id);
    socket.join(`user:${userId}`);

    const becameOnline = addOnlineSocket(userId, socket.id);
    socket.emit('presence:list', { onlineUserIds: getOnlineUserIds() });
    if (becameOnline) {
      socket.broadcast.emit('presence:online', { userId });
    }

    const msgTimestamps = [];
    const checkSocketMsgRate = () => {
      const now = Date.now();
      while (msgTimestamps.length && now - msgTimestamps[0] > 60000) {
        msgTimestamps.shift();
      }
      if (msgTimestamps.length >= 60) return false;
      msgTimestamps.push(now);
      return true;
    };

    // --- 1:1 Private Conversation Rooms ---
    socket.on('conversation:join', async (conversationId, ack) => {
      try {
        if (!isValidUuid(String(conversationId || ''))) {
          return ack?.({ ok: false, message: 'Invalid conversation ID.' });
        }
        const conv = await queryOne(
          'SELECT participant_a_id, participant_b_id FROM conversations WHERE id = $1',
          [conversationId]
        );
        const isParticipant =
          conv && (conv.participant_a_id === userId || conv.participant_b_id === userId);
        if (!isParticipant) {
          return ack?.({ ok: false, message: 'Access denied to this conversation.' });
        }
        await socket.join(`conv:${conversationId}`);
        return ack?.({ ok: true });
      } catch {
        return ack?.({ ok: false, message: 'Could not join conversation.' });
      }
    });

    socket.on('conversation:leave', async (conversationId) => {
      if (isValidUuid(String(conversationId || ''))) {
        await socket.leave(`conv:${conversationId}`);
      }
    });

    socket.on('private:typing', async ({ conversationId, isTyping }, ack) => {
      try {
        if (!isValidUuid(String(conversationId || ''))) return ack?.({ ok: false });
        const conv = await queryOne(
          'SELECT participant_a_id, participant_b_id FROM conversations WHERE id = $1',
          [conversationId]
        );
        if (!conv || (conv.participant_a_id !== userId && conv.participant_b_id !== userId)) {
          return ack?.({ ok: false, message: 'Unauthorized.' });
        }
        socket.to(`conv:${conversationId}`).emit('private:typing', {
          conversationId,
          userId,
          fullName: socket.user.fullName,
          isTyping: Boolean(isTyping),
        });
        return ack?.({ ok: true });
      } catch {
        return ack?.({ ok: false });
      }
    });

    socket.on('private:send', async ({ conversationId, content }, ack) => {
      try {
        if (!checkSocketMsgRate()) {
          return ack?.({ ok: false, message: 'Messaging rate limit exceeded. Please slow down.' });
        }
        if (!isValidUuid(String(conversationId || ''))) {
          return ack?.({ ok: false, message: 'Invalid conversation ID.' });
        }
        const cleanContent = typeof content === 'string' ? content.trim() : '';
        if (!cleanContent || cleanContent.length > 2000) {
          return ack?.({ ok: false, message: 'Message must be 1 to 2000 characters.' });
        }

        const result = await transaction(async (tx) => {
          const conv = await tx.queryOne('SELECT * FROM conversations WHERE id = $1 FOR UPDATE', [conversationId]);
          if (!conv || (conv.participant_a_id !== userId && conv.participant_b_id !== userId)) {
            return { error: 'Access denied to this conversation.' };
          }

          const recipientId = conv.participant_a_id === userId ? conv.participant_b_id : conv.participant_a_id;
          const activeConn = await tx.queryOne(
            `SELECT id FROM connections
             WHERE status = 'accepted'
               AND ((requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1))
             LIMIT 1`,
            [userId, recipientId]
          );

          if (!activeConn) {
            return { error: 'You can only message connected riders.' };
          }

          const msgRow = await tx.queryOne(
            `INSERT INTO messages (sender_id, conversation_id, recipient_user_id, message_type, content, read_by)
             VALUES ($1, $2, $3, 'text', $4, ARRAY[$1::uuid])
             RETURNING *`,
            [userId, conv.id, recipientId, cleanContent]
          );

          await tx.query(
            `UPDATE conversations
             SET last_message_id = $1, last_message_text = $2, last_message_at = $3
             WHERE id = $4`,
            [msgRow.id, cleanContent.slice(0, 180), msgRow.created_at, conv.id]
          );

          return { conv, msgRow, recipientId };
        });

        if (result.error) {
          return ack?.({ ok: false, message: result.error });
        }

        const populated = mapMessage(result.msgRow, {
          sender: {
            _id: userId,
            id: userId,
            fullName: socket.user.fullName,
            avatarUrl: socket.user.avatarUrl || '',
            role: socket.user.role,
          },
        });

        io.to(`conv:${conversationId}`).emit('private:message', populated);
        io.to(`user:${result.recipientId}`).emit('private:conversation_updated', {
          conversationId: result.conv.id,
          message: populated,
        });

        await createAndEmitNotification({
          recipient: result.recipientId,
          actor: userId,
          type: 'private_message',
          title: `New message from ${socket.user.fullName}`,
          body: cleanContent.slice(0, 140),
          link: `/community/messages/${result.conv.id}`,
          metadata: { conversationId: result.conv.id },
        });

        return ack?.({ ok: true, data: populated });
      } catch {
        return ack?.({ ok: false, message: 'Failed to send message.' });
      }
    });

    // --- KAAFILA Group Chat Rooms ---
    socket.on('group:join', async (groupId, ack) => {
      try {
        if (!isValidUuid(String(groupId || ''))) {
          return ack?.({ ok: false, message: 'Invalid group ID.' });
        }
        const member = await queryOne(
          "SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
          [groupId, userId]
        );
        if (!member) {
          return ack?.({ ok: false, message: 'Only active group members can join this chat room.' });
        }

        const room = `group:${groupId}`;
        await socket.join(room);

        const roomSockets = await io.in(room).fetchSockets();
        const onlineMemberIds = Array.from(new Set(roomSockets.map((s) => String(s.user.id))));
        io.to(room).emit('group:presence', { groupId, onlineMemberIds });

        return ack?.({ ok: true, onlineMemberIds });
      } catch {
        return ack?.({ ok: false, message: 'Could not join group room.' });
      }
    });

    socket.on('group:leave', async (groupId) => {
      if (!isValidUuid(String(groupId || ''))) return;
      const room = `group:${groupId}`;
      await socket.leave(room);
      const roomSockets = await io.in(room).fetchSockets();
      const onlineMemberIds = Array.from(new Set(roomSockets.map((s) => String(s.user.id))));
      io.to(room).emit('group:presence', { groupId, onlineMemberIds });
    });

    socket.on('group:typing', async ({ groupId, isTyping }, ack) => {
      try {
        if (!isValidUuid(String(groupId || ''))) return ack?.({ ok: false });
        const member = await queryOne(
          "SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
          [groupId, userId]
        );
        if (!member) return ack?.({ ok: false, message: 'Unauthorized.' });

        socket.to(`group:${groupId}`).emit('group:typing', {
          groupId,
          userId,
          fullName: socket.user.fullName,
          isTyping: Boolean(isTyping),
        });
        return ack?.({ ok: true });
      } catch {
        return ack?.({ ok: false });
      }
    });

    socket.on('group:send', async ({ groupId, content }, ack) => {
      try {
        if (!checkSocketMsgRate()) {
          return ack?.({ ok: false, message: 'Messaging rate limit exceeded. Please slow down.' });
        }
        if (!isValidUuid(String(groupId || ''))) {
          return ack?.({ ok: false, message: 'Invalid group ID.' });
        }
        const cleanContent = typeof content === 'string' ? content.trim() : '';
        if (!cleanContent || cleanContent.length > 2000) {
          return ack?.({ ok: false, message: 'Message must be 1 to 2000 characters.' });
        }

        const [group, member] = await Promise.all([
          queryOne('SELECT id, name FROM kafila_groups WHERE id = $1', [groupId]),
          queryOne(
            "SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
            [groupId, userId]
          ),
        ]);

        if (!group || !member) {
          return ack?.({ ok: false, message: 'Only active group members can post messages.' });
        }

        const msgRow = await transaction(async (tx) => {
          const m = await tx.queryOne(
            `INSERT INTO messages (sender_id, group_id, message_type, content, read_by)
             VALUES ($1, $2, 'text', $3, ARRAY[$1::uuid])
             RETURNING *`,
            [userId, group.id, cleanContent]
          );
          await tx.query('UPDATE group_members SET last_read_at = NOW() WHERE id = $1', [member.id]);
          return m;
        });

        const populated = mapMessage(msgRow, {
          sender: {
            _id: userId,
            id: userId,
            fullName: socket.user.fullName,
            avatarUrl: socket.user.avatarUrl || '',
            role: socket.user.role,
          },
        });

        io.to(`group:${groupId}`).emit('group:message', populated);
        return ack?.({ ok: true, data: populated });
      } catch {
        return ack?.({ ok: false, message: 'Failed to send group message.' });
      }
    });

    // Phase 4: Live Opt-In Group Location Sharing
    const locUpdateTimestamps = [];
    const lastSentLocationByGroup = new Map();

    const checkSocketLocRate = () => {
      const now = Date.now();
      while (locUpdateTimestamps.length && now - locUpdateTimestamps[0] > 10000) {
        locUpdateTimestamps.shift();
      }
      if (locUpdateTimestamps.length >= 10) return false;
      locUpdateTimestamps.push(now);
      return true;
    };

    socket.on('group:location_join', async ({ groupId }, ack) => {
      try {
        if (!isValidUuid(String(groupId || ''))) {
          return ack?.({ ok: false, message: 'Invalid group ID.' });
        }
        const member = await queryOne(
          "SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
          [groupId, userId]
        );
        if (!member) {
          return ack?.({ ok: false, message: 'Only active group members can view live convoy locations.' });
        }

        socket.join(`group-loc:${groupId}`);

        // Cleanup stale (>6h) ephemeral group coordinates, then read fresh snapshot
        await query("DELETE FROM group_locations WHERE updated_at < NOW() - INTERVAL '6 hours'");
        const snapshotRes = await query(
          `SELECT gl.*, u.full_name, u.avatar_url
           FROM group_locations gl
           JOIN users u ON u.id = gl.user_id
           WHERE gl.group_id = $1
             AND gl.sharing_enabled = TRUE
             AND gl.updated_at >= NOW() - INTERVAL '6 hours'`,
          [groupId]
        );

        const riders = snapshotRes.rows
          .filter((loc) => Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng)))
          .map((loc) => ({
            groupId: String(groupId),
            userId: loc.user_id,
            fullName: loc.full_name,
            avatarUrl: loc.avatar_url || '',
            lat: Number(loc.lat),
            lng: Number(loc.lng),
            accuracyMeters: loc.accuracy_meters,
            heading: loc.heading,
            speedKmh: loc.speed_kmh,
            updatedAt: loc.updated_at,
          }));

        socket.emit('group:locations_snapshot', { groupId: String(groupId), riders });
        return ack?.({ ok: true, riders });
      } catch {
        return ack?.({ ok: false, message: 'Failed to join group live map.' });
      }
    });

    socket.on('group:location_leave', ({ groupId }) => {
      if (isValidUuid(String(groupId || ''))) {
        socket.leave(`group-loc:${groupId}`);
      }
    });

    socket.on(
      'group:location_update',
      async ({ groupId, lat, lng, accuracyMeters = 25, heading = null, speedKmh = null, sessionId = null }, ack) => {
        try {
          if (!checkSocketLocRate()) {
            return ack?.({ ok: false, message: 'Location update rate limit exceeded. Slow down.' });
          }
          if (!isValidUuid(String(groupId || ''))) {
            return ack?.({ ok: false, message: 'Invalid group ID.' });
          }

          const numLat = Number(lat);
          const numLng = Number(lng);
          if (!isValidCoordPair(numLng, numLat)) {
            return ack?.({ ok: false, message: 'Invalid GPS coordinates.' });
          }

          const member = await queryOne(
            "SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
            [groupId, userId]
          );
          if (!member) {
            return ack?.({ ok: false, message: 'Only active group members can share live location.' });
          }

          const activeSession =
            sessionId && isValidUuid(String(sessionId))
              ? await queryOne(
                  "SELECT id, group_id FROM tracking_sessions WHERE id = $1 AND user_id = $2 AND status = 'active' AND is_location_sharing_enabled = TRUE",
                  [sessionId, userId]
                )
              : await queryOne(
                  "SELECT id, group_id FROM tracking_sessions WHERE user_id = $1 AND status = 'active' AND is_location_sharing_enabled = TRUE ORDER BY started_at DESC LIMIT 1",
                  [userId]
                );

          if (!activeSession) {
            return ack?.({
              ok: false,
              message: 'Enable opt-in location sharing in your active tracking session first.',
            });
          }

          const gKey = String(groupId);
          const prev = lastSentLocationByGroup.get(gKey);
          const nowTs = Date.now();
          if (prev) {
            const movedMeters = haversineMeters(prev.lat, prev.lng, numLat, numLng);
            if (movedMeters < 3 && nowTs - prev.ts < 4000) {
              return ack?.({ ok: true, throttled: true });
            }
          }
          lastSentLocationByGroup.set(gKey, { lat: numLat, lng: numLng, ts: nowTs });

          const acc = Math.round(Math.max(0, Math.min(5000, Number(accuracyMeters) || 25)));
          const cleanHeading = heading !== null && Number.isFinite(Number(heading)) ? Number(heading) : null;
          const cleanSpeed = speedKmh !== null && Number.isFinite(Number(speedKmh)) ? Number(speedKmh) : null;

          const locRow = await queryOne(
            `INSERT INTO group_locations
               (group_id, user_id, tracking_session_id, sharing_enabled, lat, lng, accuracy_meters, heading, speed_kmh, updated_at)
             VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (group_id, user_id)
             DO UPDATE SET
               tracking_session_id = EXCLUDED.tracking_session_id,
               sharing_enabled = TRUE,
               lat = EXCLUDED.lat,
               lng = EXCLUDED.lng,
               accuracy_meters = EXCLUDED.accuracy_meters,
               heading = EXCLUDED.heading,
               speed_kmh = EXCLUDED.speed_kmh,
               updated_at = NOW()
             RETURNING updated_at`,
            [groupId, userId, activeSession.id, numLat, numLng, acc, cleanHeading, cleanSpeed]
          );

          const payload = {
            groupId: gKey,
            userId,
            fullName: socket.user.fullName,
            avatarUrl: socket.user.avatarUrl || '',
            lat: numLat,
            lng: numLng,
            accuracyMeters: acc,
            heading: cleanHeading,
            speedKmh: cleanSpeed,
            updatedAt: new Date(locRow?.updated_at || Date.now()).toISOString(),
          };

          io.to(`group-loc:${gKey}`).emit('group:location_update', payload);
          io.to(`group:${gKey}`).emit('group:location_update', payload);
          return ack?.({ ok: true, data: payload });
        } catch {
          return ack?.({ ok: false, message: 'Failed to broadcast live location.' });
        }
      }
    );

    socket.on('group:location_stop', async ({ groupId }, ack) => {
      try {
        if (!isValidUuid(String(groupId || ''))) return ack?.({ ok: false });
        const gKey = String(groupId);
        await query(
          'UPDATE group_locations SET sharing_enabled = FALSE, updated_at = NOW() WHERE group_id = $1 AND user_id = $2',
          [groupId, userId]
        );
        lastSentLocationByGroup.delete(gKey);
        io.to(`group-loc:${gKey}`).emit('group:location_stop', { groupId: gKey, userId });
        io.to(`group:${gKey}`).emit('group:location_stop', { groupId: gKey, userId });
        return ack?.({ ok: true });
      } catch {
        return ack?.({ ok: false });
      }
    });

    socket.on('disconnect', async () => {
      const wentOffline = removeOnlineSocket(userId, socket.id);
      if (wentOffline) {
        socket.broadcast.emit('presence:offline', { userId });
        try {
          const activeRes = await query(
            'UPDATE group_locations SET sharing_enabled = FALSE, updated_at = NOW() WHERE user_id = $1 AND sharing_enabled = TRUE RETURNING group_id',
            [userId]
          );
          for (const loc of activeRes.rows) {
            const gKey = loc.group_id;
            io.to(`group-loc:${gKey}`).emit('group:location_stop', { groupId: gKey, userId });
            io.to(`group:${gKey}`).emit('group:location_stop', { groupId: gKey, userId });
          }
        } catch {
          // Ignore disconnect cleanup error
        }
      }
    });
  });

  return io;
}
