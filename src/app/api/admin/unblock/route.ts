import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier } from '@/lib/types';

/**
 * POST /api/admin/unblock
 *
 * Admin ปลดล็อกผู้ใช้ที่โดนแปะ is_quota_abuser
 * รีเซ็ตโควตาคืนตาม Tier ปัจจุบัน
 *
 * Body: { userId: string }
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

    // ─── Validate ─────────────────────────────────────
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // ─── ดึงข้อมูลผู้ใช้ก่อนปลดล็อก ───────────────────
    const { data: targetUser, error: fetchError } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const tierConfig = TIER_CONFIGS[targetUser.tier as SubscriptionTier];
    const now = new Date();
    const cycleEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // ─── ปลดล็อก + รีเซ็ตโควตา ────────────────────────
    const { error: updateError } = await adminSupabase
      .from('profiles')
      .update({
        is_quota_abuser: false,
        quota_minutes_total: tierConfig.quotaMinutes,
        quota_minutes_used: 0,
        billing_cycle_start: now.toISOString(),
        billing_cycle_end: cycleEnd.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[admin/unblock] Update error:', updateError);
      return NextResponse.json({ error: 'Unblock failed' }, { status: 500 });
    }

    // ─── อัปเดต fingerprint history ───────────────────
    await adminSupabase
      .from('fingerprint_history')
      .update({ blocked: false })
      .eq('user_id', userId);

    // ─── Log ──────────────────────────────────────────
    await adminSupabase.from('quota_activity_logs').insert({
      user_id: userId,
      log_type: 'admin_adjustment',
      minutes_changed: tierConfig.quotaMinutes,
      quota_minutes_used_snapshot: 0,
      description: '✅ ปลดล็อกโดย Admin — รีเซ็ตโควตา',
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[admin/unblock] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

