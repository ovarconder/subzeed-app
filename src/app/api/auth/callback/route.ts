/**
 * GET /auth/callback
 *
 * Supabase OAuth callback — รับ redirect กลับจาก Google/Facebook
 * แลก code → session แล้ว redirect ไปหน้าที่ต้องการ
 *
 * ─── เรื่อง Origin และ Cookie ──────────────────────────────
 * cookie Supabase Auth จะถูก set สำหรับ domain ที่ request นี้ถูกเรียก
 * ต้องแน่ใจว่า origin ที่ redirect ไปกลับ ตรงกับ domain ที่ browser เรียก
 * และตรงกับ domain ที่ cookie ถูก set
 *
 * IMPORTANT: ใช้ NEXT_PUBLIC_SITE_URL จาก env เป็นหลัก (ไม่ใช้ host header)
 * เพราะ:
 *   - host header อาจเป็น subzeed-app.vercel.app (Vercel internal routing)
 *   - แต่ user จริงเรียกผ่าน overconda.space
 *   - cookie ต้องตรงกับ domain จริงที่ browser ใช้
 *
 * NEXT_PUBLIC_SITE_URL = https://overconda.space (ไม่มี www, ไม่มี trailing slash)
 * redirector = SITE_ORIGIN + basePath + nextPath
 *   = https://overconda.space + /subzeed + /dashboard
 *   = https://overconda.space/subzeed/dashboard
 */
const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://overconda.space').replace(/\/+$/, '');

export async function GET(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url);

  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirect_to');
  const next = searchParams.get('redirect') || redirectTo || '/dashboard';

  // base path: /subzeed หรือ / (ถ้า root)
  const basePath = pathname.replace(/\/api\/auth\/callback\/?$/, '');

  // === หา origin จริงจาก request headers ===
  // cookie ถูก set โดย Supabase ตาม host header ที่ callback นี้เรียก
  // ดังนั้นต้อง redirect กลับไปที่ host เดียวกันเท่านั้น
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'overconda.space';
  const origin = `${proto}://${host}`;

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
          } catch { /* ignore */ }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${SITE_ORIGIN}${basePath}/login?error=auth_failed`);
  }

  // ถ้า redirect path ขึ้นต้นด้วย /subzeed ให้ตัดออก (กันซ้ำ)
  const cleanNext = next.startsWith(basePath) ? next : `${basePath}${next}`;

  return NextResponse.redirect(`${SITE_ORIGIN}${cleanNext}`);
}

