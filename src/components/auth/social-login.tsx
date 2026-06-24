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


  // code from Claude
  const handleSocialLogin = async (provider: Provider) => {
    setLoading(provider);

    const redirect = searchParams.get('redirect') || '/dashboard';

    // ใช้ window.location.origin (domain จริงที่ browser เห็น)
    // ใช้ window.location.pathname หา basePath แบบ dynamic ไม่ต้อง hardcode
    const origin = window.location.origin;
    const pathParts = window.location.pathname.split('/');
    // /subzeed/login → ['', 'subzeed', 'login'] → basePath = '/subzeed'
    // /login         → ['', 'login']            → basePath = ''
    const basePath = pathParts.length > 2 && pathParts[1] !== 'login' && pathParts[1] !== 'dashboard'
      ? `/${pathParts[1]}`
      : '';

    const redirectTo = `${origin}${basePath}/api/auth/callback`;

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

