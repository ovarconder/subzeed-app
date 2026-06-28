import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { verifyAdmin } from '@/lib/admin-auth';

/**
 * POST /api/admin/users/update-tier
 * อัปเดตแพ็กเกจผู้ใช้ (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const adminSupabase = createServiceSupabase();
    

    // ─── Validate ─────────────────────────────────────
    const { userId, tier } = await request.json();
    if (!userId || !tier) {
      return NextResponse.json({ error: 'Missing userId or tier' }, { status: 400 });
    }

    const validTiers = ['free', 'basic', 'premium', 'business_starter', 'business_pro'];
    if (!validTiers.includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    // ─── Update ────────────────────────────────────────
    const { error } = await adminSupabase
      .from('profiles')
      .update({
        tier,
        quota_minutes_total: tier === 'free' ? 20 : tier === 'basic' ? 120 : tier === 'premium' ? 300 : tier === 'business_starter' ? 1200 : 2500,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[admin/update-tier] Error:', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
