// src/components/admin/SiteSettings.tsx

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import ImageUpload from '@/components/ui/image-upload';
import type { SiteConfig } from '@/lib/site-config';

// ============================================================
// ⚙️ Admin — ตั้งค่าเว็บไซต์ ..
// ============================================================

/**
 * api() — แก้ปัญหา basePath (/subzeed)
 * Next.js basePath='/subzeed' ทำให้ API path จริงต้องเป็น /subzeed/api/...
 * แต่ Client Component fetch() ไม่รู้ basePath ต้องเติมให้เอง
 */
function api(path: string): string {
  if (typeof window === 'undefined') return path;
  const parts = window.location.pathname.split('/').filter(Boolean);
  // ถ้า pathname ขึ้นต้นด้วย base path (เช่น /subzeed/admin) ให้เติม base path
  if (parts.length > 0 && parts[0] !== 'api') {
    return `/${parts[0]}${path}`;
  }
  return path;
}

type ColorKey = keyof SiteConfig['theme'];
type SectionKey = 'brand' | 'theme' | 'homepage' | 'footer' | 'typography' | 'misc';

const SECTION_LABELS: Record<SectionKey, string> = {
  brand: 'แบรนด์',
  theme: 'ธีม / สี',
  homepage: 'หน้าแรก',
  footer: 'Footer',
  typography: 'ตัวอักษร',
  misc: 'อื่นๆ',
};

const COLOR_KEYS: { key: ColorKey; label: string }[] = [
  { key: 'primary', label: 'สีหลัก' },
  { key: 'primaryDark', label: 'สีหลักเข้ม' },
  { key: 'primaryLight', label: 'สีหลักอ่อน' },
  { key: 'surface', label: 'พื้นผิวการ์ด' },
  { key: 'border', label: 'เส้นขอบ' },
  { key: 'text', label: 'ตัวอักษร' },
  { key: 'textSecondary', label: 'ตัวอักษรรอง' },
  { key: 'success', label: 'สีสำเร็จ' },
  { key: 'warning', label: 'สีเตือน' },
  { key: 'danger', label: 'สีอันตราย' },
];

interface Props {
  onRefresh: () => void;
}

export default function SiteSettings({ onRefresh }: Props) {
  const { addToast } = useToast();
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>('brand');

  // ─── โหลด config ─────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(api('/api/admin/site-config'));
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (err) {
      console.error('[SiteSettings] fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // ─── อัปเดตค่าเฉพาะ field ────────────────────────────
  const updateField = (section: string, key: string, value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      [section]: {
        ...(config as any)[section],
        [key]: value,
      },
    } as SiteConfig);
  };

  // ─── บันทึก ───────────────────────────────────────────
  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(api('/api/admin/site-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (res.ok) {
        addToast('✅ บันทึกการตั้งค่าเว็บสำเร็จ', 'success');
        onRefresh();
      } else {
        const err = await res.json();
        addToast(`❌ ${err.error || 'บันทึกไม่สำเร็จ'}`, 'error');
      }
    } catch {
      addToast('❌ เกิดข้อผิดพลาด', 'error');
    }
    setSaving(false);
  };

  // ─── จัดการ Footer Links ──────────────────────────────
  const updateFooterLink = (index: number, field: 'label' | 'href', value: string) => {
    if (!config) return;
    const links = [...config.footer.links];
    links[index] = { ...links[index], [field]: value };
    setConfig({ ...config, footer: { ...config.footer, links } });
  };

  const addFooterLink = () => {
    if (!config) return;
    setConfig({
      ...config,
      footer: {
        ...config.footer,
        links: [...config.footer.links, { label: '', href: '' }],
      },
    });
  };

  const removeFooterLink = (index: number) => {
    if (!config) return;
    const links = config.footer.links.filter((_, i) => i !== index);
    setConfig({ ...config, footer: { ...config.footer, links } });
  };

  const updateSocialLink = (index: number, field: 'label' | 'href' | 'icon', value: string) => {
    if (!config) return;
    const links = [...config.footer.socialLinks];
    links[index] = { ...links[index], [field]: value };
    setConfig({ ...config, footer: { ...config.footer, socialLinks: links } });
  };

  const addSocialLink = () => {
    if (!config) return;
    setConfig({
      ...config,
      footer: {
        ...config.footer,
        socialLinks: [...config.footer.socialLinks, { label: '', href: '', icon: 'facebook' }],
      },
    });
  };

  const removeSocialLink = (index: number) => {
    if (!config) return;
    const links = config.footer.socialLinks.filter((_, i) => i !== index);
    setConfig({ ...config, footer: { ...config.footer, socialLinks: links } });
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg skeleton" />)}</div>;
  if (!config) return <p className="text-text-secondary">ไม่สามารถโหลดข้อมูล</p>;

  return (
    <div className="flex gap-6">
      {/* ─── Sidebar ─────────────────────────────────── */}
      <div className="w-48 shrink-0 space-y-1">
        {(Object.keys(SECTION_LABELS) as SectionKey[]).map((sec) => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === sec
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:bg-surface hover:text-text'
            }`}
          >
            {SECTION_LABELS[sec]}
          </button>
        ))}
      </div>

      {/* ─── Content ─────────────────────────────────── */}
      <div className="flex-1 space-y-6">
        {/* Brand Section */}
        {activeSection === 'brand' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">แบรนด์</h3>
            <Input
              label="ชื่อเว็บ (Name)"
              value={config.brand.name}
              onChange={(e) => updateField('brand', 'name', e.target.value)}
            />
            <Input
              label="คำใต้โลโก้ (Tagline)"
              value={config.brand.tagline}
              onChange={(e) => updateField('brand', 'tagline', e.target.value)}
            />
            <Input
              label="สโลแกน (Slogan)"
              value={config.brand.slogan}
              onChange={(e) => updateField('brand', 'slogan', e.target.value)}
            />
            <ImageUpload
              label="โลโก้ Desktop"
              value={config.brand.logo}
              onChange={(v) => updateField('brand', 'logo', v)}
              folder="logos"
            />
            <ImageUpload
              label="โลโก้ Mobile"
              value={config.brand.logoMobile}
              onChange={(v) => updateField('brand', 'logoMobile', v)}
              folder="logos"
            />
            <ImageUpload
              label="Favicon"
              value={config.brand.favicon}
              onChange={(v) => updateField('brand', 'favicon', v)}
              folder="favicons"
              accept="image/x-icon,image/png,image/svg+xml"
            />
          </div>
        )}

        {/* Theme Section */}
        {activeSection === 'theme' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">ธีม / สี</h3>
            <div className="flex gap-2 items-center">
              <label className="text-sm text-text-secondary">โหมด:</label>
              <select
                className="rounded border border-border px-3 py-1.5 text-sm"
                value={config.theme.mode}
                onChange={(e) => updateField('theme', 'mode', e.target.value)}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {COLOR_KEYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.theme[key]}
                    onChange={(e) => updateField('theme', key, e.target.value)}
                    className="w-10 h-10 rounded border border-border cursor-pointer"
                  />
                  <div className="flex-1">
                    <Input
                      label={label}
                      value={config.theme[key]}
                      onChange={(e) => updateField('theme', key, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Input
              label="Hero Gradient"
              value={config.theme.heroGradient}
              onChange={(e) => updateField('theme', 'heroGradient', e.target.value)}
            />
            <Input
              label="Card Gradient"
              value={config.theme.cardGradient}
              onChange={(e) => updateField('theme', 'cardGradient', e.target.value)}
            />
            <ImageUpload
              label="Background Image"
              value={config.theme.backgroundImage || ''}
              onChange={(v) => updateField('theme', 'backgroundImage', v || undefined)}
              folder="backgrounds"
            />
          </div>
        )}

        {/* Homepage Section */}
        {activeSection === 'homepage' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">หน้าแรก</h3>
            <Input
              label="Hero Title"
              value={config.homepage.heroTitle}
              onChange={(e) => updateField('homepage', 'heroTitle', e.target.value)}
            />
            <Input
              label="Hero Subtitle"
              value={config.homepage.heroSubtitle}
              onChange={(e) => updateField('homepage', 'heroSubtitle', e.target.value)}
            />
            <Input
              label="ปุ่ม CTA"
              value={config.homepage.heroCta}
              onChange={(e) => updateField('homepage', 'heroCta', e.target.value)}
            />
            <Input
              label="หัวข้อ Features"
              value={config.homepage.featuresTitle}
              onChange={(e) => updateField('homepage', 'featuresTitle', e.target.value)}
            />
            <Input
              label="หัวข้อ วิธีใช้งาน"
              value={config.homepage.howItWorksTitle}
              onChange={(e) => updateField('homepage', 'howItWorksTitle', e.target.value)}
            />
          </div>
        )}

        {/* Footer Section */}
        {activeSection === 'footer' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Footer</h3>
            <Input
              label="Copyright"
              value={config.footer.copyright}
              onChange={(e) => updateField('footer', 'copyright', e.target.value)}
            />

            {/* Links */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-secondary">ลิงก์ Footer</label>
                <Button size="sm" variant="outline" onClick={addFooterLink}>+ เพิ่มลิงก์</Button>
              </div>
              <div className="space-y-2">
                {config.footer.links.map((link, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Input
                      label="ชื่อ"
                      value={link.label}
                      onChange={(e) => updateFooterLink(i, 'label', e.target.value)}
                    />
                    <Input
                      label="ลิงก์"
                      value={link.href}
                      onChange={(e) => updateFooterLink(i, 'href', e.target.value)}
                    />
                    <button
                      onClick={() => removeFooterLink(i)}
                      className="mt-6 text-danger text-sm hover:underline shrink-0"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Social Links */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-secondary">โซเชียลลิงก์</label>
                <Button size="sm" variant="outline" onClick={addSocialLink}>+ เพิ่ม</Button>
              </div>
              <div className="space-y-2">
                {config.footer.socialLinks.map((link, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Input
                      label="ชื่อ"
                      value={link.label}
                      onChange={(e) => updateSocialLink(i, 'label', e.target.value)}
                    />
                    <Input
                      label="ลิงก์"
                      value={link.href}
                      onChange={(e) => updateSocialLink(i, 'href', e.target.value)}
                    />
                    <Input
                      label="Icon"
                      value={link.icon}
                      onChange={(e) => updateSocialLink(i, 'icon', e.target.value)}
                    />
                    <button
                      onClick={() => removeSocialLink(i)}
                      className="mt-6 text-danger text-sm hover:underline shrink-0"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Typography Section */}
        {activeSection === 'typography' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">ตัวอักษร</h3>
            <Input
              label="Font Family (ทั่วไป)"
              value={config.typography.fontFamily}
              onChange={(e) => updateField('typography', 'fontFamily', e.target.value)}
            />
            <Input
              label="Font Family (หัวข้อ)"
              value={config.typography.headingsFont}
              onChange={(e) => updateField('typography', 'headingsFont', e.target.value)}
            />
          </div>
        )}

        {/* Misc Section */}
        {activeSection === 'misc' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">อื่นๆ</h3>
            <Input
              label="Locale"
              value={config.misc.locale}
              onChange={(e) => updateField('misc', 'locale', e.target.value)}
            />
            <Input
              label="สกุลเงิน"
              value={config.misc.currency}
              onChange={(e) => updateField('misc', 'currency', e.target.value)}
            />
            <Input
              label="Timezone"
              value={config.misc.timezone}
              onChange={(e) => updateField('misc', 'timezone', e.target.value)}
            />
          </div>
        )}

        {/* ─── Save Button ────────────────────────────── */}
        <div className="pt-4 border-t border-border">
          <Button onClick={handleSave} loading={saving}>
            💾 บันทึกการตั้งค่า
          </Button>
        </div>
      </div>
    </div>
  );
}
