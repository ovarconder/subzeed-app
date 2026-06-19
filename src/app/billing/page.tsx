'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { TierBadge } from '@/components/ui/badge';
import { useAuth } from '@/components/auth/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toaster';
import { TIER_CONFIGS } from '@/lib/types';
import { generateReceiptPDF, downloadInvoice } from '@/lib/invoice';
import type { BillingHistory, Profile } from '@/lib/types';

export default function BillingPage() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<BillingHistory[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const supabase = createClient();
  const { addToast } = useToast();

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

  // ─── ดาวน์โหลดใบเสร็จ PDF ─────────────────────────────
  const handleDownloadInvoice = async (billing: BillingHistory) => {
    if (!profile) return;
    setDownloadingId(billing.id);

    try {
      // วิธีที่ 1: ใช้ Client-side jspdf (เร็วกว่า ไม่ต้องโหลด server)
      const pdfBlob = await generateReceiptPDF(profile, billing, false);
      const filename = `SubZeed_Receipt_${billing.invoice_number || billing.id}`;
      downloadInvoice(pdfBlob, filename);
      addToast('✅ ดาวน์โหลดใบเสร็จสำเร็จ', 'success');
    } catch (err: any) {
      console.error('[billing] PDF generation error:', err);

      // วิธีที่ 2: Fallback — เปิดหน้า HTML Invoice แล้วให้ Browser print-to-PDF
      addToast('กำลังเปิดหน้าใบเสร็จ... กดพิมพ์เพื่อบันทึกเป็น PDF', 'info');
      window.open(`/api/invoice/${billing.id}/download`, '_blank');
    }
    setDownloadingId(null);
  };

  if (!profile) return null;

  const tierConfig = TIER_CONFIGS[profile.tier];
  const canDownloadInvoice = profile.tier === 'business_pro';

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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">ประวัติการชำระเงิน</h2>
            {canDownloadInvoice && (
              <span className="text-xs text-success bg-success/10 px-2.5 py-0.5 rounded-full font-medium">
                ✅ ดาวน์โหลดใบกำกับภาษีได้
              </span>
            )}
          </div>

          {history.length === 0 ? (
            <p className="text-center text-text-secondary py-8">ยังไม่มีประวัติ</p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => {
                const isDownloading = downloadingId === item.id;
                return (
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
                    <div className="text-right flex items-center gap-3">
                      <p className="font-semibold">{item.amount_thb.toLocaleString()}.-</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownloadInvoice(item)}
                        loading={isDownloading}
                        disabled={isDownloading}
                      >
                        {isDownloading ? 'กำลังสร้าง...' : item.invoice_number ? `📄 #${item.invoice_number.slice(0, 8)}` : '📄 ใบเสร็จ'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* หมายเหตุ */}
          <div className="mt-8 rounded-xl border border-border bg-surface p-4 text-xs text-text-secondary">
            <p className="font-medium mb-1">📌 หมายเหตุเกี่ยวกับเอกสาร</p>
            <p>• ช่วงยังไม่จด VAT: ใบเสร็จรับเงิน (ไม่มีแถวภาษีมูลค่าเพิ่ม)</p>
            <p>• ช่วงจด VAT แล้ว: ใบเสร็จรับเงิน / ใบกำกับภาษี (มี VAT 7%)</p>
            <p>• แพ็กเกจ Business Pro สามารถดาวน์โหลดใบกำกับภาษีเต็มรูปแบบได้</p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
