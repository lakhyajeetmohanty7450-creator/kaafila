import { query, queryOne, transaction } from '../config/pg.js';
import { fetchUsersMap, makeParticipantKey } from '../repositories/common.js';
import { mapConversation, mapMessage } from '../repositories/mappers.js';
import { createAndEmitNotification, getSocketIO } from '../utils/notify.js';
import { isValidUuid, parsePagination } from '../utils/validators.js';

async function areUsersConnected(userAId, userBId, db = null) {
  const runner = db || { queryOne };
  const conn = await runner.queryOne(
    `SELECT id FROM connections
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1))
     LIMIT 1`,
    [userAId, userBId]
  );
  return Boolean(conn);
}

export async function listConversations(req, res, next) {
  try {
    const userId = req.user.id;
    const convRes = await query(
      `SELECT * FROM conversations
       WHERE participant_a_id = $1 OR participant_b_id = $1
       ORDER BY last_message_at DESC`,
      [userId]
    );

    const convRows = convRes.rows;
    const convIds = convRows.map((c) => c.id);
    const peerIds = convRows.map((c) => (c.participant_a_id === userId ? c.participant_b_id : c.participant_a_id));

    const [usersMap, profilesRes, unreadRes] = await Promise.all([
      fetchUsersMap(peerIds, { includeEmail: false, includePhone: false }),
      peerIds.length > 0
        ? query(
            'SELECT user_id, handle, rank, home_city, primary_motorcycle FROM rider_profiles WHERE user_id = ANY($1::uuid[])',
            [peerIds]
          )
        : Promise.resolve({ rows: [] }),
      convIds.length > 0
        ? query(
            `SELECT conversation_id, COUNT(*)::int AS count
             FROM messages
             WHERE conversation_id = ANY($1::uuid[])
               AND sender_id <> $2
               AND NOT ($2::uuid = ANY(read_by))
             GROUP BY conversation_id`,
            [convIds, userId]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const profileMap = new Map(profilesRes.rows.map((p) => [p.user_id, p]));
    const unreadMap = new Map(unreadRes.rows.map((u) => [u.conversation_id, u.count]));

    const enriched = convRows
      .map((conv) => {
        const peerId = conv.participant_a_id === userId ? conv.participant_b_id : conv.participant_a_id;
        const peerUser = usersMap.get(peerId);
        if (!peerUser) return null;
        const rp = profileMap.get(peerId);
        const peerInfo = {
          _id: peerUser.id,
          id: peerUser.id,
          fullName: peerUser.fullName,
          avatarUrl: peerUser.avatarUrl || '',
          handle: rp?.handle || '',
          rank: rp?.rank || 'Beginner',
          homeCity: rp?.home_city || '',
          primaryMotorcycle: rp?.primary_motorcycle || '',
        };
        return {
          _id: conv.id,
          id: conv.id,
          lastMessageText: conv.last_message_text || '',
          lastMessageAt: conv.last_message_at,
          unreadCount: unreadMap.get(conv.id) || 0,
          partner: peerInfo,
          peer: peerInfo,
        };
      })
      .filter(Boolean);

    const totalUnread = enriched.reduce((sum, item) => sum + (item.unreadCount || 0), 0);

    return res.json({ success: true, data: enriched, totalUnread });
  } catch (err) {
    next(err);
  }
}

export async function startOrGetConversation(req, res, next) {
  try {
    const { targetUserId } = req.params;
    if (!isValidUuid(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid rider user ID.' });
    }
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot start a conversation with yourself.' });
    }

    const connected = await areUsersConnected(req.user.id, targetUserId);
    if (!connected) {
      return res.status(403).json({
        success: false,
        message: 'Direct messaging is available only between connected riders.',
      });
    }

    const [partA, partB] = [req.user.id, targetUserId].sort();
    const key = makeParticipantKey(partA, partB);

    let conv = await queryOne('SELECT * FROM conversations WHERE participant_key = $1', [key]);
    if (!conv) {
      conv = await queryOne(
        `INSERT INTO conversations (participant_a_id, participant_b_id, participant_key, last_message_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (participant_key) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [partA, partB, key]
      );
    }

    const [peerUserRow, peerProfileRow] = await Promise.all([
      queryOne('SELECT id, full_name, avatar_url, role FROM users WHERE id = $1', [targetUserId]),
      queryOne('SELECT handle, rank, home_city FROM rider_profiles WHERE user_id = $1', [targetUserId]),
    ]);

    const peerInfo = peerUserRow
      ? {
          _id: peerUserRow.id,
          id: peerUserRow.id,
          fullName: peerUserRow.full_name,
          avatarUrl: peerUserRow.avatar_url || '',
          handle: peerProfileRow?.handle || '',
          rank: peerProfileRow?.rank || 'Beginner',
          homeCity: peerProfileRow?.home_city || '',
        }
      : null;

    return res.json({
      success: true,
      data: {
        ...mapConversation(conv),
        partner: peerInfo,
        peer: peerInfo,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getConversationMessages(req, res, next) {
  try {
    const { conversationId } = req.params;
    if (!isValidUuid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
    }

    const conv = await queryOne('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const userId = req.user.id;
    if (conv.participant_a_id !== userId && conv.participant_b_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied to this conversation.' });
    }

    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 40, maxLimit: 100 });

    const [msgsRes, totalRes] = await Promise.all([
      query(
        `SELECT m.*, u.full_name AS sender_full_name, u.avatar_url AS sender_avatar_url, u.role AS sender_role
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [conv.id, limit, skip]
      ),
      queryOne('SELECT COUNT(*)::int AS total FROM messages WHERE conversation_id = $1', [conv.id]),
    ]);

    await query(
      `UPDATE messages
       SET read_by = array_append(read_by, $2::uuid)
       WHERE conversation_id = $1 AND sender_id <> $2 AND NOT ($2::uuid = ANY(read_by))`,
      [conv.id, userId]
    );

    const peerId = conv.participant_a_id === userId ? conv.participant_b_id : conv.participant_a_id;
    const [peerUserRow, peerProfileRow] = await Promise.all([
      queryOne('SELECT id, full_name, avatar_url FROM users WHERE id = $1', [peerId]),
      queryOne('SELECT handle, rank, home_city FROM rider_profiles WHERE user_id = $1', [peerId]),
    ]);

    const messages = msgsRes.rows.reverse().map((m) =>
      mapMessage(m, {
        sender: {
          _id: m.sender_id,
          id: m.sender_id,
          fullName: m.sender_full_name,
          avatarUrl: m.sender_avatar_url || '',
          role: m.sender_role,
        },
      })
    );

    const total = totalRes?.total || 0;
    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
    const partnerInfo = peerUserRow
      ? {
          _id: peerUserRow.id,
          id: peerUserRow.id,
          fullName: peerUserRow.full_name,
          avatarUrl: peerUserRow.avatar_url || '',
          handle: peerProfileRow?.handle || '',
          rank: peerProfileRow?.rank || 'Beginner',
          homeCity: peerProfileRow?.home_city || '',
        }
      : null;

    return res.json({
      success: true,
      data: {
        conversation: {
          _id: conv.id,
          id: conv.id,
          partner: partnerInfo,
          peer: partnerInfo,
        },
        messages,
        pagination,
      },
      pagination,
    });
  } catch (err) {
    next(err);
  }
}

export async function sendPrivateMessage(req, res, next) {
  try {
    const { conversationId } = req.params;
    if (!isValidUuid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
    }

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message content must be between 1 and 2000 characters.',
      });
    }

    const outcome = await transaction(async (tx) => {
      const conv = await tx.queryOne('SELECT * FROM conversations WHERE id = $1 FOR UPDATE', [conversationId]);
      if (!conv) return { errorStatus: 404, errorMessage: 'Conversation not found.' };

      const userId = req.user.id;
      if (conv.participant_a_id !== userId && conv.participant_b_id !== userId) {
        return { errorStatus: 403, errorMessage: 'Access denied to this conversation.' };
      }

      const recipientId = conv.participant_a_id === userId ? conv.participant_b_id : conv.participant_a_id;
      const connected = await areUsersConnected(userId, recipientId, tx);
      if (!connected) {
        return { errorStatus: 403, errorMessage: 'You can only send messages to connected riders.' };
      }

      const msgRow = await tx.queryOne(
        `INSERT INTO messages (sender_id, conversation_id, recipient_user_id, message_type, content, read_by)
         VALUES ($1, $2, $3, 'text', $4, ARRAY[$1::uuid])
         RETURNING *`,
        [userId, conv.id, recipientId, content]
      );

      await tx.query(
        `UPDATE conversations
         SET last_message_id = $1, last_message_text = $2, last_message_at = $3
         WHERE id = $4`,
        [msgRow.id, content.slice(0, 180), msgRow.created_at, conv.id]
      );

      return { conv, msgRow, recipientId };
    });

    if (outcome.errorStatus) {
      return res.status(outcome.errorStatus).json({ success: false, message: outcome.errorMessage });
    }

    const { conv, msgRow, recipientId } = outcome;
    const populated = mapMessage(msgRow, {
      sender: {
        _id: req.user.id,
        id: req.user.id,
        fullName: req.user.fullName,
        avatarUrl: req.user.avatarUrl || '',
        role: req.user.role,
      },
    });

    const io = getSocketIO();
    if (io) {
      io.to(`conv:${conversationId}`).emit('private:message', populated);
      io.to(`user:${String(recipientId)}`).emit('private:conversation_updated', {
        conversationId: conv.id,
        message: populated,
      });
    }

    await createAndEmitNotification({
      recipient: recipientId,
      actor: req.user.id,
      type: 'private_message',
      title: `New message from ${req.user.fullName}`,
      body: content.slice(0, 140),
      link: `/community/messages/${conv.id}`,
      metadata: { conversationId: conv.id },
    });

    return res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
}

export async function markConversationRead(req, res, next) {
  try {
    const { conversationId } = req.params;
    if (!isValidUuid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
    }

    const conv = await queryOne('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    if (!conv || (conv.participant_a_id !== req.user.id && conv.participant_b_id !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await query(
      `UPDATE messages
       SET read_by = array_append(read_by, $2::uuid)
       WHERE conversation_id = $1 AND sender_id <> $2 AND NOT ($2::uuid = ANY(read_by))`,
      [conv.id, req.user.id]
    );

    return res.json({ success: true, message: 'Conversation marked as read.' });
  } catch (err) {
    next(err);
  }
}
