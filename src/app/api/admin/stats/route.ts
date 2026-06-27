import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

/**
 * GET /api/admin/stats
 *
 * ดึงสถิติภาพรวม (Admin only)
 * - จำนวนผู้ใช้ทั้งหมด
 * - ผู้ใช้ออนไลน์วันนี้
 * - รายได้รวม
 *
 * ใช้ Service Role เพื่อ bypass RLS
 * ไม่พึ่ง RPC get_admin_stats (เผื่อยังไม่มีใน DB)
 */
export async function GET() {
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

    // ─── Stats ─────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];

    const [{ count: totalUsers }, { count: activeToday }, { data: revenueData }] = await Promise.all([
      adminSupabase
        .from('profiles')
        .select('*', { count: 'exact', head: true }),
      adminSupabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
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
