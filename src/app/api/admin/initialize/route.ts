import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

/**
 * POST /api/admin/initialize
 *
 * ตั้งค่า Super Admin คนแรก (Email: overconda@gmail.com)
 * - set is_super_admin = true (ไม่เปลี่ยน tier)
 * - ปลอดภัย: ทำงานได้ครั้งเดียว
 *
 * เรียก: curl -X POST https://www.overconda.space/subzeed/api/admin/initialize
 */
export async function POST(_request: NextRequest) {
  const supabase = createServiceSupabase();
  const email = 'overconda@gmail.com';

  const { data: users, error: listError } = await supabase
    .from('profiles')
    .select('id, email, tier, is_super_admin')
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

  if (user.is_super_admin) {
    return NextResponse.json({
      message: `✅ ${email} เป็น Super Admin อยู่แล้ว`,
      user,
    });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      is_super_admin: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    console.error('[admin/initialize] Update error:', updateError);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `✅ ${email} ถูกตั้งค่าเป็น Super Admin เรียบร้อย (ยังคง tier: ${user.tier})`,
    is_super_admin: true,
    tier: user.tier,
  });
}
