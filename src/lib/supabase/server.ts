import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const createServerSupabase = async () => {
  const cookieStore = await cookies();

  // ใช้ domain ตาม production environment (ถ้าเป็น localhost ไม่ต้อง set domain)
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const domain = isProd ? 'overconda.space' : undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        ...(domain ? { domain } : {}),
        path: '/',
        sameSite: 'lax' as const,
        secure: isProd,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
};
