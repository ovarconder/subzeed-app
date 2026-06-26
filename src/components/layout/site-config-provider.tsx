'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import type { SiteConfig } from '@/lib/site-config';

// ============================================================
// 🧩 SiteConfigProvider — inject site config จาก DB สู่ Client
// ============================================================

interface SiteConfigContextType {
  config: SiteConfig;
  loading: boolean;
}

const defaultConfig: SiteConfig = {
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
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primaryLight: '#dbeafe',
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
    copyright: '© 2024 SubZeed',
    links: [
      { label: 'แพ็กเกจ', href: '/pricing' },
      { label: 'เงื่อนไข', href: '/terms' },
      { label: 'ความเป็นส่วนตัว', href: '/privacy' },
    ],
    showSocial: true,
    socialLinks: [
      { label: 'Facebook', href: '#', icon: 'facebook' },
      { label: 'YouTube', href: '#', icon: 'youtube' },
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

const SiteConfigContext = createContext<SiteConfigContextType>({
  config: defaultConfig,
  loading: true,
});

export const useSiteConfig = () => useContext(SiteConfigContext);

export function SiteConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // ดึง basePath จาก location
        const parts = window.location.pathname.split('/').filter(Boolean);
        const basePath = parts.length > 0 && parts[0] !== 'api' ? `/${parts[0]}` : '';
        const res = await fetch(`${basePath}/api/admin/site-config`);
        if (res.ok) {
          const data = await res.json();
          if (data.config) setConfig(data.config);
        }
      } catch (err) {
        console.warn('[SiteConfigProvider] Failed to fetch, using defaults:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SiteConfigContext.Provider value={{ config, loading }}>
      {children}
    </SiteConfigContext.Provider>
  );
}
