'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { TierBadge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { Profile, BillingHistory, QuotaActivityLog } from '@/lib/types';

// ============================================================
// 📊 Admin — รายงานและสถิติ
// ============================================================

interface ReportData {
  totalUsers: number;
  usersByTier: Record<string, number>;
  totalRevenue: number;
  revenueByTier: Record<string, number>;
  totalTranscriptions: number;
  totalMinutesUsed: number;
  abuserCount: number;
  recentLogs: QuotaActivityLog[];
}

export default function Reports() {
  const supabase = createClient();
  const { user } = useAuth();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');

  useEffect(() => {
    fetchReports();
  }, [dateRange]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      // ใช้ API route ที่มี auth guard อยู่แล้ว
        fetch('/api/admin/quota-logs'),
      ]);

      const users: Profile[] = usersRes.ok ? (await usersRes.json()).users || [] : [];
      const billing: BillingHistory[] = billingRes.ok ? (await billingRes.json()).history || [] : [];
      const logs: QuotaActivityLog[] = logsRes.ok ? (await logsRes.json()).logs || [] : [];

      // คำนวณสถิติ
      const usersByTier: Record<string, number> = {};
      let totalMinutesUsed = 0;
      let abuserCount = 0;

      users.forEach((u) => {
        usersByTier[u.tier] = (usersByTier[u.tier] || 0) + 1;
        totalMinutesUsed += u.quota_minutes_used;
        if ((u as any).is_quota_abuser) abuserCount++;
      });

      const revenueByTier: Record<string, number> = {};
      let totalRevenue = 0;

      billing.forEach((b) => {
        const amount = Number(b.amount_thb) || 0;
        revenueByTier[b.new_tier] = (revenueByTier[b.new_tier] || 0) + amount;
        totalRevenue += amount;
      });

      setData({
        totalUsers: users.length,
        usersByTier,
        totalRevenue,
        revenueByTier,
        totalTranscriptions: logs.filter((l) => l.log_type === 'stt_transcription').length,
        totalMinutesUsed,
        abuserCount,
        recentLogs: logs.slice(0, 20),
      });
    } catch (err) {
      console.error('[Reports] fetch error:', err);
    }
    setLoading(false);
  };

  if (loading) return <div className="space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-20 rounded-lg skeleton" />)}</div>;
  if (!data) return <p className="text-text-secondary">ไม่สามารถโหลดข้อมูล</p>;

  const TIER_NAMES: Record<string, string> = {
    free: 'Free', basic: 'Basic', premium: 'Premium',
    business_starter: 'Business Starter', business_pro: 'Business Pro',
  };

  return (
    <div className="space-y-8">
      {/* ─── Date Range ────────────────────────────── */}
      <div className="flex gap-2">
        {(['7d', '30d', 'all'] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDateRange(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dateRange === d
                ? 'bg-primary text-white'
                : 'bg-surface text-text-secondary hover:text-text'
            }`}
          >
            {d === '7d' ? '7 วัน' : d === '30d' ? '30 วัน' : 'ทั้งหมด'}
          </button>
        ))}
        <Button size="sm" variant="outline" onClick={fetchReports} className="ml-auto">
          🔄 รีเฟรช
        </Button>
      </div>

      {/* ─── Stat Cards ────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportCard label="ผู้ใช้ทั้งหมด" value={data.totalUsers.toLocaleString()} sub="คน" />
        <ReportCard label="รายได้รวม" value={`฿${data.totalRevenue.toLocaleString()}`} sub="บาท" />
        <ReportCard label="ถอดความทั้งหมด" value={data.totalTranscriptions.toLocaleString()} sub="ครั้ง" />
        <ReportCard label="นาทีที่ใช้ไป" value={data.totalMinutesUsed.toLocaleString()} sub="นาที" />
      </div>

      {/* ─── Users by Tier ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-white p-6">
        <h3 className="text-lg font-semibold mb-4">ผู้ใช้แยกตาม Tier</h3>
        <div className="space-y-3">
          {Object.entries(data.usersByTier)
            .sort(([, a], [, b]) => b - a)
            .map(([tier, count]) => (
              <div key={tier} className="flex items-center gap-3">
                <TierBadge tier={tier as any} />
                <div className="flex-1 h-3 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(count / data.totalUsers) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-text-secondary w-16 text-right">
                  {count}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* ─── Revenue by Tier ───────────────────────── */}
      <div className="rounded-xl border border-border bg-white p-6">
        <h3 className="text-lg font-semibold mb-4">รายได้แยกตาม Tier</h3>
        <div className="space-y-3">
          {Object.entries(data.revenueByTier)
            .sort(([, a], [, b]) => b - a)
            .map(([tier, amount]) => (
              <div key={tier} className="flex items-center gap-3">
                <span className="text-sm font-medium w-36">{TIER_NAMES[tier] || tier}</span>
                <div className="flex-1 h-3 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full bg-success transition-all"
                    style={{ width: `${(amount / data.totalRevenue) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-text-secondary w-24 text-right">
                  ฿{amount.toLocaleString()}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* ─── Recent Activity ───────────────────────── */}
      <div className="rounded-xl border border-border bg-white p-6">
        <h3 className="text-lg font-semibold mb-4">กิจกรรมล่าสุด</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {data.recentLogs.length === 0 ? (
            <p className="text-text-secondary text-sm">ไม่มีกิจกรรม</p>
          ) : (
            data.recentLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    log.log_type === 'stt_transcription' ? 'bg-primary-light text-primary' :
                    log.log_type === 'renew_reset' ? 'bg-warning/10 text-warning' :
                    'bg-surface text-text-secondary'
                  }`}>
                    {log.log_type === 'stt_transcription' ? '🎤 ถอดความ' :
                     log.log_type === 'renew_reset' ? '🔄 รีเซ็ต' : '⚙️ Admin'}
                  </span>
                  <span className="text-xs text-text-secondary ml-2">
                    {log.minutes_changed > 0 ? `+${log.minutes_changed}` : log.minutes_changed} นาที
                  </span>
                </div>
                <span className="text-xs text-text-secondary">
                  {new Date(log.created_at).toLocaleDateString('th-TH', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Abuser Alert ──────────────────────────── */}
      {data.abuserCount > 0 && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-danger">⚠️ มี {data.abuserCount} คนที่ถูกระงับ</span>
              <p className="text-sm text-text-secondary mt-1">กรุณาตรวจสอบและปลดล็อกในแท็บ Abuser</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/admin?tab=abusers'}>
              ไปจัดการ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}
