'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { TierBadge } from '@/components/ui/badge';
import { useAuth } from '@/components/auth/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { TIER_CONFIGS } from '@/lib/types';
import type { BillingHistory } from '@/lib/types';

export default function BillingPage() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<BillingHistory[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('billing_history')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then((result: { data: BillingHistory[] | null }) => {
        if (result.data) setHistory(result.data);
      });
  }, [profile]);

  if (!profile) return null;

  const tierConfig = TIER_CONFIGS[profile.tier];

  return (
    <>
      <Navbar />
      <main className="flex-1 py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-2xl font-bold mb-8">บิลและการชำระเงิน</h1>

          {/* Current Plan */}
          <div className="rounded-xl border border-border bg-white p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">แพ็กเกจปัจจุบัน</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl font-bold">{tierConfig.name}</span>
                  <TierBadge tier={profile.tier} />
                </div>
                <p className="text-sm text-text-secondary mt-1">
                  {tierConfig.price.toLocaleString()}.- / เดือน
                </p>
              </div>
              <Button variant="outline" onClick={() => window.open('https://billing.stripe.com', '_blank')}>
                จัดการบิล
              </Button>
            </div>

            <div className="mt-4 pt-4 border-t border-border text-sm text-text-secondary">
              <p>รอบบิล: {new Date(profile.billing_cycle_start).toLocaleDateString('th-TH')} — {new Date(profile.billing_cycle_end).toLocaleDateString('th-TH')}</p>
              <p>โควตาที่ใช้: {profile.quota_minutes_used.toFixed(1)} / {profile.quota_minutes_total.toFixed(1)} นาที</p>
            </div>
          </div>

          {/* History */}
          <h2 className="text-lg font-semibold mb-4">ประวัติการชำระเงิน</h2>
          {history.length === 0 ? (
            <p className="text-center text-text-secondary py-8">ยังไม่มีประวัติ</p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-white p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {item.action_type === 'subscribe' ? 'สมัครแพ็กเกจ' :
                       item.action_type === 'renew_early' ? 'ต่ออายุ (เติมก่อน)' :
                       item.action_type === 'recurring' ? 'ต่ออายุอัตโนมัติ' : item.action_type}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {new Date(item.created_at).toLocaleDateString('th-TH')} | {item.previous_tier} → {item.new_tier}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{item.amount_thb.toLocaleString()}.-</p>
                    {item.invoice_number && (
                      <button className="text-xs text-primary hover:underline">
                        ใบเสร็จ #{item.invoice_number}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
