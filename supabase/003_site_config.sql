-- ============================================================
-- Site Configuration Table
-- เก็บค่า config ที่ Admin สามารถปรับได้ผ่าน UI
-- ============================================================

CREATE TABLE IF NOT EXISTS site_config (
  id INTEGER PRIMARY KEY DEFAULT 1,  -- มีแค่ row เดียว (singleton)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default config (only if not exists)
INSERT INTO site_config (id, config)
SELECT 1, '{
  "brand": {
    "name": "SubZeed",
    "tagline": "ซับซี๊ด",
    "slogan": "สร้างซับไตเติลภาษาไทย อัตโนมัติ ด้วย AI",
    "logo": "/logo.svg",
    "logoMobile": "/logo-mobile.svg",
    "favicon": "/favicon.ico"
  },
  "theme": {
    "mode": "light",
    "primary": "#2563eb",
    "primaryDark": "#1d4ed8",
    "primaryLight": "#dbeafe",
    "background": "#ffffff",
    "foreground": "#0f172a",
    "surface": "#f8fafc",
    "border": "#e2e8f0",
    "text": "#1e293b",
    "textSecondary": "#64748b",
    "muted": "#94a3b8",
    "success": "#10b981",
    "warning": "#f59e0b",
    "danger": "#ef4444",
    "heroGradient": "linear-gradient(135deg, #2563eb 0%, #8b5cf6 50%, #06b6d4 100%)",
    "cardGradient": "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
    "backgroundImage": ""
  },
  "homepage": {
    "heroTitle": "ซับไตเติลภาษาไทย\\nง่ายนิดเดียว",
    "heroSubtitle": "อัปโหลดวิดีโอ ถอดความอัตโนมัติ แก้ไข เพิ่มลูกเล่น\\nSubZeed ช่วยคุณสร้างซับไตเติลระดับมืออาชีพ",
    "heroCta": "เริ่มใช้งานฟรี",
    "featuresTitle": "ทำไมต้อง SubZeed?",
    "howItWorksTitle": "วิธีใช้งาน"
  },
  "footer": {
    "copyright": "© 2025 SubZeed — สร้างซับไตเติลภาษาไทย อัตโนมัติ",
    "links": [
      { "label": "แพ็กเกจ", "href": "/pricing" },
      { "label": "เงื่อนไข", "href": "/terms" },
      { "label": "ความเป็นส่วนตัว", "href": "/privacy" },
      { "label": "ติดต่อเรา", "href": "/contact" }
    ],
    "showSocial": true,
    "socialLinks": [
      { "label": "Facebook", "href": "#", "icon": "facebook" },
      { "label": "YouTube", "href": "#", "icon": "youtube" },
      { "label": "TikTok", "href": "#", "icon": "tiktok" }
    ]
  },
  "typography": {
    "fontFamily": "Arial, Helvetica, sans-serif",
    "headingsFont": "Arial, Helvetica, sans-serif"
  },
  "misc": {
    "locale": "th-TH",
    "currency": "THB",
    "timezone": "Asia/Bangkok"
  }
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM site_config WHERE id = 1);

-- RLS: ให้ Service Role (Server) อ่าน-เขียนได้
-- Client anon key อ่านได้อย่างเดียว (สำหรับ client-side render)
ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

-- ทุกคนอ่านได้ (anon key ใช้ตอน client-side fetch)
CREATE POLICY "Anyone can read site_config"
  ON site_config FOR SELECT
  USING (true);

-- มีแต่ service role เท่านั้นที่เขียนได้ (ผ่าน API Route)
-- หรือถ้าต้องการให้เฉพาะ admin เขียนผ่าน client → เปิด policy นี้
-- แต่เราจะใช้ API route + service role แทน
