-- ============================================================
-- Migration: Add Browser Fingerprint Anti-Abuse System
-- ============================================================
-- ป้องกันผู้ใช้เปลี่ยน Email สลับมาใช้โควตาฟรีซ้ำๆ
-- ด้วย Browser Fingerprinting

-- 1. เพิ่มคอลัมน์ใน profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS browser_fingerprint TEXT,
ADD COLUMN IF NOT EXISTS is_quota_abuser BOOLEAN DEFAULT FALSE;

-- 2. สร้างตารางสำหรับเก็บประวัติ fingerprint (จับคู่กับ user id)
CREATE TABLE IF NOT EXISTS fingerprint_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    action TEXT NOT NULL, -- 'signup', 'quota_claim'
    ip_address TEXT,
    blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fingerprint_history_fp ON fingerprint_history(fingerprint);
CREATE INDEX IF NOT EXISTS idx_fingerprint_history_user ON fingerprint_history(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_fingerprint ON profiles(browser_fingerprint);

-- 3. RLS Policy: ให้ user อ่านข้อมูลของตัวเองเท่านั้น
ALTER TABLE fingerprint_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own fingerprint history"
    ON fingerprint_history FOR SELECT
    USING (auth.uid() = user_id);

-- 4. ฟังก์ชันตรวจสอบและบล็อก abuser
CREATE OR REPLACE FUNCTION public.check_fingerprint_abuse(
    p_fingerprint TEXT,
    p_user_id UUID,
    p_email TEXT,
    p_ip TEXT DEFAULT NULL
) RETURNS TABLE(
    is_abuser BOOLEAN,
    existing_accounts INT,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
    v_existing_user UUID;
BEGIN
    -- นับจำนวน user ที่ใช้ fingerprint นี้ไปแล้ว (เฉพาะที่ signup แบบ free)
    SELECT COUNT(*) INTO v_count
    FROM public.fingerprint_history fh
    WHERE fh.fingerprint = p_fingerprint
      AND fh.blocked = FALSE;

    -- ถ้าเคยมีมากกว่า 0 แสดงว่าเปลี่ยน email มาแล้ว
    IF v_count > 0 THEN
        -- อัปเดตให้ user ที่เพิ่งสมัครเป็น abuser
        UPDATE public.profiles
        SET is_quota_abuser = TRUE,
            quota_minutes_total = 0,
            quota_minutes_used = 0
        WHERE id = p_user_id;

        -- Mark abuser ใน fingerprint_history
        UPDATE public.fingerprint_history
        SET blocked = TRUE
        WHERE fingerprint = p_fingerprint
          AND blocked = FALSE;

        -- บันทึก action รอบนี้
        INSERT INTO public.fingerprint_history (fingerprint, user_id, email, action, ip_address, blocked)
        VALUES (p_fingerprint, p_user_id, p_email, 'quota_claim', p_ip, TRUE);

        RETURN QUERY SELECT
            TRUE AS is_abuser,
            v_count AS existing_accounts,
            'ตรวจพบการสมัครซ้ำ: เคยใช้โควตาฟรีไปแล้ว ' || v_count || ' ครั้ง' AS message;
    ELSE
        -- ปกติ: บันทึก fingerprint ใหม่
        INSERT INTO public.fingerprint_history (fingerprint, user_id, email, action, ip_address, blocked)
        VALUES (p_fingerprint, p_user_id, p_email, 'signup', p_ip, FALSE);

        RETURN QUERY SELECT
            FALSE AS is_abuser,
            0 AS existing_accounts,
            'OK' AS message;
    END IF;
END;
$$;

-- 5. ทริกเกอร์: ถ้ามี profile ไหนโดน mark is_quota_abuser ให้ log ด้วย
CREATE OR REPLACE FUNCTION public.log_quota_abuse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.is_quota_abuser = TRUE AND OLD.is_quota_abuser = FALSE THEN
        INSERT INTO public.quota_activity_logs (
            user_id, log_type, minutes_changed,
            quota_minutes_used_snapshot, description
        ) VALUES (
            NEW.id, 'admin_adjustment', 0,
            0, '🚫 BLOCKED: ตรวจพบพฤติกรรมเปลี่ยน email ใช้โควตาฟรีซ้ำ'
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_quota_abuse_detected
    AFTER UPDATE OF is_quota_abuser ON public.profiles
    FOR EACH ROW
    WHEN (NEW.is_quota_abuser = TRUE AND OLD.is_quota_abuser = FALSE)
    EXECUTE FUNCTION public.log_quota_abuse();
