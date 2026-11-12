export function isValidHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidImageUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    isValidHttpUrl(trimmed) ||
    trimmed.startsWith('/images/') ||
    trimmed.startsWith('/uploads/')
  );
}

export function parsePagination(query = {}, defaults = { page: 1, limit: 12, maxLimit: 50 }) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || defaults.page);
  const maxLimit = defaults.maxLimit || 50;
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaults.limit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  const obj = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  return obj;
}

export function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Validates password type and length bounds (8-128 chars by default;
 * login can pass requireMinLength: false to only enforce the 128-char upper bound).
 */
export function validatePassword(password, { requireMinLength = true } = {}) {
  if (typeof password !== 'string' || !password) {
    return 'Password is required.';
  }
  if (requireMinLength && password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

