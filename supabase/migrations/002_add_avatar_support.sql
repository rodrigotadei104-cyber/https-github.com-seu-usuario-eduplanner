-- 1. Create 'avatars' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Add photo_url to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;

-- 3. Storage RLS Policies

-- Drop policies to ensure idempotency (avoid conflicts on re-run)
DROP POLICY IF EXISTS "Public Read" ON storage.objects;
DROP POLICY IF EXISTS "User Upload Own" ON storage.objects;
DROP POLICY IF EXISTS "User Update Own" ON storage.objects;
DROP POLICY IF EXISTS "User Delete Own" ON storage.objects;
DROP POLICY IF EXISTS "Admin All" ON storage.objects;
-- Cleanup potential old policy names
DROP POLICY IF EXISTS "Avatar images are publicly accessible to authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage any avatar" ON storage.objects;

-- Enable RLS (safe verify)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Create New Policies

-- Policy: Anyone valid (authenticated) can download avatars
CREATE POLICY "Public Read"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'avatars' );

-- Policy: Users can upload their own avatar
CREATE POLICY "User Upload Own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own avatar
CREATE POLICY "User Update Own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own avatar
CREATE POLICY "User Delete Own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can manage any avatar
CREATE POLICY "Admin All"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'avatars' AND
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  )
);
