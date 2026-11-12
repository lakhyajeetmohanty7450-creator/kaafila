import jwt from 'jsonwebtoken';
import { queryOne } from '../config/pg.js';
import { env } from '../config/env.js';
import { mapUser } from '../repositories/mappers.js';
import { isValidUuid } from '../utils/validators.js';

export function signToken(user) {
  const userId = String(user._id || user.id);
  return jwt.sign(
    { id: userId, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

async function loadActiveUser(id) {
  if (!isValidUuid(String(id || ''))) return null;
  const row = await queryOne(
    `SELECT id, full_name, email, role, phone_number, city, avatar_url, is_active, last_login_at, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [String(id)]
  );
  if (!row || !row.is_active) return null;
  return mapUser(row, { includeEmail: true, includePhone: true });
}

export async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.jwtSecret);

    const user = await loadActiveUser(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Account not found or inactive.' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
}

export async function optionalProtect(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, env.jwtSecret);
      const user = await loadActiveUser(decoded.id);
      if (user) {
        req.user = user;
      }
    }
  } catch {
    // Ignore invalid optional token on public endpoints
  }
  next();
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
}
