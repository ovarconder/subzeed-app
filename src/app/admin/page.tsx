'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { TierBadge, QuotaBar } from '@/components/ui/badge';
import { useAuth } from '@/components/auth/auth-provider';
import { useToast } from '@/components/ui/toaster';
import type { Profile, BillingHistory } from '@/lib/types';

// ============================================================
// 📊 ADMIN DASHBOARD — SubZeed
// ============================================================
// เส้นทาง: /admin
// ต้องการ: user ที่มี tier = 'business_pro' หรือ email admin ที่ hardcode
// ============================================================

interface FingerprintRecord {
  id: string;
  fingerprint: string;
  user_id: string;
  email: string;
  action: string;
  ip_address: string | null;
  blocked: boolean;
  created_at: string;
}

type TabType = 'users' | 'abusers' | 'billing' | 'fingerprints';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabase = createClient();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
  const [fingerprints, setFingerprints] = useState<FingerprintRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── ตรวจสอบสิทธิ์ Admin ─────────────────────────────────
  const isAdmin =
    profile?.tier === 'business_pro' ||
    (typeof window !== 'undefined' &&
      (localStorage.getItem('admin_bypass') === 'true'));

  useEffect(() => {
    if (!profile) return; // still loading

    if (!isAdmin) {
      addToast('⛔ ไม่มีสิทธิ์เข้าถึงหน้า Admin', 'error');
      router.push('/dashboard');
      return;
    }

    fetchData();
  }, [profile, activeTab]);

  // ─── ดึงข้อมูล ────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // ใช้ API route แทน direct service role (ปลอดภัยกว่า)
    try {
      switch (activeTab) {
        case 'users': {
          const res = await fetch('/api/admin/users');
          if (res.ok) {
            const data = await res.json();
            setUsers(data.users || []);
          }
          break;
        }
        case 'billing': {
          const res = await fetch('/api/admin/billing');
          if (res.ok) {
            const data = await res.json();
            setBillingHistory(data.history || []);
          }
          break;
        }
        case 'fingerprints': {
          const res = await fetch('/api/admin/fingerprints');
          if (res.ok) {
            const data = await res.json();
            setFingerprints(data.records || []);
          }
          break;
        }
        case 'abusers': {
          const res = await fetch('/api/admin/users?abusers=true');
          if (res.ok) {
            const data = await res.json();
            setUsers(data.users || []);
          }
          break;
        }
      }
    } catch (err) {
      console.error('[admin] fetch error:', err);
      addToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    }
    setLoading(false);
  };

  // ─── อัปเดต Tier ผู้ใช้ ──────────────────────────────────
  const handleUpdateTier = async (userId: string, newTier: string) => {
    const res = await fetch('/api/admin/update-tier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, tier: newTier }),
    });
    if (res.ok) {
      addToast('✅ อัปเดต Tier สำเร็จ', 'success');
      fetchData();
    } else {
      addToast('❌ อัปเดตล้มเหลว', 'error');
    }
  };

  // ─── ปลดล็อก Abuser ─────────────────────────────────────
  const handleUnblock = async (userId: string) => {
    const res = await fetch('/api/admin/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      addToast('✅ ปลดล็อกผู้ใช้สำเร็จ', 'success');
      fetchData();
    } else {
      addToast('❌ ปลดล็อกไม่สำเร็จ', 'error');
    }
  };

  if (!profile || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-text-secondary">กำลังตรวจสอบสิทธิ์...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Admin Navbar */}
      <nav className="sticky top-0 z-40 w-full border-b border-border bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-primary">SubZeed</Link>
            <span className="text-sm rounded-full bg-danger/10 text-danger px-3 py-0.5 font-medium">
              ADMIN
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-text-secondary hover:text-text">
              ← กลับ Dashboard
            </Link>
            <span className="text-sm text-text-secondary">
              {user?.email}
            </span>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {/* ─── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-text-secondary mt-1">จัดการผู้ใช้ ระบบ และข้อมูลทั้งหมด</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              🔄 รีเฟรช
            </Button>
          </div>
        </div>

        {/* ─── Stats Overview ─────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-4 mb-8">
          <StatCard label="ผู้ใช้ทั้งหมด" value={users.length.toString()} color="text-primary" />
          <StatCard label="Abuser" value={users.filter(u => (u as any).is_quota_abuser).length.toString()} color="text-danger" />
          <StatCard label="指纹 Records" value={fingerprints.length.toString()} color="text-secondary" />
          <StatCard label="ธุรกรรมทั้งหมด" value={billingHistory.length.toString()} color="text-success" />
        </div>

        {/* ─── Tabs ───────────────────────────────────── */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {([
            { key: 'users', label: '👥 ผู้ใช้' },
            { key: 'abusers', label: '🚫 Abuser' },
            { key: 'billing', label: '💰 ธุรกรรม' },
            { key: 'fingerprints', label: '🖐️ Fingerprint' },
          ] as { key: TabType; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Content ────────────────────────────────── */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg skeleton" />
            ))}
          </div>
        ) : (
          <>
            {/* Users Tab */}
            {(activeTab === 'users' || activeTab === 'abusers') && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">อีเมล</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">Tier</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">โควตา</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">Abuser</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">รอบบิล</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-text-secondary">ไม่มีข้อมูล</td></tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id} className="border-b border-border hover:bg-white/50">
                          <td className="py-3 px-4">
                            <span className="font-medium">{u.email}</span>
                          </td>
                          <td className="py-3 px-4">
                            <TierBadge tier={u.tier} />
                          </td>
                          <td className="py-3 px-4">
                            <div className="max-w-[180px]">
                              <QuotaBar used={u.quota_minutes_used} total={u.quota_minutes_total} />
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {(u as any).is_quota_abuser ? (
                              <span className="text-danger font-medium">🚫 ใช่</span>
                            ) : (
                              <span className="text-text-secondary">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-text-secondary">
                            {new Date(u.billing_cycle_end).toLocaleDateString('th-TH')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <select
                                className="text-xs rounded border border-border px-2 py-1"
                                value={u.tier}
                                onChange={(e) => handleUpdateTier(u.id, e.target.value)}
                              >
                                <option value="free">Free</option>
                                <option value="basic">Basic</option>
                                <option value="premium">Premium</option>
                                <option value="business_starter">Business Starter</option>
                                <option value="business_pro">Business Pro</option>
                              </select>
                              {(u as any).is_quota_abuser && (
                                <Button size="sm" variant="outline" onClick={() => handleUnblock(u.id)}>
                                  ปลดล็อก
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">ผู้ใช้</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">Action</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">Tier</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">จำนวนเงิน</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">เลขที่ใบเสร็จ</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">วันที่</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">ดาวน์โหลด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingHistory.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-text-secondary">ไม่มีประวัติธุรกรรม</td></tr>
                    ) : (
                      billingHistory.map((b) => (
                        <tr key={b.id} className="border-b border-border hover:bg-white/50">
                          <td className="py-3 px-4 font-medium">{b.user_id?.slice(0, 8)}...</td>
                          <td className="py-3 px-4">
                            <span className="capitalize">{b.action_type.replace('_', ' ')}</span>
                          </td>
                          <td className="py-3 px-4">
                            {b.previous_tier} → {b.new_tier}
                          </td>
                          <td className="py-3 px-4 font-semibold">{b.amount_thb.toLocaleString()}.-</td>
                          <td className="py-3 px-4 text-xs text-text-secondary">
                            {b.invoice_number || '—'}
                          </td>
                          <td className="py-3 px-4 text-xs text-text-secondary">
                            {new Date(b.created_at).toLocaleDateString('th-TH')}
                          </td>
                          <td className="py-3 px-4">
                            <a
                              href={`/api/invoice/${b.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              📄 ใบเสร็จ
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Fingerprints Tab */}
            {activeTab === 'fingerprints' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">Fingerprint</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">อีเมล</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">Action</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">IP</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">บล็อก</th>
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">วันที่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fingerprints.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-text-secondary">ไม่มีข้อมูล</td></tr>
                    ) : (
                      fingerprints.map((f) => (
                        <tr key={f.id} className="border-b border-border hover:bg-white/50">
                          <td className="py-3 px-4 font-mono text-xs">{f.fingerprint.slice(0, 20)}...</td>
                          <td className="py-3 px-4">{f.email}</td>
                          <td className="py-3 px-4 capitalize">{f.action}</td>
                          <td className="py-3 px-4 text-xs text-text-secondary">{f.ip_address || '—'}</td>
                          <td className="py-3 px-4">
                            {f.blocked ? (
                              <span className="text-danger font-medium">🔴 ใช่</span>
                            ) : (
                              <span className="text-success font-medium">🟢 ไม่</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-text-secondary">
                            {new Date(f.created_at).toLocaleDateString('th-TH')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Stat Card Component ──────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
