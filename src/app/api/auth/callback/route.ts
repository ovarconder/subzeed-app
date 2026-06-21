import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /auth/callback
 *
 * Supabase OAuth callback — รับ redirect กลับจาก Google/Facebook
 * แลก code → session แล้ว redirect ไปหน้าที่ต้องการ
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin, pathname } = new URL(request.url);

  const code = searchParams.get('code');
  // redirect_to ส่งผ่าน queryParams ของ OAuth provider
  const redirectTo = searchParams.get('redirect_to');
  const next = searchParams.get('redirect') || redirectTo || '/dashboard';

  // base path: /subzeed หรือ / (ถ้า root)
  const basePath = pathname.replace(/\/api\/auth\/callback\/?$/, '');

  if (!code) {
    return NextResponse.redirect(`${origin}${basePath}/login?error=missing_code`);
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
          } catch { /* ignore */ }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}${basePath}/login?error=auth_failed`);
  }

  // ถ้า redirect path ขึ้นต้นด้วย /subzeed ให้ตัดออก (กันซ้ำ)
  const cleanNext = next.startsWith(basePath) ? next : `${basePath}${next}`;
  const forceUrl = searchParams.get('force_url');

  if (forceUrl) {
    return NextResponse.redirect(forceUrl);
  }

  return NextResponse.redirect(`${origin}${cleanNext}`);
}
