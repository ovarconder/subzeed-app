/**
 * GET /api/admin/stats
 *
 * ดึงสถิติภาพรวม (Admin only)
 * - totalUsers: จำนวนผู้ใช้ทั้งหมด
 * - todayUsers: ผู้ใช้ที่สมัครวันนี้
 * - activeNow: ผู้ใช้ที่ active ใน 5 นาทีล่าสุด
 * - totalRevenue: รายได้รวม
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
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const [{ count: totalUsers }, { count: todayUsers }, { count: activeNow }, { data: revenueData }] = await Promise.all([
      // นับผู้ใช้ทั้งหมด — ใช้ head: true (ไม่ต้องโหลด rows)
      adminSupabase
        .from('profiles')
        .select('id', { count: 'exact', head: true }),
      // นับผู้ใช้ที่สมัครวันนี้ (created_at >= วันนี้)
      adminSupabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', today),
      // นับผู้ใช้ที่ active ใน 5 นาทีล่าสุด (updated_at)
      adminSupabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', fiveMinAgo),
      // รวมรายได้
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
      todayUsers: todayUsers ?? 0,
      activeNow: activeNow ?? 0,
      totalRevenue: totalRevenue ?? 0,
    });
