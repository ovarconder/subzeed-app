import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/fingerprint/register
 *
 * บันทึก Browser Fingerprint หลังจากสมัครสมาชิกสำเร็จ
 * เรียก API นี้หลัง auth.signUp() เสร็จ
 *
 * Body:
 * {
 *   "fingerprint": "abc123...",
 *   "email": "user@example.com",
 *   "userId": "uuid-from-supabase-auth"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { fingerprint, email, userId } = await request.json();

    if (!fingerprint || !email || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role not configured' },
        { status: 500 }
      );
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. อัปเดต fingerprint ใน profiles
    await adminSupabase
      .from('profiles')
      .update({ browser_fingerprint: fingerprint })
      .eq('id', userId);

    // 2. บันทึก history
    await adminSupabase.from('fingerprint_history').insert({
      fingerprint,
      user_id: userId,
      email,
      action: 'signup',
      ip_address:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        'unknown',
      blocked: false,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[fingerprint-register] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
