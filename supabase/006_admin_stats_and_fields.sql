-- ============================================================
-- 🛡️ Migration 006: Admin fields + is_super_admin + stats RPC
-- ============================================================
-- เพิ่มฟิลด์ที่จำเป็นสำหรับ Admin Dashboard
-- - is_super_admin (profiles)
-- - RPC get_admin_stats
-- - RLS bypass สำหรับ admin
-- ============================================================

-- ─── 1. เพิ่ม is_super_admin ฟิลด์ ─────────────────────
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- Set admin คนแรก (overconda@gmail.com)
UPDATE profiles
SET is_super_admin = TRUE
WHERE email = 'overconda@gmail.com';

-- ─── 2. สร้าง RPC get_admin_stats ──────────────────────
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS TABLE (
  totalUsers BIGINT,
  activeToday BIGINT,
  totalRevenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _today DATE := CURRENT_DATE;
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::BIGINT FROM public.profiles) AS totalUsers,
    (SELECT COUNT(*)::BIGINT FROM public.profiles WHERE updated_at::DATE >= _today) AS activeToday,
    (SELECT COALESCE(SUM(amount_thb), 0)::NUMERIC FROM public.billing_history WHERE payment_status = 'success') AS totalRevenue;
END;
$$;

-- ─── 3. RLS Policy: Admin สามารถเห็น profiles ทั้งหมด ──
DROP POLICY IF EXISTS "Admins view all profiles" ON profiles;
CREATE POLICY "Admins view all profiles"
    ON profiles FOR SELECT
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE is_super_admin = TRUE
    ));

DROP POLICY IF EXISTS "Admins update all profiles" ON profiles;
CREATE POLICY "Admins update all profiles"
    ON profiles FOR UPDATE
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE is_super_admin = TRUE
    ));

-- ─── 4. RLS Policy: Admin เห็น billing ทั้งหมด ─────────
DROP POLICY IF EXISTS "Admins view all billing" ON billing_history;
CREATE POLICY "Admins view all billing"
    ON billing_history FOR SELECT
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE is_super_admin = TRUE
    ));

-- ─── 5. RLS Policy: Admin เห็น fingerprints ทั้งหมด ────
DROP POLICY IF EXISTS "Admins view all fingerprints" ON fingerprint_history;
CREATE POLICY "Admins view all fingerprints"
    ON fingerprint_history FOR SELECT
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE is_super_admin = TRUE
    ));

END;
