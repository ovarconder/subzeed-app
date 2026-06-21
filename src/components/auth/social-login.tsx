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

    // หา base path เช่น /subzeed
    const basePath = window.location.pathname.replace(/\/login|\/signup|\/$/, '');
    const callbackPath = `${basePath}/api/auth/callback`;

    // ใช้ www.overconda.space เสมอ ป้องกัน state mismatch
    let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    if (baseUrl.includes('overconda.space') && !baseUrl.includes('www.')) {
      baseUrl = 'https://www.overconda.space';
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${baseUrl}${callbackPath}?redirect=${redirect}`,
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
