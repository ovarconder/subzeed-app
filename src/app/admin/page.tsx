'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { useToast } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import UsersTable from '@/components/admin/UsersTable';
import BillingTable from '@/components/admin/BillingTable';
import FingerprintsTable from '@/components/admin/FingerprintsTable';
import SiteSettings from '@/components/admin/SiteSettings';
import Reports from '@/components/admin/Reports';
import type { Profile, BillingHistory } from '@/lib/types';

type TabType = 'users' | 'abusers' | 'billing' | 'fingerprints' | 'settings' | 'reports';

const TABS: { key: TabType; label: string }[] = [
  { key: 'users', label: '👥 ผู้ใช้' },
  { key: 'abusers', label: '🚫 Abuser' },
  { key: 'billing', label: '💰 ธุรกรรม' },
  { key: 'fingerprints', label: '🖐️ Fingerprint' },
  { key: 'reports', label: '📊 รายงาน' },
  { key: 'settings', label: '⚙️ ตั้งค่าเว็บ' },
];

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-text-secondary">กำลังโหลด...</p></div>}>
      <AdminDashboard />
    </Suspense>
  );
}

function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const supabase = createClient();
  const { addToast } = useToast();

  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl || 'users');
  const [users, setUsers] = useState<any[]>([]);
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [fingerprints, setFingerprints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.is_super_admin === true ||
    (typeof window !== 'undefined' && localStorage.getItem('admin_bypass') === 'true');

  useEffect(() => {
    if (!profile) return;
    if (!isAdmin) {
      addToast('⛔ ไม่มีสิทธิ์เข้าถึงหน้า Admin', 'error');
      router.push('/dashboard');
    }
  }, [profile]);

  useEffect(() => {
    if (tabFromUrl && TABS.find(t => t.key === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  useEffect(() => {
    if (activeTab === 'settings' || activeTab === 'reports') {
      setLoading(false);
      return;
    }
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'users': {
          const res = await fetch('/api/admin/users');
          if (res.ok) setUsers((await res.json()).users || []);
          break;
        }
        case 'abusers': {
          const res = await fetch('/api/admin/users?abusers=true');
          if (res.ok) setUsers((await res.json()).users || []);
          break;
        }
        case 'billing': {
          const res = await fetch('/api/admin/billing');
          if (res.ok) setBillingHistory((await res.json()).history || []);
          break;
        }
        case 'fingerprints': {
          const res = await fetch('/api/admin/fingerprints');
          if (res.ok) setFingerprints((await res.json()).records || []);
          break;
        }
      }
    } catch (err) {
      console.error('[admin] fetch error:', err);
      addToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    }
    setLoading(false);
  };

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

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    router.push(`/admin?tab=${tab}`, { scroll: false });
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
      <nav className="sticky top-0 z-40 w-full border-b border-border bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-primary">SubZeed</Link>
            <span className="text-sm rounded-full bg-danger/10 text-danger px-3 py-0.5 font-medium">ADMIN</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-text-secondary hover:text-text">← กลับ Dashboard</Link>
            <span className="text-sm text-text-secondary">{user?.email}</span>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-text-secondary mt-1">จัดการผู้ใช้ ระบบ และข้อมูลทั้งหมด</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>🔄 รีเฟรช</Button>
        </div>

        {(activeTab === 'users' || activeTab === 'abusers' || activeTab === 'billing' || activeTab === 'fingerprints') && (
          <div className="grid gap-4 sm:grid-cols-4 mb-8">
            <StatCard label="ผู้ใช้ทั้งหมด" value={users.length.toString()} color="text-primary" />
            <StatCard label="Abuser" value={users.filter((u: any) => u.is_quota_abuser).length.toString()} color="text-danger" />
            <StatCard label="Fingerprint Records" value={fingerprints.length.toString()} color="text-secondary" />
            <StatCard label="ธุรกรรมทั้งหมด" value={billingHistory.length.toString()} color="text-success" />
          </div>
        )}

        <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
        <div key={i} className="h-16 rounded-lg skeleton" />
      ))}
    </div>
  );
}
