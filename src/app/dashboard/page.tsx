// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { TierBadge, QuotaBar } from '@/components/ui/badge';
import { useAuth } from '@/components/auth/auth-provider';
import { createClient } from '@/lib/supabase/client';
import type { Project } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter(); // นำมารับมือกับการย้ายหน้าภายใน Next.js app
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // ─── Super Admin → redirect to /admin ──────────────
  useEffect(() => {
    // ใช้ router.push แทน window.location.href เพื่อไม่ให้หลุด Base Path (/subzeed)
    if (profile?.is_super_admin || profile?.email === 'overconda@gmail.com') {
      router.push('/admin?tab=settings');
      return;
    }

    // แก้ไขจุดนี้: ใส่ Type กำกับไว้ที่โครงสร้างรีเทิร์น ({ data }: { data: any }) เพื่อผ่านการเช็กของ TypeScript
    if (profile?.email === 'overconda@gmail.com' && !profile.is_super_admin) {
      supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', profile.id)
        .single()
        .then(({ data }: { data: { is_super_admin: boolean } | null }) => {
          if (data?.is_super_admin) {
            router.push('/admin?tab=settings');
          }
        });
    }
  }, [profile, router]);

  useEffect(() => {
    // หากเป็นแอดมิน ไม่ต้องโหลดข้อมูลโปรเจกต์ผู้ใช้ทั่วไป
    if (!profile || profile.is_super_admin || profile.email === 'overconda@gmail.com') {
      setLoading(false);
      return;
    }
    
    supabase
      .from('projects')
      .select('*')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false })
      // แก้ไขจุดนี้: ใส่ Type ครอบให้กับตัวแปร result 
      .then((result: { data: Project[] | null }) => {
        if (result.data) setProjects(result.data);
        setLoading(false);
      });
  }, [profile]);

  // ซ่อนการแสดงผลชั่วคราวหากกำลังทำการตรวจสอบและโยกย้ายหน้าของ Admin
  const isUserAdmin = profile?.is_super_admin || user?.email === 'overconda@gmail.com';
  if (isUserAdmin) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-background">
        
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-text-secondary text-sm">จัดการโปรเจกต์และซับไตเติลของคุณ</p>
            </div>
            <Link href="/studio">
              <Button>+ สร้างโปรเจกต์ใหม่</Button>
            </Link>
          </div>

          {/* Quota Card */}
          {profile && (
            <div className="rounded-xl border border-border bg-white p-6 mb-8">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">โควตาคงเหลือ</span>
                  <TierBadge tier={profile.tier} />
                </div>
                <span className="text-sm text-text-secondary">
                  ครบรอบ:{' '}
                  {new Date(profile.billing_cycle_end).toLocaleDateString('th-TH')}
                </span>
              </div>
              <QuotaBar used={profile.quota_minutes_used} total={profile.quota_minutes_total} />
            </div>
          )}

          {/* Projects */}
          <h2 className="text-lg font-semibold mb-4">โปรเจกต์ล่าสุด.</h2>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-xl bg-border skeleton" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-text-secondary mb-4">ยังไม่มีโปรเจกต์</p>
              <Link href="/studio">
                <Button>สร้างโปรเจกต์แรกของคุณ</Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/studio/${project.id}`}
                  className="rounded-xl border border-border bg-white p-5 hover:border-primary transition-colors"
                >
                  <h3 className="font-semibold truncate">{project.title}</h3>
                  <p className="text-sm text-text-secondary mt-1">
                    {project.subtitles.length} รายการ |{' '}
                    {Math.round(project.duration_seconds / 60)} นาที
                  </p>
                  <p className="text-xs text-muted mt-2">
                    อัปเดตล่าสุด: {new Date(project.updated_at).toLocaleDateString('th-TH')}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}