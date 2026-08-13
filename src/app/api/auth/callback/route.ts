// src/app/api/auth/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ⭐ domain จริงของแอปได้มาจาก request เอง (dynamic) ไม่ hardcode
//    รองรับทั้ง subzeed.com, www.subzeed.com, localhost โดยไม่ต้อง set env
const BASE_PATH = ''; // app อยู่ที่ root (basePath ไม่ได้ enable)

// domain สำหรับ cookie: ตัด subdomain www. ออก เหลือ root domain
// (เช่น www.subzeed.com → .subzeed.com) เพื่อให้ใช้ได้ทั้ง root + www
function cookieDomain(hostname: string): string | undefined {
  // localhost/IP → ไม่ต้อง set domain (javascript cookie ปกติ)
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return undefined;
  }
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirect_to');
  let next = searchParams.get('redirect') || redirectTo || '/dashboard';

  // ⭐ ใช้ origin จริงที่ OAuth กลับเข้ามา (https://www.subzeed.com, http://localhost:3000 ฯลฯ)
  const origin = request.nextUrl.origin;
  const host = request.nextUrl.hostname || '';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: cookieDomain(host),
        path: BASE_PATH || '/',
        sameSite: 'lax' as const,
        secure: request.nextUrl.protocol === 'https:',
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, path: BASE_PATH || '/' })
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
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // ─── บังคับตรวจสิทธิ์ฝั่ง Server ทันทีหลังยืนยันตัวตนสำเร็จ ───-
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

  // ⭐ BASE_PATH เป็น '' (root) → ไม่ต้องตัด prefix; ปรับ path ให้ขึ้นต้นด้วย / เสมอ
  const cleanNext = next.startsWith('/') ? next : `/${next}`;

  return NextResponse.redirect(`${origin}${cleanNext}`);
}