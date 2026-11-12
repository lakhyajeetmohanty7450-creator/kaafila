import { queryOne } from '../config/pg.js';
import { mapNotification, mapUser } from '../repositories/mappers.js';
import { isValidUuid } from './validators.js';

let ioInstance = null;

export function setSocketIO(io) {
  ioInstance = io;
}

export function getSocketIO() {
  return ioInstance;
}

/**
 * Persists a Notification row in PostgreSQL and emits it in real time to recipient's Socket.IO room.
 */
export async function createAndEmitNotification({
  recipient,
  actor = null,
  type,
  title,
  body = '',
  link = '',
  metadata = {},
}, db = null) {
  if (!recipient || (actor && String(recipient) === String(actor))) {
    return null;
  }

  const recipientId = String(recipient);
  const actorId = actor && isValidUuid(String(actor)) ? String(actor) : null;
  if (!isValidUuid(recipientId)) {
    return null;
  }

  const runner = db || { queryOne };
  const row = await runner.queryOne(
    `INSERT INTO notifications (recipient_id, actor_id, type, title, body, link, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [
      recipientId,
      actorId,
      type,
      String(title).slice(0, 160),
      String(body || '').slice(0, 500),
      String(link || ''),
      JSON.stringify(metadata || {}),
    ]
  );

  let actorDto = null;
  if (actorId) {
    const actorRow = await runner.queryOne(
      'SELECT id, full_name, avatar_url, role FROM users WHERE id = $1',
      [actorId]
    );
    if (actorRow) {
      actorDto = mapUser(actorRow, { includeEmail: false, includePhone: false });
    }
  }

  const dto = mapNotification(row, { actor: actorDto });

  if (ioInstance) {
    ioInstance.to(`user:${recipientId}`).emit('notification:new', dto);
  }

  return dto;
}
