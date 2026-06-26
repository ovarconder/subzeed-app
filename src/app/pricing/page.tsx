'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { TIER_CONFIGS, type SubscriptionTier } from '@/lib/types';
import { useAuth } from '@/components/auth/auth-provider';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api';

const tiers: SubscriptionTier[] = ['free', 'basic', 'premium', 'business_starter', 'business_pro'];

const features = [
  { key: 'quotaMinutes', label: 'โควตานาที', render: (v: number) => `${v} นาที` },
  { key: 'maxVideoMinutes', label: 'ความยาวคลิปสูงสุด', render: (v: number) => v >= 999 ? 'ไม่จำกัด' : `${v} นาที` },
  { key: 'watermark', label: 'ลายน้ำ', render: (v: boolean) => v ? 'มีลายน้ำ' : 'ไม่มีลายน้ำ' },
  { key: 'aiVocabulary', label: 'AI Smart Vocabulary', render: (v: boolean) => v ? '✅' : '—' },
  { key: 'positionAdjust', label: 'ปรับตำแหน่งซับ', render: (v: boolean) => v ? '✅' : '—' },
  { key: 'textAnimation', label: 'Text Animation', render: (v: boolean) => v ? '✅' : '—' },
  { key: 'teamSeats', label: 'ที่นั่งทีม', render: (v: number) => v > 1 ? `${v} คน` : '1 คน' },
  { key: 'clientReview', label: 'Client Review Link', render: (v: boolean) => v ? '✅' : '—' },
  { key: 'invoiceDownload', label: 'ดาวน์โหลดใบกำกับภาษี', render: (v: boolean) => v ? '✅' : '—' },
];

export default function PricingPageWrapper() {
  return (
    <Suspense fallback={<PricingFallback />}>
      <PricingContent />
    </Suspense>
  );
}

function PricingFallback() {
  return (
    <>
      <Navbar />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center text-text-secondary">กำลังโหลด...</div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const { addToast } = useToast();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const checkoutCancelled = searchParams.get('checkout') === 'cancelled';

  const handleSubscribe = async (tier: SubscriptionTier) => {
    if (tier === 'free') {
      router.push(user ? '/dashboard' : '/signup');
      return;
    }

    if (!user) {
      addToast('กรุณาเข้าสู่ระบบก่อนสั่งซื้อ', 'warning');
      router.push('/login?redirect=/pricing');
      return;
    }

    setLoadingTier(tier);

    try {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });

      const data = await res.json();

      if (!res.ok) {
        addToast(data.error || 'เกิดข้อผิดพลาด', 'error');
        setLoadingTier(null);
        return;
      }

      if (data.devMode) {
        addToast(`✅ อัปเกรดเป็น ${TIER_CONFIGS[tier].name} (Dev Mode)`, 'success');
        await refreshProfile();
        router.push(data.url);
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      addToast('ไม่สามารถเชื่อมต่อ API ได้', 'error');
      console.error('[pricing] checkout error:', err);
    }
    setLoadingTier(null);
  };

  return (
    <>
      <Navbar />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {checkoutCancelled && (
            <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-warning text-center">
              ⚠️ การชำระเงินถูกยกเลิก หากมีปัญหากรุณาติดต่อเรา
            </div>
          )}

          <h1 className="text-3xl font-bold text-center mb-2">แพ็กเกจของ SubZeed</h1>
          <p className="text-text-secondary text-center mb-12 max-w-xl mx-auto">
            เลือกแพ็กเกจที่เหมาะกับคุณ จ่ายตามรอบ 30 วัน (Anniversary Billing)
            {user && profile && (
              <span className="block mt-2 text-sm">
                ปัจจุบัน: <strong>{TIER_CONFIGS[profile.tier].name}</strong> | 
                คงเหลือ {Math.max(0, profile.quota_minutes_total - profile.quota_minutes_used).toFixed(1)} / {profile.quota_minutes_total} นาที
              </span>
            )}
          </p>

          <div className="grid gap-6 lg:grid-cols-5 sm:grid-cols-2">
            {tiers.map((tier) => {
              const config = TIER_CONFIGS[tier];
              const isPopular = tier === 'premium';
              const isCurrentPlan = profile?.tier === tier;
              const isFree = tier === 'free';

              return (
                <div
                  key={tier}
                  className={`relative rounded-xl border bg-white p-6 flex flex-col ${
                    isPopular ? 'border-primary ring-2 ring-primary-light scale-105' : 'border-border'
                  } ${
                    isCurrentPlan ? 'ring-2 ring-success/30' : ''
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                      แนะนำ!
                    </span>
                  )}
                  {isCurrentPlan && (
                    <span className="absolute -top-3 right-3 bg-success text-white text-xs font-semibold px-3 py-1 rounded-full">
                      ปัจจุบัน
                    </span>
                  )}

                  <h3 className="text-lg font-bold">{config.name}</h3>
                  <div className="mt-3">
                    {isFree ? (
                      <span className="text-3xl font-bold">ฟรี</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">{config.price.toLocaleString()}</span>
                        <span className="text-text-secondary text-sm">.- / เดือน</span>
                      </>
                    )}
                  </div>

                  <ul className="mt-6 space-y-3 text-sm flex-1">
                    {features.map((f) => (
                      <li key={f.key} className="flex justify-between">
                        <span className="text-text-secondary">{f.label}</span>
                        <span className="font-medium">
                          {f.render(config[f.key as keyof typeof config] as never)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={isPopular ? 'primary' : 'outline'}
                    className="w-full mt-6"
                    onClick={() => handleSubscribe(tier)}
                    loading={loadingTier === tier}
                    disabled={isCurrentPlan && !isFree}
                  >
                    {isCurrentPlan ? 'แพ็กเกจปัจจุบัน' : isFree ? 'เริ่มใช้งานฟรี' : 'สมัครแพ็กเกจ'}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
