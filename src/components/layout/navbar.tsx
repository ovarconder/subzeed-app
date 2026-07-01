// src/components/layout/navbar.tsx
'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { useRouter } from 'next/navigation';
import { TIER_CONFIGS } from '@/lib/types';
import { useSiteConfig } from '@/components/layout/site-config-provider';

export function Navbar() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { config: siteConfig } = useSiteConfig();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Refresh profile ทุกครั้งที่ component mount / focus ──
  useEffect(() => {
    if (!user) return;
    refreshProfile();
  }, [user]);

  const openMenu = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setAccountOpen(true);
  };

  const closeMenu = () => {
    closeTimerRef.current = setTimeout(() => {
      setAccountOpen(false);
    }, 300); // delay 300ms ก่อนปิด
  };

  const toggleMenu = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setAccountOpen(prev => !prev);
  };

  const tierLabel = profile?.tier ? TIER_CONFIGS[profile.tier]?.name : 'Free';
  const isUnlimited = profile?.tier === 'unlimited';
  const quotaLeft = isUnlimited
    ? Infinity
    : profile
      ? Math.max(0, (profile.quota_minutes_total ?? 0) - (profile.quota_minutes_used ?? 0))
      : 0;

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-[var(--sz-border)] bg-white/80 backdrop-blur-md" style={{ borderColor: 'var(--sz-border)' }}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          {/* Desktop logo */}
          <img
            src={siteConfig.brand.logo}
            alt={siteConfig.brand.name}
            className="hidden sm:block h-8 w-auto"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {/* Mobile logo */}
          <img
            src={siteConfig.brand.logoMobile}
            alt={siteConfig.brand.name}
            className="sm:hidden h-7 w-auto"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {/* Logo text (ถ้าเปิดใช้งาน) */}
          {siteConfig.brand.showLogoText !== false && siteConfig.brand.logoText && (
            <span className="text-xl font-bold tracking-tight" style={{ color: 'var(--sz-primary)' }}>
              {siteConfig.brand.logoText}
            </span>
          )}
          <span className="hidden text-xs sm:inline" style={{ color: 'var(--sz-muted)' }}>
            {siteConfig.brand.tagline}
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="transition-colors" style={{ color: 'var(--sz-text-secondary)' }}>
            แพ็กเกจ
          </Link>

          {user ? (
            <>
              <Link href="/dashboard" className="transition-colors" style={{ color: 'var(--sz-text-secondary)' }}>
                Dashboard
              </Link>

              {profile?.is_super_admin && (
                <Link
                  href="/admin"
                  className="text-xs rounded-full px-2.5 py-0.5 font-medium transition-colors"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--sz-danger)' }}
                >
                  ADMIN
                </Link>
              )}

              <div className="hidden items-center gap-1 rounded-full px-3 py-1 text-xs font-medium md:flex"
                style={{ backgroundColor: 'var(--sz-primary-light)', color: 'var(--sz-primary)' }}>
                <span>{tierLabel}</span>
                <span style={{ color: 'var(--sz-muted)' }}>|</span>
                {isUnlimited ? (
                  <span>♾️ ไม่จำกัด</span>
                ) : (
                  <span>{quotaLeft.toFixed(1)} นาที</span>
                )}
              </div>

              <div className="relative"
                onMouseEnter={openMenu}
                onMouseLeave={closeMenu}>
                <button className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{ backgroundColor: 'var(--sz-surface)' }}
                  onClick={toggleMenu}>
                  <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs"
                    style={{ backgroundColor: 'var(--sz-primary)' }}>
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline truncate max-w-[120px]">
                    {user.email?.split('@')[0]}
                  </span>
                </button>
                {accountOpen && (
                  <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-lg border shadow-lg bg-white py-1 z-50"
                    style={{ borderColor: 'var(--sz-border)' }}
                    onMouseEnter={openMenu}
                    onMouseLeave={closeMenu}>
                    <Link href="/dashboard" className="block px-4 py-2 text-sm hover:bg-surface"
                      style={{ color: 'var(--sz-text)' }}>
                      Dashboard
                    </Link>
                    <Link href="/billing" className="block px-4 py-2 text-sm hover:bg-surface"
                      style={{ color: 'var(--sz-text)' }}>
                      บิลและการชำระเงิน
                    </Link>
                    <button
                      onClick={() => { signOut(); router.push('/'); }}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-surface"
                      style={{ color: 'var(--sz-danger)' }}
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{ color: 'var(--sz-text-secondary)' }}
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/signup"
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--sz-primary)' }}
              >
                สมัครใช้งาน
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

