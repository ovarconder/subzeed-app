import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * POST /api/fingerprint/check
 *
 * ตรวจสอบ Browser Fingerprint ก่อนให้สิทธิ์โควตาฟรี
 * ถ้าเจอว่า fingerprint นี้เคยถูกใช้กับบัญชีอื่นไปแล้ว
 * จะบล็อกและคืน isAbuser = true
 *
 * Body:
 * {
 *   "fingerprint": "abc123...",   // visitorId จาก FingerprintJS
 *   "email": "user@example.com",   // email ที่กำลังจะสมัคร
 *   "action": "signup"             // 'signup' | 'quota_claim'
 * }
 *
 * Response:
 * {
 *   "isAbuser": false,
 *   "existingAccounts": 0,
 *   "message": "OK",
 *   "blocked": false
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { fingerprint, email, action = 'signup' } = await request.json();

    // === Validation ===
    if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.length < 10) {
      return NextResponse.json(
        { error: 'Invalid fingerprint' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Invalid email' },
        { status: 400 }
      );
    }

    // === IP Address (for audit log) ===
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // === Supabase Admin Client (Service Role) ===
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!serviceRoleKey) {
      console.warn('[fingerprint-check] SUPABASE_SERVICE_ROLE_KEY not set — skipping abuse check');
      return NextResponse.json({
        isAbuser: false,
        existingAccounts: 0,
        message: 'SKIP: service role not configured',
        blocked: false,
      });
    }

    // Dynamic import to avoid bundling on client
    const { createClient } = await import('@supabase/supabase-js');
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // === 1. ตรวจสอบ fingerprint ในประวัติ ===
    const { data: history, error: historyError } = await adminSupabase
      .from('fingerprint_history')
      .select('id, user_id, email, action, blocked, created_at')
      .eq('fingerprint', fingerprint)
      .eq('blocked', false)
      .order('created_at', { ascending: false });

    if (historyError) {
      console.error('[fingerprint-check] Query error:', historyError);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    const existingAccounts = history?.length || 0;

    // === 2. ถ้าเคยมี record มาก่อน → ถือว่าเป็น abuser ===
    if (existingAccounts > 0) {
      // Log abuse attempt
      console.warn(
        `[fingerprint-check] ABUSE DETECTED: fingerprint=${fingerprint}, ` +
        `email=${email}, existing=${existingAccounts}`
      );

      // ถ้ามี user id session ให้ mark เป็น abuser ด้วย
      const cookieStore = await cookies();
      const supabase = createServerClient(
        supabaseUrl,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll() {},
          },
        }
      );
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user?.id) {
        await adminSupabase
          .from('profiles')
          .update({
            is_quota_abuser: true,
            quota_minutes_total: 0,
            quota_minutes_used: 0,
          })
          .eq('id', session.user.id);
      }

      // บันทึก attempt นี้
      await adminSupabase.from('fingerprint_history').insert({
        fingerprint,
        user_id: session?.user?.id || '00000000-0000-0000-0000-000000000000',
        email,
        action: action || 'quota_claim',
        ip_address: ip,
        blocked: true,
      });

      return NextResponse.json({
        isAbuser: true,
        existingAccounts,
        message: `ตรวจพบการสมัครซ้ำ: เคยใช้โควตาฟรีไปแล้ว ${existingAccounts} ครั้ง`,
        blocked: true,
      });
    }

    // === 3. ปกติ — บันทึก fingerprint ใหม่ ===
    // (จะบันทึกอีกครั้งหลัง signup จริงในขั้นตอน register)
    return NextResponse.json({
      isAbuser: false,
      existingAccounts: 0,
      message: 'OK',
      blocked: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[fingerprint-check] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
