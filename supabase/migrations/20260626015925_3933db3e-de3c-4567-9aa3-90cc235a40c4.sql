-- Restrict avatars bucket listing: remove broad SELECT policy.
-- Public bucket continues to serve via /object/public/ URLs without needing a SELECT policy.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;