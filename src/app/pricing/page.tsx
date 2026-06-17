'use client';

import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { TIER_CONFIGS, type SubscriptionTier } from '@/lib/types';
import Link from 'next/link';

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

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold text-center mb-2">แพ็กเกจของ SubZeed</h1>
          <p className="text-text-secondary text-center mb-12 max-w-xl mx-auto">
            เลือกแพ็กเกจที่เหมาะกับคุณ จ่ายตามรอบ 30 วัน (Anniversary Billing)
          </p>

          <div className="grid gap-6 lg:grid-cols-5 sm:grid-cols-2">
            {tiers.map((tier) => {
              const config = TIER_CONFIGS[tier];
              const isPopular = tier === 'premium';
              return (
                <div
                  key={tier}
                  className={`relative rounded-xl border bg-white p-6 flex flex-col ${
                    isPopular ? 'border-primary ring-2 ring-primary-light scale-105' : 'border-border'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                      แนะนำ!
                    </span>
                  )}
                  <h3 className="text-lg font-bold">{config.name}</h3>
                  <div className="mt-3">
                    <span className="text-3xl font-bold">{config.price.toLocaleString()}</span>
                    <span className="text-text-secondary text-sm">.- / เดือน</span>
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

                  <Link href={tier === 'free' ? '/signup' : '/signup'} className="mt-6 block">
                    <Button variant={isPopular ? 'primary' : 'outline'} className="w-full">
                      {tier === 'free' ? 'เริ่มใช้งานฟรี' : 'สมัครแพ็กเกจ'}
                    </Button>
                  </Link>
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
