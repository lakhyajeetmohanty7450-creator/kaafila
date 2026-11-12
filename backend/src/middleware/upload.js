import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export function isSupabaseStorageConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

function generateImageFilename(mimetype) {
  const ext = ALLOWED_MIME_TO_EXT[mimetype] || '.jpg';
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOADS_ROOT)) {
      fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
    }
    cb(null, UPLOADS_ROOT);
  },
  filename: (_req, file, cb) => {
    cb(null, generateImageFilename(file.mimetype));
  },
});

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
  const storage = isSupabaseStorageConfigured() ? memoryStorage : diskStorage;
  return multer({
    storage,
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
 * Persists an uploaded image either to Supabase Storage (when configured)
 * or falls back cleanly to local /uploads/<filename>.
 */
export async function persistUploadedImage(file, userId = 'anonymous') {
  if (!isSupabaseStorageConfigured()) {
    return {
      storageProvider: 'local',
      url: `/uploads/${file.filename}`,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  const client = getSupabaseAdmin();
  const bucket = env.supabaseStorageBucket || 'kaafila-images';
  const filename = generateImageFilename(file.mimetype);
  const objectPath = `${String(userId)}/${filename}`;

  const { error } = await client.storage.from(bucket).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
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
    mimetype: file.mimetype,
    size: file.size,
  };
}
