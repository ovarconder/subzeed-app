import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { verifyAdmin } from '@/lib/admin-auth';

/**
 * GET /api/admin/fingerprints
 *
 * ดึงประวัติ Browser Fingerprint ทั้งหมด (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const adminSupabase = createServiceSupabase();
    

    // ─── Fetch fingerprint history ────────────────────
    const { data: records, error } = await adminSupabase
      .from('fingerprint_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[admin/fingerprints] Query error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ records: records || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[admin/fingerprints] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

