import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { verifyAdmin } from '@/lib/admin-auth';

/**
 * GET /api/admin/stats
 *
 * ดึงสถิติภาพรวม (Admin only)
 * - จำนวนผู้ใช้ทั้งหมด
 * - ผู้ใช้ออนไลน์วันนี้
 * - รายได้รวม
 *
 * ใช้ Service Role เพื่อ bypass RLS
 * รับ x-user-id จาก header แทน getSession (Next.js 16 Route Handler)
 */
export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const adminSupabase = createServiceSupabase();
    

    // ─── Stats ─────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];

    // head: true → ไม่ return rows → count = 0 เสมอ ต้องใช้ head: false
    const [{ count: totalUsers }, { count: activeToday }, { data: revenueData }] = await Promise.all([
      adminSupabase
        .from('profiles')
        .select('id', { count: 'exact', head: true }),
      adminSupabase
        .from('profiles')
        .select('*', { count: 'exact', head: false })
        .gte('updated_at', today),
      adminSupabase
        .from('billing_history')
        .select('amount_thb')
        .eq('payment_status', 'success'),
    ]);

    const totalRevenue = (revenueData || []).reduce(
      (sum: number, r: { amount_thb: number }) => sum + (r.amount_thb || 0),
      0
    );

    return NextResponse.json({
      totalUsers: totalUsers ?? 0,
      activeToday: activeToday ?? 0,
      totalRevenue: totalRevenue ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[admin/stats] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

