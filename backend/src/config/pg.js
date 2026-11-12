import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

let activePool = null;
let activePglite = null;
let activeMode = null;

function createPoolAdapter(pool) {
  return {
    mode: 'pg',
    async query(sql, params = []) {
      const result = await pool.query(sql, params);
      return result;
    },
    async queryOne(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    },
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = {
          query: (sql, params = []) => client.query(sql, params),
          queryOne: async (sql, params = []) => {
            const r = await client.query(sql, params);
            return r.rows[0] || null;
          },
        };
        const out = await callback(tx);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore rollback error
        }
        throw err;
      } finally {
        client.release();
      }
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

function createPgliteAdapter(db) {
  return {
    mode: 'pglite',
    async query(sql, params = []) {
      const result = await db.query(sql, params);
      return result;
    },
    async queryOne(sql, params = []) {
      const result = await db.query(sql, params);
      return result.rows[0] || null;
    },
    async transaction(callback) {
      // Serialize nested PGlite operations cleanly via PGlite's built-in transaction
      return db.transaction(async (pgTx) => {
        const tx = {
          query: (sql, params = []) => pgTx.query(sql, params),
          queryOne: async (sql, params = []) => {
            const r = await pgTx.query(sql, params);
            return r.rows[0] || null;
          },
        };
        return callback(tx);
      });
    },
    async exec(sql) {
      await db.exec(sql);
    },
    async close() {
      await db.close();
    },
  };
}

let adapter = null;

function getAdapter() {
  if (!adapter) {
    throw new Error('PostgreSQL database connection has not been initialized.');
  }
  return adapter;
}

export async function connectPostgres(options = {}) {
  if (adapter) {
    return { mode: activeMode, pool: activePool, pglite: activePglite };
  }

  const usePglite = options.usePglite ?? env.usePglite;
  const databaseUrl = options.databaseUrl ?? env.databaseUrl;

  if (usePglite) {
    const { PGlite } = await import('@electric-sql/pglite');
    activePglite = options.pgliteDataDir ? new PGlite(options.pgliteDataDir) : new PGlite();
    await activePglite.waitReady;
    adapter = createPgliteAdapter(activePglite);
    activeMode = 'pglite';
    return { mode: activeMode, pglite: activePglite };
  }

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not configured. Set your Supabase PostgreSQL connection string in backend/.env.'
    );
  }

  const needsSsl =
    databaseUrl.includes('supabase.co') ||
    databaseUrl.includes('supabase.com') ||
    databaseUrl.includes('sslmode=require') ||
    env.nodeEnv === 'production';

  activePool = new Pool({
    connectionString: databaseUrl,
    max: options.maxPoolSize || 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // Verify live connection immediately without exposing connection URI
  await activePool.query('SELECT 1');
  adapter = createPoolAdapter(activePool);
  activeMode = 'pg';
  return { mode: activeMode, pool: activePool };
}

export async function runPostgresMigrations(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const db = getAdapter();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.exec(sql);
  }
  return files;
}

export async function disconnectPostgres() {
  if (!adapter) return;
  const current = adapter;
  adapter = null;
  activePool = null;
  activePglite = null;
  activeMode = null;
  await current.close();
}

export function getPostgresMode() {
  return activeMode;
}

export async function query(sql, params = []) {
  return getAdapter().query(sql, params);
}

export async function queryOne(sql, params = []) {
  return getAdapter().queryOne(sql, params);
}

export async function transaction(callback) {
  return getAdapter().transaction(callback);
}

