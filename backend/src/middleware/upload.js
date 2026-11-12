import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { getPostgresMode } from '../config/pg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export function isSupabaseStorageConfigured() {
  if (getPostgresMode() === 'pglite' || env.usePglite) {
    return false;
  }
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

/**
 * Inspects file magic bytes and returns canonical { mimetype, ext } for
 * JPEG, PNG, and WebP, or null if the signature is missing/unsupported.
 */
export function detectImageSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimetype: 'image/jpeg', ext: '.jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimetype: 'image/png', ext: '.png' };
  }

  // WebP: "RIFF" <4-byte size> "WEBP"
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimetype: 'image/webp', ext: '.webp' };
  }

  return null;
}

function generateImageFilename(ext) {
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
}

const memoryStorage = multer.memoryStorage();

function imageFileFilter(_req, file, cb) {
  if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
    const err = new Error('Only JPEG, PNG, and WebP images are allowed.');
    err.statusCode = 400;
    return cb(err);
  }
  return cb(null, true);
}

export const uploadSingleImage = (req, res, cb) => {
  return multer({
    storage: memoryStorage,
    fileFilter: imageFileFilter,
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 1,
    },
  }).single('image')(req, res, cb);
};

let supabaseAdmin = null;
function getSupabaseAdmin() {
  if (!supabaseAdmin && isSupabaseStorageConfigured()) {
    supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

/**
 * Validates magic bytes from the in-memory buffer and persists the image
 * either to Supabase Storage (when configured) or local /uploads/<filename>.
 */
export async function persistUploadedImage(file, userId = 'anonymous', options = {}) {
  const verified = detectImageSignature(file?.buffer);
  if (!verified) {
    const sigErr = new Error('Invalid or unsupported image file signature. Only JPEG, PNG, and WebP are allowed.');
    sigErr.statusCode = 400;
    throw sigErr;
  }

  const filename = generateImageFilename(verified.ext);
  const useSupabase = Boolean(options.supabaseClient) || isSupabaseStorageConfigured();

  if (!useSupabase) {
    await fs.promises.mkdir(UPLOADS_ROOT, { recursive: true });
    const targetPath = path.join(UPLOADS_ROOT, filename);
    try {
      await fs.promises.writeFile(targetPath, file.buffer, { flag: 'wx' });
    } catch (writeErr) {
      await fs.promises.unlink(targetPath).catch(() => {});
      throw writeErr;
    }

    return {
      storageProvider: 'local',
      url: `/uploads/${filename}`,
      filename,
      mimetype: verified.mimetype,
      size: file.buffer.length,
    };
  }

  const client = options.supabaseClient || getSupabaseAdmin();
  const bucket = env.supabaseStorageBucket || 'kaafila-images';
  const objectPath = `${String(userId)}/${filename}`;

  const { error } = await client.storage.from(bucket).upload(objectPath, file.buffer, {
    contentType: verified.mimetype,
    upsert: false,
  });

  if (error) {
    const uploadErr = new Error(`Failed to upload image to Supabase Storage: ${error.message}`);
    uploadErr.statusCode = 502;
    throw uploadErr;
  }

  const { data: pubData } = client.storage.from(bucket).getPublicUrl(objectPath);
  return {
    storageProvider: 'supabase',
    url: pubData.publicUrl,
    filename: objectPath,
    mimetype: verified.mimetype,
    size: file.buffer.length,
  };
}
