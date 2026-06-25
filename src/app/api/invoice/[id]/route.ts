import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier } from '@/lib/types';

/**
 * GET /api/invoice/[id]
 *
 * ดึงข้อมูลสำหรับสร้างใบเสร็จ PDF
 * รับ参数 billing id → คืน JSON profile + billing data
 *
 * การทำงาน: ฝั่ง Client จะ fetch ข้อมูลนี้แล้วใช้ jspdf สร้าง PDF
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ─── Auth check ───────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // ─── ดึง billing record ───────────────────────────
    const adminSupabase = createServiceSupabase();
    const { data: billing, error: billingError } = await adminSupabase
      .from('billing_history')
      .select('*')
      .eq('id', id)
      .single();

    if (billingError || !billing) {
      return NextResponse.json({ error: 'Billing record not found' }, { status: 404 });
    }

    // ─── ตรวจสอบสิทธิ์: ต้องเป็นเจ้าของหรือ admin ──────
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('tier, email, is_super_admin')
      .eq('id', userId)
      .single();

    const isOwner = billing.user_id === userId;
    const isAdmin = profile?.is_super_admin === true;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ─── ดึง profile ของเจ้าของบิล ─────────────────────
    const { data: ownerProfile } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', billing.user_id)
      .single();

    if (!ownerProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // ─── ข้อมูลบริษัท ─────────────────────────────────
    const companyInfo = {
      name: 'บริษัท ซับซี๊ด จำกัด',
      address: 'เลขที่ 123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
      taxId: '0123456789012',
      phone: '02-123-4567',
      email: 'billing@subzeed.com',
    };

    return NextResponse.json({
      profile: ownerProfile,
      billing,
      companyInfo,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[api/invoice] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
