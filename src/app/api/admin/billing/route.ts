import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { verifyAdmin } from '@/lib/admin-auth';

/**
 * GET /api/admin/billing
 *
 * ดึงประวัติธุรกรรมทั้งหมด (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const adminSupabase = createServiceSupabase();
    

    // ─── Fetch billing history ────────────────────────
    const { data: history, error } = await adminSupabase
      .from('billing_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[admin/billing] Query error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ history: history || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[admin/billing] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

