import { query, queryOne } from '../config/pg.js';
import { mapNotification } from '../repositories/mappers.js';
import { isValidUuid, parsePagination } from '../utils/validators.js';

export async function listNotifications(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20, maxLimit: 50 });

    const [notifRes, unreadRes, totalRes] = await Promise.all([
      query(
        `SELECT n.*, u.full_name AS actor_full_name, u.avatar_url AS actor_avatar_url, u.role AS actor_role
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.recipient_id = $1
         ORDER BY n.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, skip]
      ),
      queryOne(
        'SELECT COUNT(*)::int AS cnt FROM notifications WHERE recipient_id = $1 AND is_read = FALSE',
        [req.user.id]
      ),
      queryOne('SELECT COUNT(*)::int AS cnt FROM notifications WHERE recipient_id = $1', [req.user.id]),
    ]);

    const notifications = notifRes.rows.map((row) =>
      mapNotification(row, {
        actor: row.actor_id
          ? {
              _id: row.actor_id,
              id: row.actor_id,
              fullName: row.actor_full_name,
              avatarUrl: row.actor_avatar_url || '',
              role: row.actor_role,
            }
          : null,
      })
    );

    const unreadCount = unreadRes?.cnt || 0;
    const total = totalRes?.cnt || 0;

    return res.json({
      success: true,
      data: notifications,
      unreadCount,
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

export async function markNotificationRead(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    }

    const row = await queryOne(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND recipient_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );

    if (!row) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.json({ success: true, data: mapNotification(row) });
  } catch (err) {
    next(err);
  }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    await query(
      'UPDATE notifications SET is_read = TRUE WHERE recipient_id = $1 AND is_read = FALSE',
      [req.user.id]
    );
    return res.json({
      success: true,
      message: 'All notifications marked as read.',
      unreadCount: 0,
    });
  } catch (err) {
    next(err);
  }
}
