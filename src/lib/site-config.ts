// ============================================================
// 🌐 Site Configuration — SubZeed
// ============================================================
// ไฟล์เดียวสำหรับตั้งค่า: โลโก้, favicon, สี, theme, ข้อความ
// เปลี่ยนตรงนี้แล้วสะท้อนทั้งเว็บ
// ============================================================

export interface SiteConfig {
  // ─── Brand ──────────────────────────────────────────
  brand: {
    name: string;
    tagline: string;
    slogan: string;
    logo: string;                // URL หรือ path
    logoMobile: string;          // สำหรับมือถือ (เล็กกว่า)
    favicon: string;
    logoText?: string;           // ข้อความที่แสดงข้างโลโก้ (ถ้าว่าง = ไม่แสดง)
    showLogoText?: boolean;      // true = แสดงข้อความข้างโลโก้
  };

  // ─── Theme / Colors ─────────────────────────────────
  theme: {
    mode: 'light' | 'dark' | 'system';
    primary: string;
    primaryDark: string;
    primaryLight: string;
    background: string;
    foreground: string;
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    muted: string;
    success: string;
    warning: string;
    danger: string;
    // gradient ใช้กับ hero / banner
    heroGradient: string;
    cardGradient: string;
    // background image / pattern
    backgroundImage?: string;
  };

  // ─── Homepage ───────────────────────────────────────
  homepage: {
    heroTitle: string;
    heroSubtitle: string;
    heroCta: string;
    featuresTitle: string;
    howItWorksTitle: string;
  };

  // ─── Footer ─────────────────────────────────────────
  footer: {
    copyright: string;
    links: Array<{ label: string; href: string }>;
    showSocial: boolean;
    socialLinks: Array<{ label: string; href: string; icon: string }>;
  };

  // ─── Typography ────────────────────────────────────
  typography: {
    fontFamily: string;
    headingsFont: string;
  };

  // ─── Misc ──────────────────────────────────────────
  misc: {
    locale: string;
    currency: string;
    timezone: string;
  };
}

const siteConfig: SiteConfig = {
  brand: {
    name: 'SubZeed',
    tagline: 'ซับซี๊ด',
    slogan: 'สร้างซับไตเติลภาษาไทย อัตโนมัติ ด้วย AI',
    logo: '/logo.svg',
    logoMobile: '/logo-mobile.svg',
    favicon: '/favicon.ico',
    logoText: 'SubZeed',
    showLogoText: true,
  },

  theme: {
    mode: 'light',
    primary: '#2563eb',        // blue-600
    primaryDark: '#1d4ed8',    // blue-700
    primaryLight: '#dbeafe',   // blue-100
    background: '#ffffff',
    foreground: '#0f172a',
    surface: '#f8fafc',
    border: '#e2e8f0',
    text: '#1e293b',
    textSecondary: '#64748b',
    muted: '#94a3b8',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    heroGradient: 'linear-gradient(135deg, #2563eb 0%, #8b5cf6 50%, #06b6d4 100%)',
    cardGradient: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)',
    backgroundImage: undefined,
  },

  homepage: {
    heroTitle: 'ซับไตเติลภาษาไทย\nง่ายนิดเดียว',
    heroSubtitle: 'อัปโหลดวิดีโอ ถอดความอัตโนมัติ แก้ไข เพิ่มลูกเล่น\nSubZeed ช่วยคุณสร้างซับไตเติลระดับมืออาชีพ',
    heroCta: 'เริ่มใช้งานฟรี',
    featuresTitle: 'ทำไมต้อง SubZeed?',
    howItWorksTitle: 'วิธีใช้งาน',
  },

  footer: {
    copyright: `© ${new Date().getFullYear()} SubZeed — สร้างซับไตเติลภาษาไทย อัตโนมัติ`,
    links: [
      { label: 'แพ็กเกจ', href: '/pricing' },
      { label: 'เงื่อนไข', href: '/terms' },
      { label: 'ความเป็นส่วนตัว', href: '/privacy' },
      { label: 'ติดต่อเรา', href: '/contact' },
    ],
    showSocial: true,
    socialLinks: [
      { label: 'Facebook', href: '#', icon: 'facebook' },
      { label: 'YouTube', href: '#', icon: 'youtube' },
      { label: 'TikTok', href: '#', icon: 'tiktok' },
    ],
  },

  typography: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    headingsFont: 'Arial, Helvetica, sans-serif',
  },

  misc: {
    locale: 'th-TH',
    currency: 'THB',
    timezone: 'Asia/Bangkok',
  },
};

export default siteConfig;
