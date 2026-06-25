import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

/**
 * GET /api/admin/users?abusers=true
 *
 * ดึงข้อมูลผู้ใช้ทั้งหมด (ต้องเป็น admin เท่านั้น)
 * ใช้ Service Role Key เพื่อ bypass RLS
 */
export async function GET(request: NextRequest) {
  try {
    // ─── ตรวจสอบสิทธิ์ Admin ───────────────────────────
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // เช็คว่าเป็น super admin
    const adminSupabase = createServiceSupabase();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('tier, email, is_super_admin')
      .eq('id', session.user.id)
      .single();

    if (!profile || (profile.is_super_admin !== true && profile.email !== 'overconda@gmail.com')) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // ─── ดึงข้อมูล ────────────────────────────────────
    const searchParams = request.nextUrl.searchParams;
    const onlyAbusers = searchParams.get('abusers') === 'true';

    let query = adminSupabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (onlyAbusers) {
      query = query.eq('is_quota_abuser', true);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('[admin/users] Query error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ users: users || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[admin/users] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

