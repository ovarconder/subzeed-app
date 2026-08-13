import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const createServerSupabase = async () => {
  const cookieStore = await cookies();

  // ⭐ domain จริงของแอป — derive จาก NEXT_PUBLIC_SITE_URL (ถ้าเป็นโดเมนจริง)
  //    ตัด www. → ใช้ root domain ทำให้ cookie ใช้ได้ทั้ง root + www
  //    localhost / ไม่ได้ตั้ง → ไม่ set domain (ปล่อย default)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  let domain: string | undefined;
  try {
    const host = siteUrl ? new URL(siteUrl).hostname : '';
    const isLocal = !host || host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) {
      domain = host.startsWith('www.') ? host.slice(4) : host;
    }
  } catch {
    domain = undefined;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        ...(domain ? { domain } : {}),
        path: '/',
        sameSite: 'lax' as const,
        secure: !!domain, // เมื่อเป็นโดเมนจริง → secure
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

// ─── Service Role (ฝั่ง Server เท่านั้น ห้ามใช้ใน client) ─────
export const createServiceSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};