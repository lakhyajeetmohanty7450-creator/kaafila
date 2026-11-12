-- KAAFILA Phase 5.1: Supabase Storage Policy Hardening Migration
-- Purpose:
--   Remove the permissive client-side `kaafila_images_auth_insert` policy on `storage.objects`.
--   All KAAFILA image uploads are routed through the authenticated Express backend
--   (`POST /api/uploads/image`) using `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS
--   and enforces magic-byte validation, user-folder isolation, and upload rate limiting.
--   Public read access (`kaafila_images_public_read`) is preserved.
--
-- Verification SQL (run after applying):
--   SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--   ORDER BY policyname;
--   -- Expected: only `kaafila_images_public_read` (SELECT) remains for `kaafila-images`.
--
-- Rollback SQL (if direct Supabase Auth client uploads are ever needed again):
--   DO $$
--   BEGIN
--     IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
--       DROP POLICY IF EXISTS "kaafila_images_auth_insert" ON storage.objects;
--       CREATE POLICY "kaafila_images_auth_insert" ON storage.objects
--         FOR INSERT WITH CHECK (
--           bucket_id = 'kaafila-images'
--           AND auth.role() = 'authenticated'
--           AND (storage.foldername(name))[1] = auth.uid()::text
--         );
--     END IF;
--   END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    DROP POLICY IF EXISTS "kaafila_images_auth_insert" ON storage.objects;
  END IF;
END $$;

