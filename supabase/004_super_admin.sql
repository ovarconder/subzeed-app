-- ============================================================
-- Super Admin Role
-- แยก admin role ออกจาก business_pro tier
-- ============================================================

-- เพิ่ม column is_super_admin ใน profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Index สำหรับค้นหา admin
CREATE INDEX IF NOT EXISTS idx_profiles_super_admin
ON profiles(is_super_admin)
WHERE is_super_admin = true;
