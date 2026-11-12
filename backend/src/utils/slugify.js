export function toSlug(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function uniqueSlug(baseText) {
  const base = toSlug(baseText) || 'item';
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

