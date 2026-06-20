import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS } from '@/lib/types';

/**
 * POST /api/admin/initialize
 *
 * ตั้งค่า Admin คนแรก (Email: overconda@gmail.com)
 * - อัปเกรด Tier → business_pro
 * - โควตา 2500 นาที (สูงสุด)
 * - ปลอดภัย: ทำงานได้ครั้งเดียว
 *
 * เรียกจาก Terminal: curl -X POST http://localhost:3000/api/admin/initialize
 */
export async function POST(_request: NextRequest) {
  const supabase = createServiceSupabase();
  const email = 'overconda@gmail.com';

  // ─── หา user จาก email ─────────────────────────────
  const { data: users, error: listError } = await supabase
    .from('profiles')
    .select('id, email, tier')
    .eq('email', email);

  if (listError) {
    console.error('[admin/initialize] Error finding user:', listError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!users || users.length === 0) {
    return NextResponse.json({
      error: `ไม่พบผู้ใช้ "${email}" — กรุณาสมัครสมาชิกก่อน แล้วเรียก API นี้อีกครั้ง`,
      hint: 'ไปที่ /signup สมัครด้วยอีเมลนี้ก่อน แล้วกด API นี้อีกครั้ง'
    }, { status: 404 });
  }

  const user = users[0];

  // ป้องกันการเรียกซ้ำ
  if (user.tier === 'business_pro') {
    return NextResponse.json({
      message: `✅ ${email} เป็น Admin อยู่แล้ว`,
      user,
    });
  }

  // ─── อัปเดตเป็น Admin ──────────────────────────────
  const tierConfig = TIER_CONFIGS.business_pro;
  const now = new Date();
  const cycleEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      tier: 'business_pro',
      quota_minutes_total: tierConfig.quotaMinutes,
      quota_minutes_used: 0,
      billing_cycle_start: now.toISOString(),
      billing_cycle_end: cycleEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    console.error('[admin/initialize] Update error:', updateError);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  // ─── Log ────────────────────────────────────────────
  await supabase.from('billing_history').insert({
    user_id: user.id,
    action_type: 'subscribe',
    previous_tier: user.tier || 'free',
    new_tier: 'business_pro',
    amount_thb: tierConfig.price,
    billing_cycle_start: now.toISOString(),
    billing_cycle_end: cycleEnd.toISOString(),
    payment_status: 'admin_adjustment',
  });

  return NextResponse.json({
    success: true,
    message: `✅ ${email} ถูกตั้งค่าเป็น Admin (business_pro) เรียบร้อย`,
    tier: 'business_pro',
    quotaMinutes: tierConfig.quotaMinutes,
  });
}
