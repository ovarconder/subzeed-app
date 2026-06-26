-- ============================================================
-- 005_storage_policies.sql
-- สร้าง Storage bucket 'site-assets' + RLS Policies
-- ============================================================

-- 1. สร้าง bucket (ถ้ายังไม่มี)
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: ให้ทุกคนอ่านไฟล์ได้ (public)
DROP POLICY IF EXISTS "Public Read" ON storage.objects;
CREATE POLICY "Public Read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'site-assets');

-- 3. Policy: ให้ผู้ใช้ที่ล็อกอินแล้วอัปโหลดไฟล์ได้
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'site-assets'
  AND auth.role() = 'authenticated'
);

-- 4. Policy: ให้ผู้ใช้ที่ล็อกอินแล้วอัปเดตไฟล์ได้ (เช่น อัปโหลดซ้ำ)
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
CREATE POLICY "Authenticated Update"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'site-assets'
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'site-assets'
  AND auth.role() = 'authenticated'
);

-- 5. Policy: ให้ผู้ใช้ที่ล็อกอินแล้วลบไฟล์ได้
DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;
CREATE POLICY "Authenticated Delete"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'site-assets'
  AND auth.role() = 'authenticated'
);
