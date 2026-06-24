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





    // === redirectTo: URL ที่ Supabase จะ redirect กลับมาหลังจาก hosted callback แลก session สำเร็จ ===
    //

    // flow: Google → supabase.co/auth/v1/callback → (แลก code → session) → redirectTo → app
    //









    // callback route จริงของ app นี้คือ https://www.overconda.space/subzeed/api/auth/callback
    // (เว็บหลักมี www. เสมอ)
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin)




      .replace(/\/+$/, '');          // ตัด trailing slash เท่านั้น
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

