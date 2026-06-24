// route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * SITE_ORIGIN = origin เท่านั้น ไม่มี path ต่อท้าย
 * basePath จะถูก derive จาก pathname ของ request เอง
 */
const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.overconda.space').replace(/\/+$/, '');

export async function GET(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url);

  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirect_to');
  const next = searchParams.get('redirect') || redirectTo || '/dashboard';

  // derive basePath จาก pathname จริง
  // pathname = /subzeed/api/auth/callback → basePath = /subzeed
  // pathname = /api/auth/callback         → basePath = ""
  const basePath = pathname.replace(/\/api\/auth\/callback\/?$/, '');

  if (!code) {
    return NextResponse.redirect(`${SITE_ORIGIN}${basePath}/login?error=missing_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* Server Component context */ }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${SITE_ORIGIN}${basePath}/login?error=auth_failed`);
  }

  // สร้าง redirect path โดยไม่ให้ basePath ซ้ำกัน
  // next อาจมาเป็น "/dashboard" หรือ "/subzeed/dashboard" ก็ได้
  const nextWithoutBase = next.startsWith(basePath)
    ? next.slice(basePath.length)
    : next;
  // normalize ให้ขึ้นต้นด้วย /
  const cleanNext = nextWithoutBase.startsWith('/') ? nextWithoutBase : `/${nextWithoutBase}`;

  return NextResponse.redirect(`${SITE_ORIGIN}${basePath}${cleanNext}`);
}