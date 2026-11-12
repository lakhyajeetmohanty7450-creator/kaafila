-- KAAFILA Optional Supabase Storage Bucket Configuration
--
-- Used automatically by backend/src/middleware/upload.js and uploadRoutes.js
-- when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ optional SUPABASE_STORAGE_BUCKET)
-- are configured. When unset, backend preserves local /uploads disk storage.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'kaafila-images',
      'kaafila-images',
      true,
      2097152, -- 2 MB
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

    -- Public read policy for uploaded avatars, org logos/covers, ride & group covers
    DROP POLICY IF EXISTS "kaafila_images_public_read" ON storage.objects;
    CREATE POLICY "kaafila_images_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'kaafila-images');

    -- Restrict direct uploads unless authenticated via Supabase Auth or Express backend service role
    DROP POLICY IF EXISTS "kaafila_images_auth_insert" ON storage.objects;
    CREATE POLICY "kaafila_images_auth_insert" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'kaafila-images' AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

