-- ============================================================
-- API Configuration Table — SubZeed
-- ============================================================
-- เก็บค่า API Provider/Key/Model ที่ Admin สามารถปรับได้ผ่าน UI
-- ใช้ PGP Symmetric Encryption ในการเก็บ API Key (Supabase pgcrypto)
-- ============================================================

-- เปิด extension pgcrypto (ถ้ายังไม่ได้เปิด)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- สร้าง encryption key ใน Vault (ถ้ายังไม่มี)
-- ใช้ในการเข้ารหัส API Keys ในตาราง api_providers
-- หมายเหตุ: ในการ migrate จริงต้องกำหนดค่า pgsodium หรือใช้
-- Supabase Vault สำหรับ Production แต่ในที่นี้ใช้ pgcrypto พื้นฐาน

-- ตารางหลักสำหรับเก็บ API Configuration
CREATE TABLE IF NOT EXISTS api_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Provider type
  service_type TEXT NOT NULL CHECK (service_type IN ('stt', 'llm')),
  
  -- Selected provider
  provider TEXT NOT NULL,
  
  -- Model name
  model TEXT NOT NULL,
  
  -- Encrypted API key (ใช้ pgcrypto)
  -- ใน production ควรใช้ Supabase Vault (pgsodium)
  api_key_encrypted TEXT,
  
  -- Active flag (ใช้เฉพาะ service_type ละ 1 active row)
  is_active BOOLEAN DEFAULT false NOT NULL,
  
  -- Metadata
  label TEXT, -- Friendly name for display
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraint: แต่ละ service_type + provider ต้อง unique
  UNIQUE(service_type, provider)
);

-- -----------------------------------------------------------
-- ฟังก์ชันสำหรับ encrypt/decrypt API Key
-- ใช้ pgcrypto ด้วยพาสส์เฟรสจาก environment variable
-- -----------------------------------------------------------

-- ฟังก์ชันสำหรับเข้ารหัส API Key
CREATE OR REPLACE FUNCTION encrypt_api_key(plain_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  -- ดึง encryption key จาก custom variable (ตั้งจาก Supabase Dashboard)
  -- หรือใช้ fallback key ในกรณี dev
  enc_key := current_setting('app.encryption_key', true);
  IF enc_key IS NULL THEN
    enc_key := 'subzeed-default-dev-key-change-in-production-32chr';
  END IF;
  
  RETURN encode(
    pgp_sym_encrypt(plain_key, enc_key),
    'base64'
  );
END;
$$;

-- ฟังก์ชันสำหรับถอดรหัส API Key
CREATE OR REPLACE FUNCTION decrypt_api_key(encrypted_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := current_setting('app.encryption_key', true);
  IF enc_key IS NULL THEN
    enc_key := 'subzeed-default-dev-key-change-in-production-32chr';
  END IF;
  
  RETURN pgp_sym_decrypt(
    decode(encrypted_key, 'base64'),
    enc_key
  );
END;
$$;

-- -----------------------------------------------------------
-- ฟังก์ชันช่วย: ตั้งค่า default API providers
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION initialize_default_api_providers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- STT Providers
  INSERT INTO api_providers (service_type, provider, model, is_active, label)
  VALUES 
    ('stt', 'openai', 'whisper-1', false, 'OpenAI Whisper'),
    ('stt', 'groq', 'whisper-large-v3', true, 'Groq Whisper')
  ON CONFLICT (service_type, provider) DO NOTHING;

  -- LLM Providers
  INSERT INTO api_providers (service_type, provider, model, is_active, label)
  VALUES 
    ('llm', 'openai', 'gpt-4o-mini', false, 'OpenAI GPT-4o-mini'),
    ('llm', 'gemini', 'gemini-1.5-flash', false, 'Google Gemini 1.5 Flash'),
    ('llm', 'groq', 'llama-3.1-8b-instant', true, 'Groq Llama 3.1')
  ON CONFLICT (service_type, provider) DO NOTHING;
END;
$$;

-- -----------------------------------------------------------
-- ฟังก์ชัน: เปิดใช้งานเฉพาะ provider ที่เลือก (และปิดตัวอื่น)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION activate_api_provider(p_service_type TEXT, p_provider TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- ปิดทั้งหมดใน service_type นี้ก่อน
  UPDATE api_providers
  SET is_active = false
  WHERE service_type = p_service_type;
  
  -- เปิดเฉพาะตัวที่เลือก
  UPDATE api_providers
  SET is_active = true
  WHERE service_type = p_service_type AND provider = p_provider;
END;
$$;

-- -----------------------------------------------------------
-- RLS: Service Role (Server) อ่าน-เขียนได้
-- Client anon key ไม่สามารถอ่านค่าที่เข้ารหัสได้
-- -----------------------------------------------------------
ALTER TABLE api_providers ENABLE ROW LEVEL SECURITY;

-- เฉพาะ Service Role เท่านั้นที่เข้าถึงตารางนี้ได้
-- ผ่าน API Routes
