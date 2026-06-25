import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier } from '@/lib/types';

/**
 * POST /api/admin/update-tier
 *
 * Admin อัปเดต Tier และโควตาของผู้ใช้
 * Body: { userId: string, tier: SubscriptionTier }
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
      .select('tier, email')
      .eq('id', session.user.id)
      .single();

    if (!profile || (profile.tier !== 'business_pro' && profile.email !== 'overconda@gmail.com')) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // ─── Validate body ────────────────────────────────
    const { userId, tier } = await request.json();

    if (!userId || !tier) {
      return NextResponse.json({ error: 'Missing userId or tier' }, { status: 400 });
    }

    const validTiers: SubscriptionTier[] = ['free', 'basic', 'premium', 'business_starter', 'business_pro'];
    if (!validTiers.includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    const tierConfig = TIER_CONFIGS[tier as SubscriptionTier];

    // ─── อัปเดต ────────────────────────────────────────
    const now = new Date();
    const cycleEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { error } = await adminSupabase
      .from('profiles')
      .update({
        tier,
        quota_minutes_total: tierConfig.quotaMinutes,
        quota_minutes_used: 0,
        billing_cycle_start: now.toISOString(),
        billing_cycle_end: cycleEnd.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[admin/update-tier] Update error:', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    // ─── Log to billing history ────────────────────────
    await adminSupabase.from('billing_history').insert({
      user_id: userId,
      action_type: 'subscribe',
      previous_tier: profile.tier,
      new_tier: tier,
      amount_thb: tierConfig.price,
      billing_cycle_start: now.toISOString(),
      billing_cycle_end: cycleEnd.toISOString(),
      payment_status: 'admin_adjustment',
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[admin/update-tier] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

