-- KAAFILA Phase 5.1 Stage 2: Authentication & Session Security Migration
-- Purpose:
--   1. Add `token_version` to `users` for server-side JWT revocation (logout & password change)
--      without extra database queries on authenticated requests.
--   2. Create `password_reset_tokens` table storing only SHA-256 hashes of single-use,
--      short-lived password-reset tokens.
--
-- Rollback strategy (safe & non-destructive to existing user data):
--   DROP TABLE IF EXISTS password_reset_tokens;
--   ALTER TABLE users DROP COLUMN IF EXISTS token_version;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0 CHECK (token_version >= 0);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_expires
  ON password_reset_tokens (user_id, expires_at DESC);

-- Enable RLS (default-deny for Supabase Data API / anon & authenticated client roles;
-- KAAFILA Express backend accesses this table over server-side pg).
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

