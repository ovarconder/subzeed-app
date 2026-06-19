-- ============================================================
-- 🛡️ Migration 002: Add is_quota_abuser flag to profiles
-- ============================================================
-- ใช้ระบุว่า user นี้ถูกแปะว่าใช้โควตาเกินปกติ
-- Admin สามารถปลดล็อกผ่าน Admin Dashboard
-- ============================================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_quota_abuser BOOLEAN DEFAULT FALSE NOT NULL;

-- Index สำหรับค้นหา abuser
CREATE INDEX IF NOT EXISTS idx_profiles_abuser ON profiles(is_quota_abuser) WHERE is_quota_abuser = TRUE;

-- ============================================================
-- ตารางเก็บ Browser Fingerprint
-- ============================================================

CREATE TABLE IF NOT EXISTS fingerprint_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'signup',
    ip_address TEXT,
    blocked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index สำหรับค้นหา fingerprint ซ้ำ
CREATE INDEX IF NOT EXISTS idx_fingerprint_hash ON fingerprint_history(fingerprint);
CREATE INDEX IF NOT EXISTS idx_fingerprint_blocked ON fingerprint_history(blocked) WHERE blocked = TRUE;
