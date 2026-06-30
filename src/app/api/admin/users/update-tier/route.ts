import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { verifyAdmin } from '@/lib/admin-auth';

/**
 * POST /api/admin/users/update-tier
 * อัปเดตแพ็กเกจผู้ใช้ (Admin only)
 *
 * รองรับ tier พิเศษ:
 * - unlimited: ใช้ได้ทุก feature ไม่จำกัด, ไม่หัก quota
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

    const validTiers = ['free', 'basic', 'premium', 'business_starter', 'business_pro', 'unlimited'];
    if (!validTiers.includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    // ─── คำนวณ quota ─────────────────────────────────
    let quotaMinutes: number;
    switch (tier) {
      case 'free': quotaMinutes = 20; break;
      case 'basic': quotaMinutes = 120; break;
      case 'premium': quotaMinutes = 300; break;
      case 'business_starter': quotaMinutes = 1200; break;
      case 'business_pro': quotaMinutes = 2500; break;
      case 'unlimited': quotaMinutes = 999999; break;
      default: quotaMinutes = 20;
    }

    // ─── Update ────────────────────────────────────────
    const updateData: Record<string, any> = {
      tier,
      quota_minutes_total: quotaMinutes,
      updated_at: new Date().toISOString(),
    };

    // ถ้าเป็น unlimited → รีเซ็ต quota_minutes_used เป็น 0
    if (tier === 'unlimited') {
      updateData.quota_minutes_used = 0;
    }

    const { error } = await adminSupabase
      .from('profiles')
      .update(updateData)
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
