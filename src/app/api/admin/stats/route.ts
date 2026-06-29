import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { verifyAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const adminSupabase = createServiceSupabase();

    const today = new Date().toISOString().split('T')[0];
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const [
      { count: totalUsers, error: e1 },
      { count: todayUsers, error: e2 },
      { count: activeNow, error: e3 },
      { data: revenueData, error: e4 },
    ] = await Promise.all([
      // ✅ head: true = COUNT only, ไม่ดึง rows
      adminSupabase
        .from('profiles')
        .select('*', { count: 'exact', head: true }),

      adminSupabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today),

      adminSupabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', fiveMinAgo),

      adminSupabase
        .from('billing_history')
        .select('amount_thb')
        .eq('payment_status', 'success'),
    ]);

    // log เพื่อ debug (ลบออกได้ทีหลัง)
    if (e1 || e2 || e3 || e4) {
      console.error('[admin/stats] Query errors:', { e1, e2, e3, e4 });
    }

    const totalRevenue = (revenueData || []).reduce(
      (sum: number, r: { amount_thb: number }) => sum + (r.amount_thb || 0),
      0
    );

    return NextResponse.json({
      totalUsers: totalUsers ?? 0,
      todayUsers: todayUsers ?? 0,
      activeNow: activeNow ?? 0,
      totalRevenue,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[admin/stats] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}