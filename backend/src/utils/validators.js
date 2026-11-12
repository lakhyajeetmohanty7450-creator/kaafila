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

