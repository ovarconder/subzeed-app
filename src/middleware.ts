import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ถ้าเป็น www.overconda.space → เปลี่ยน origin ให้ถูกต้อง
  // ถ้าไม่ได้อยู่ root path (เช่น /subzeed) ให้ใช้ basePath
  const host = request.headers.get('host') || '';
  const isWww = host.startsWith('www.');
  const basePath = pathname.startsWith('/subzeed') ? '/subzeed' : '';

  // Public routes that don't need auth
  const publicRoutes = [
    '/login',
    '/signup',
    '/pricing',
    '/privacy',
    '/terms',
    '/data-deletion',
    '/api/webhooks/stripe',
    '/api/create-checkout',
    '/api/auth/callback',
    '/api/admin/initialize',
    '/review',
    '/_next',
    '/favicon.ico',
  ];

  // เอา basePath ออกก่อนเช็ค public routes
  const relativePath = pathname.replace(basePath, '') || '/';

  const isPublicRoute = publicRoutes.some(
    (route) => relativePath === route || relativePath.startsWith(route + '/')
  );

  if (isPublicRoute || relativePath === '/') {
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // Supabase SSR Middleware Pattern:
  // 1. สร้าง response ก่อน (เพื่อใช้ใน setAll)
  // 2. update ทั้ง request.cookies และ response.cookies
  // 3. return response ที่อัปเดตแล้ว
  // ------------------------------------------------------------------
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // update request cookies (สำหรับอ่านใน request ถัดไป)
            request.cookies.set(name, value);
            // update response cookies (สำหรับส่งกลับไปให้ Browser)
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Redirect to login if not authenticated
  if (!session) {
    const loginUrl = new URL(`${basePath}/login`, request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
