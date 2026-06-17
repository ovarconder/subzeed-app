'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { useRouter } from 'next/navigation';
import { TIER_CONFIGS } from '@/lib/types';

export function Navbar() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  const tierLabel = profile?.tier ? TIER_CONFIGS[profile.tier]?.name : 'Free';
  const quotaLeft = profile
    ? Math.max(0, profile.quota_minutes_total - profile.quota_minutes_used)
    : 0;

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-border bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-primary">SubZeed</span>
          <span className="hidden text-xs text-muted sm:inline">ซับซี๊ด</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-text-secondary hover:text-text transition-colors">
            แพ็กเกจ
          </Link>

          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-text-secondary hover:text-text transition-colors"
              >
                Dashboard
              </Link>

              {/* Quota badge */}
              <div className="hidden items-center gap-1 rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary md:flex">
                <span>{tierLabel}</span>
                <span className="text-muted">|</span>
                <span>{quotaLeft.toFixed(1)} นาที</span>
              </div>

              {/* User menu */}
              <div className="relative group">
                <button className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm font-medium hover:bg-border transition-colors">
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-white text-xs">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline truncate max-w-[120px]">
                    {user.email?.split('@')[0]}
                  </span>
                </button>
                <div className="absolute right-0 mt-2 w-48 origin-top-right scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all rounded-lg border border-border bg-white shadow-lg">
                  <div className="py-1">
                    <Link href="/dashboard" className="block px-4 py-2 text-sm hover:bg-surface">
                      Dashboard
                    </Link>
                    <Link href="/billing" className="block px-4 py-2 text-sm hover:bg-surface">
                      บิลและการชำระเงิน
                    </Link>
                    <button
                      onClick={() => { signOut(); router.push('/'); }}
                      className="block w-full text-left px-4 py-2 text-sm text-danger hover:bg-surface"
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:text-text transition-colors"
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
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
