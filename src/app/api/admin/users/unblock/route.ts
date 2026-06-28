import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { verifyAdmin } from '@/lib/admin-auth';

/**
 * POST /api/admin/users/unblock
 * ปลดล็อกผู้ใช้ที่ถูกแปะว่า is_quota_abuser (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const adminSupabase = createServiceSupabase();
    

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
