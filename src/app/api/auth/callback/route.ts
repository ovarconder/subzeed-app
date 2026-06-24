import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /auth/callback
 *
 * Supabase OAuth callback — รับ redirect กลับจาก Google/Facebook
 * แลก code → session แล้ว redirect ไปหน้าที่ต้องการ
 *
 * สำคัญ: SITE_ORIGIN ต้องตรงกับที่ browser เรียก callback นี้
 * เพราะ cookie Supabase Auth จะถูก set สำหรับ domain นั้น
 * ถ้า SITE_ORIGIN ไม่ตรงกับ browser URL → cookie หลุดโดเมน
 *
 * วิธีหา SITE_ORIGIN: ใช้ host headers จาก request ที่เรียก callback นี้
 * (ไม่ใช่ NEXT_PUBLIC_SITE_URL เพราะอาจต่างกันเรื่อง www/no-www)
 */
export async function GET(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url);

  const code = searchParams.get('code');
  // redirect_to ส่งผ่าน queryParams ของ OAuth provider
  const redirectTo = searchParams.get('redirect_to');
  const next = searchParams.get('redirect') || redirectTo || '/dashboard';

  // base path: /subzeed หรือ / (ถ้า root)
  const basePath = pathname.replace(/\/api\/auth\/callback\/?$/, '');

  // === ดึง Origin จาก request headers ===
  // ใช้ x-forwarded-proto + host เพื่อให้ตรงกับ domain ที่ browser เรียก
  // (สำคัญ: cookie ต้องตรง domain กับ browser URL)
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'overconda.space';
  const origin = `${proto}://${host}`;

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
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${origin}${basePath}/login?error=auth_failed`);
  }

  // ถ้า redirect path ขึ้นต้นด้วย /subzeed ให้ตัดออก (กันซ้ำ)
  const cleanNext = next.startsWith(basePath) ? next : `${basePath}${next}`;

  return NextResponse.redirect(`${origin}${cleanNext}`);
}
