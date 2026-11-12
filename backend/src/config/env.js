import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable must be set in production.');
}

export function parseTrustProxy(rawValue) {
  if (rawValue === undefined || rawValue === null) return false;
  const trimmed = String(rawValue).trim();
  if (!trimmed || trimmed.toLowerCase() === 'false' || trimmed === '0') return false;
  if (trimmed.toLowerCase() === 'true') return 1;
  if (/^\d+$/.test(trimmed)) {
    const hops = Number(trimmed);
    if (hops > 10) {
      throw new Error('FATAL: TRUST_PROXY hop count cannot exceed 10.');
    }
    return hops;
  }
  const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === '*' || lower === 'all' || lower === '0.0.0.0/0' || lower === '::/0') {
      throw new Error(`FATAL: Permissive wildcard TRUST_PROXY value "${part}" is not allowed.`);
    }
  }
  return parts.length === 1 ? parts[0] : parts;
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  databaseUrl: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '',
  usePglite: process.env.USE_PGLITE === 'true',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'kaafila-images',
  geoapifyApiKey: process.env.GEOAPIFY_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'kaafila_dev_only_secret_change_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
