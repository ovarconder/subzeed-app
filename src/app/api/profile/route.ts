import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

/**
 * GET /api/profile
 * ดึง profile ของ user ปัจจุบัน (ใช้ service role bypass RLS)
 *
 * Headers:
 *   - Cookie: session cookie (จาก request ปกติ)
 *     หรือ
 *   - x-user-id: user ID (fallback สำหรับ client-side fetch ที่ไม่มี cookie)
 */
export async function GET(request: NextRequest) {
  try {
    // 1. พยายาม get user จาก session cookie ก่อน
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    let userId: string | null = null;

    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      // Fallback: ใช้ x-user-id header (สำหรับการเรียกจาก client-side)
      userId = request.headers.get('x-user-id');
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. ใช้ service role bypass RLS
    const serviceSupabase = createServiceSupabase();
    const { data: profile, error } = await serviceSupabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('[api/profile] Error:', error);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[api/profile] Unhandled:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
