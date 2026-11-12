import jwt from 'jsonwebtoken';
import { queryOne } from '../config/pg.js';
import { env } from '../config/env.js';
import { mapUser } from '../repositories/mappers.js';
import { isValidUuid } from '../utils/validators.js';

export const JWT_ISSUER = 'kaafila-api';
export const JWT_AUDIENCE = 'kaafila-client';

export function signToken(user) {
  const userId = String(user._id || user.id);
  const tokenVersion = Number(user.tokenVersion ?? user.token_version ?? 0);
  return jwt.sign(
    { id: userId, role: user.role, tv: tokenVersion },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: env.jwtExpiresIn,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

async function loadActiveUser(id) {
  if (!isValidUuid(String(id || ''))) return null;
  const row = await queryOne(
    `SELECT id, full_name, email, role, phone_number, city, avatar_url, is_active, token_version, last_login_at, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [String(id)]
  );
  if (!row || !row.is_active) return null;
  return {
    user: mapUser(row, { includeEmail: true, includePhone: true }),
    tokenVersion: Number(row.token_version ?? 0),
  };
}

export async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const active = await loadActiveUser(decoded.id);
    if (!active) {
      return res.status(401).json({ success: false, message: 'Account not found or inactive.' });
    }

    if (Number(decoded.tv ?? 0) !== active.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Session has been invalidated. Please log in again.' });
    }

    req.user = active.user;
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
      const decoded = verifyToken(token);
      const active = await loadActiveUser(decoded.id);
      if (active && Number(decoded.tv ?? 0) === active.tokenVersion) {
        req.user = active.user;
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
