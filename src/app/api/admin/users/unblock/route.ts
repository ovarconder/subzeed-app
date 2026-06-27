import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

/**
 * POST /api/admin/users/unblock
 * ปลดล็อกผู้ใช้ที่ถูกแปะว่า is_quota_abuser (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // ─── Auth check ───────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createServiceSupabase();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('tier, email, is_super_admin')
      .eq('id', session.user.id)
      .single();

    if (!profile || (profile.is_super_admin !== true && profile.email !== 'overconda@gmail.com')) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // ─── Unblock ───────────────────────────────────────
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const { error } = await adminSupabase
      .from('profiles')
      .update({
        is_quota_abuser: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[admin/unblock] Error:', error);
      return NextResponse.json({ error: 'Unblock failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
