// src/app/api/auth/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.overconda.space').replace(/\/+$/, '');
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '/subzeed').replace(/\/+$/, '');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirect_to');
  let next = searchParams.get('redirect') || redirectTo || '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${SITE_ORIGIN}${BASE_PATH}/login?error=missing_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: 'overconda.space',
        path: BASE_PATH,
        sameSite: 'lax' as const,
        secure: true,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, path: BASE_PATH })
            );
          } catch {
            // Server Component context — ignore
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${SITE_ORIGIN}${BASE_PATH}/login?error=auth_failed`);
  }

  // ─── บังคับตรวจสิทธิ์ฝั่ง Server ทันทีหลังยืนยันตัวตนสำเร็จ ───
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', user.id)
        .single();

      // ถ้าในฐานข้อมูลเป็นแอดมิน หรือใช้อีเมลแอดมินหลัก ให้เปลี่ยนจุดหมายปลายทางไปที่หน้าแอดมินโดยตรง
      if (profile?.is_super_admin || user.email === 'overconda@gmail.com') {
        next = '/admin?tab=settings';
      }
    }
  } catch (err) {
    console.error('[auth/callback] Admin checking error:', err);
  }

  const cleanNext = next.startsWith(BASE_PATH) ? next.slice(BASE_PATH.length) : next;
  const finalPath = cleanNext.startsWith('/') ? cleanNext : `/${cleanNext}`;

  return NextResponse.redirect(`${SITE_ORIGIN}${BASE_PATH}${finalPath}`);
}