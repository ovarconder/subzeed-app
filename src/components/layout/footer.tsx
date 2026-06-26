'use client';

import Link from 'next/link';
import { useSiteConfig } from '@/components/layout/site-config-provider';

const socialIcons: Record<string, string> = {
  facebook: '📘',
  youtube: '▶️',
  tiktok: '🎵',
  twitter: '🐦',
  instagram: '📸',
  line: '💬',
};

export function Footer() {
  const { config: siteConfig } = useSiteConfig();
  const { footer, brand } = siteConfig;

  return (
    <footer className="mt-auto" style={{
      borderTop: `1px solid var(--sz-border)`,
      backgroundColor: 'var(--sz-surface)',
    }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          {/* Brand + Slogan */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-3">
              <span className="text-lg font-bold" style={{ color: 'var(--sz-primary)' }}>
                {brand.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--sz-muted)' }}>
                {brand.tagline}
              </span>
            </Link>
            <p className="text-sm" style={{ color: 'var(--sz-text-secondary)' }}>
              {brand.slogan}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--sz-text)' }}>ลิงก์</h4>
            <ul className="space-y-2">
              {footer.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors"
                    style={{ color: 'var(--sz-text-secondary)' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          {footer.showSocial && (
            <div>
              <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--sz-text)' }}>โซเชียล</h4>
              <div className="flex gap-3">
                {footer.socialLinks.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg transition-opacity hover:opacity-70"
                    title={s.label}
                  >
                    {socialIcons[s.icon] || '🔗'}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-6 text-center text-sm" style={{
          borderTop: `1px solid var(--sz-border)`,
          color: 'var(--sz-muted)',
        }}>
          {footer.copyright}
        </div>
      </div>
    </footer>
  );
}

