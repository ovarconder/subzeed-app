// src/app/admin/page.tsx

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { useToast } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import UsersTable from '@/components/admin/UsersTable';
import BillingTable from '@/components/admin/BillingTable';
import FingerprintsTable from '@/components/admin/FingerprintsTable';
import SiteSettings from '@/components/admin/SiteSettings';
import ApiConfig from '@/components/admin/ApiConfig';
import Reports from '@/components/admin/Reports';
import type { Profile, BillingHistory } from '@/lib/types';

type TabType = 'users' | 'abusers' | 'billing' | 'fingerprints' | 'settings' | 'api-config' | 'reports';

const TABS: { key: TabType; label: string }[] = [
  { key: 'users', label: '👥 ผู้ใช้' },
  { key: 'abusers', label: '🚫 Abuser' },
  { key: 'billing', label: '💰 ธุรกรรม' },
  { key: 'fingerprints', label: '🖐️ Fingerprint' },
  { key: 'reports', label: '📊 รายงาน' },
  { key: 'settings', label: '⚙️ ตั้งค่าเว็บ' },
  { key: 'api-config', label: '🎛️ ตั้งค่า API' },
];

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-text-secondary text-sm">กำลังโหลดหน้าผู้ดูแลระบบ...</p></div>}>
      <AdminContent />
    </Suspense>
  );
}

function AdminContent() {
  const router = useRouter();
  const { profile, user, isLoading, signOut } = useAuth(); // ดึง signOut สำหรับ Log
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const supabase = createClient();

  const activeTab = (searchParams.get('tab') as TabType) || 'users';

  const [users, setUsers] = useState<Profile[]>([]);
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
  const [fingerprints, setFingerprints] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, todayUsers: 0, activeNow: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);

  // Helper: เรียก API route (ใช้ service role bypass RLS)
  const apiGet = async (path: string) => {
    const res = await fetch(api(path), {
      headers: {
        'x-user-id': user?.id || '',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API ${path}: ${res.status}`);
    }
    return res.json();
  };

  // ─── 1. Admin Guard — เช็คครั้งเดียว ป้องกัน loop ─────
  const [adminChecked, setAdminChecked] = useState(false);
  useEffect(() => {
    if (isLoading || adminChecked) return;

    const isUserAdmin = profile?.is_super_admin || user?.email === 'overconda@gmail.com';

    if (!isUserAdmin) {
      addToast('คุณไม่มีสิทธิ์เข้าถึงหน้านี้', 'error');
      router.push('/dashboard');
      return;
    }

    setAdminChecked(true);
  }, [profile, user, isLoading, adminChecked, router]);

  // ฟังก์ชันดึงข้อมูล — ใช้ API route (service role) แทน client-side Supabase (anon key + RLS)
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const data = await apiGet('/api/admin/users');
        setUsers(data.users || []);
      } else if (activeTab === 'abusers') {
        const data = await apiGet('/api/admin/users?abusers=true');
        setUsers(data.users || []);
      } else if (activeTab === 'billing') {
        const data = await apiGet('/api/admin/billing');
        setBillingHistory(data.history || []);
      } else if (activeTab === 'fingerprints') {
        const data = await apiGet('/api/admin/fingerprints');
        setFingerprints(data.records || []);
      }

      // Stats — ใช้ API route แทน RPC (เผื่อ migration 006 ยังไม่รัน)
      try {
        const statsData = await apiGet('/api/admin/stats');
        setStats({
          totalUsers: statsData.totalUsers ?? 0,
          todayUsers: statsData.todayUsers ?? 0,
          activeNow: statsData.activeNow ?? 0,
          totalRevenue: statsData.totalRevenue ?? 0,
        });
      } catch {
        console.warn('[admin] Stats API failed, using fallback');
      }
    } catch (err) {
      console.error('Fetch admin data error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── 2. โหลดข้อมูลเมื่อสิทธิ์ผ่านและหน้าเว็บพร้อมทำงาน ──────────────────
  useEffect(() => {
    if (!adminChecked || isLoading) return;
    fetchData();
  }, [adminChecked, activeTab]);

  const handleUpdateTier = async (userId: string, tier: string) => {
    try {
      const res = await fetch(api('/api/admin/users/update-tier'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || '',
        },
        body: JSON.stringify({ userId, tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      addToast('อัปเดตแพ็กเกจสำเร็จ', 'success');
      fetchData();
    } catch (err: any) {
      addToast(`❌ ${err.message}`, 'error');
    }
  };

  // ─── Logout ────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await signOut();
      addToast('👋 ออกจากระบบสำเร็จ', 'success');
      router.push('/');
    } catch {
      addToast('❌ เกิดข้อผิดพลาดในการออกจากระบบ', 'error');
    }
  };

  const handleUnblock = async (userId: string) => {
    try {
      const res = await fetch(api('/api/admin/users/unblock'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Unblock failed');
      addToast('ปลดบล็อกผู้ใช้สำเร็จ', 'success');
      fetchData();
    } catch {
      addToast('❌ ปลดบล็อกไม่สำเร็จ', 'error');
    }
  };

  // ถ้ายังไม่ได้เช็ค admin หรือกำลังโหลด ให้แสดง spinner
  if (isLoading || !adminChecked) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-background">
       
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">👑 ระบบจัดการหลังบ้าน (Admin)</h1>
            <p className="text-text-secondary text-sm">จัดการผู้ใช้ บิล ตรวจสอบผู้ทุจริต และตั้งค่าระบบ</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard">
              <Button variant="outline">⬅️ กลับหน้าเว็บปกติ</Button>
            </Link>
            <Button variant="outline" onClick={handleLogout} className="text-danger border-danger hover:bg-danger/10">
              🚪 ออกจากระบบ
            </Button>
          </div>
        </div>

        {/* Stats Section — 4 cards 2x2 */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mb-8">
          <StatCard label="ผู้ใช้ทั้งหมด" value={`${stats.totalUsers} คน`} color="text-primary" />
          <StatCard label="สมัครวันนี้" value={`${stats.todayUsers} คน`} color="text-success" />
          <StatCard label="กำลังใช้งาน" value={`${stats.activeNow} คน`} color="text-info" />
          <StatCard label="รายได้รวม (ประมาณ)" value={`฿${stats.totalRevenue?.toLocaleString()}`} color="text-warning" />
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-border mb-6 overflow-x-auto gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => router.push(`/admin?tab=${tab.key}`)}
              className={`pb-3 text-sm font-medium border-b-2 px-1 whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'settings' && <SiteSettings onRefresh={fetchData} />}
        {activeTab === 'api-config' && <ApiConfig />}
        {activeTab === 'reports' && <Reports />}

        {(activeTab === 'users' || activeTab === 'abusers') && (
          loading ? <Skeleton count={4} /> : <UsersTable users={users} onUpdateTier={handleUpdateTier} onUnblock={handleUnblock} />
        )}

        {activeTab === 'billing' && (
          loading ? <Skeleton count={4} /> : <BillingTable billing={billingHistory} />
        )}

        {activeTab === 'fingerprints' && (
          loading ? <Skeleton count={4} /> : <FingerprintsTable fingerprints={fingerprints} />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-12 w-full rounded-lg bg-surface skeleton" />
      ))}
    </div>
  );
}
