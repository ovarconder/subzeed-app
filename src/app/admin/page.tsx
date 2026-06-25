// src/app/admin/page.tsx

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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-text-secondary text-sm">กำลังโหลดหน้าผู้ดูแลระบบ...</p></div>}>
      <AdminContent />
    </Suspense>
  );
}

function AdminContent() {
  const router = useRouter();
  const { profile, isLoading } = useAuth(); // ดึงสถานะ isLoading มาใช้เช็กสิทธิ์แบบเรียลไทม์
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const supabase = createClient();

  const activeTab = (searchParams.get('tab') as TabType) || 'users';

  const [users, setUsers] = useState<Profile[]>([]);
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
  const [fingerprints, setFingerprints] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, activeToday: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);

  // ─── 1. ระบบตรวจสิทธิ์แอดมิน (Admin Guard) ──────────────────
  useEffect(() => {
    // ถ้ายังดึงสถานะล็อกอินหรือโปรไฟล์ไม่เสร็จ ให้รอการโหลดก่อน อย่าเพิ่งดีดผู้ใช้ออก
    if (isLoading) return;

    const isUserAdmin = profile?.is_super_admin || profile?.email === 'overconda@gmail.com';
    
    // หากโหลดข้อมูลโปรไฟล์เสร็จแล้ว แต่ตรวจพบว่าไม่มีสิทธิ์แอดมิน ให้ดีดกลับหน้าหลักผ่าน router ทันที
    if (!profile || !isUserAdmin) {
      addToast('คุณไม่มีสิทธิ์เข้าถึงหน้านี้', 'error');
      router.push('/dashboard');
    }
  }, [profile, isLoading, router]);

  // ฟังก์ชันดึงข้อมูลดั้งเดิมของระบบ
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users' || activeTab === 'abusers') {
        const isAbuser = activeTab === 'abusers';
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('is_blocked', isAbuser)
          .order('created_at', { ascending: false });
        if (data) setUsers(data);
      } else if (activeTab === 'billing') {
        const { data } = await supabase
          .from('billing_history')
          .select('*')
          .order('created_at', { ascending: false });
        if (data) setBillingHistory(data);
      } else if (activeTab === 'fingerprints') {
        const { data } = await supabase
          .from('user_fingerprints')
          .select('*')
          .order('created_at', { ascending: false });
        if (data) setFingerprints(data);
      }

      // ดึงข้อมูล Stats สรุปภาพรวม
      const { data: sData } = await supabase.rpc('get_admin_stats');
      if (sData) setStats(sData);
    } catch (err) {
      console.error('Fetch admin data error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── 2. โหลดข้อมูลเมื่อสิทธิ์ผ่านและหน้าเว็บพร้อมทำงาน ──────────────────
  useEffect(() => {
    if (isLoading) return;

    const isUserAdmin = profile?.is_super_admin || profile?.email === 'overconda@gmail.com';
    if (!profile || !isUserAdmin) return;

    fetchData();
  }, [profile, isLoading, activeTab]);

  const handleUpdateTier = async (userId: string, tier: string) => {
    const { error } = await supabase.from('profiles').update({ tier }).eq('id', userId);
    if (!error) {
      addToast('อัปเดตแพ็กเกจสำเร็จ', 'success');
      fetchData();
    }
  };

  const handleUnblock = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ is_blocked: false }).eq('id', userId);
    if (!error) {
      addToast('ปลดบล็อกผู้ใช้สำเร็จ', 'success');
      fetchData();
    }
  };

  // บล็อกสกรีนหน้าจอไว้ในเสี้ยววินาทีแรกที่กำลังโหลดสิทธิ์ ป้องกันข้อมูลหลังบ้านหลุดแสดงผลก่อนได้รับอนุญาต
  const isUserAdmin = profile?.is_super_admin || profile?.email === 'overconda@gmail.com';
  if (isLoading || !profile || !isUserAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-text-secondary text-sm">กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</p>
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
          <Link href="/dashboard">
            <Button variant="outline">⬅️ กลับหน้าเว็บปกติ</Button>
          </Link>
        </div>

        {/* Stats Section */}
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <StatCard label="ผู้ใช้งานทั้งหมด" value={`${stats.totalUsers} คน`} color="text-primary" />
          <StatCard label="ออนไลน์วันนี้" value={`${stats.activeToday} คน`} color="text-success" />
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
