'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';

type Provider = 'google' | 'facebook';

const providerConfig: Record<Provider, { label: string; icon: string; color: string }> = {
  google: {
    label: 'Google',
    icon: 'G',
    color: 'bg-white border-border text-text hover:bg-surface',
  },
  facebook: {
    label: 'Facebook',
    icon: 'f',
    color: 'bg-[#1877F2] text-white hover:bg-[#166fe5]',
  },
};

export function SocialLogin() {
  const [loading, setLoading] = useState<Provider | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { addToast } = useToast();

  const handleSocialLogin = async (provider: Provider) => {
    setLoading(provider);

    const redirect = searchParams.get('redirect') || '/dashboard';

    // === redirectTo: URL ที่ Supabase จะ redirect กลับมาหลังจาก authenticate สำเร็จ ===
    // จริง ๆ แล้ว redirect_uri (ที่ Google ใช้) กับ redirectTo นี้เป็นคนละค่ากัน
    // redirect_uri = Supabase hosted callback (supabase.co/auth/v1/callback)
    // redirectTo = URL ที่ Supabase จะ redirect user กลับมาหลังจากแลก code→session สำเร็จ
    //
    // flow: Google → supabase.co/auth/v1/callback → (แลก code) → redirectTo → app เรา
    //
    // แต่เพราะ app เราใช้ basePath: "/subzeed" และ deploy ภายใต้ Vercel project แยก
    // callback route ของเราคือ /subzeed/api/auth/callback
    // แต่ถ้าใช้ hosted callback Supabase จะ redirect กลับมาที่ /api/auth/callback โดยไม่สน basePath
    //
    // ทางออก: ใช้ PKCE flow ที่ Supabase redirect กลับมาที่ callback route ของเราโดยตรง
    // redirectTo = https://overconda.space/subzeed/api/auth/callback
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectTo = `${siteUrl}/subzeed/api/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          redirect_to: redirect,
        },
      },
    });

    if (error) {
      addToast(`เข้าสู่ระบบด้วย ${provider} ล้มเหลว: ${error.message}`, 'error');
      setLoading(null);
    }
    // ถ้าสำเร็จ browser จะ redirect ไปหน้า OAuth provider
  };

  return (
    <div className="flex flex-col gap-3">
      {(Object.keys(providerConfig) as Provider[]).map((provider) => {
        const cfg = providerConfig[provider];
        return (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className={`w-full ${cfg.color}`}
            onClick={() => handleSocialLogin(provider)}
            loading={loading === provider}
          >
            <span className="font-bold mr-2">{cfg.icon}</span>
            เข้าสู่ระบบด้วย {cfg.label}
          </Button>
        );
      })}
    </div>
  );
}
