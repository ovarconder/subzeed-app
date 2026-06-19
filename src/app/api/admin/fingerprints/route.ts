import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

/**
 * GET /api/admin/fingerprints
 *
 * ดึงประวัติ Browser Fingerprint ทั้งหมด (Admin only)
 */
export async function GET(request: NextRequest) {
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
      .select('tier, email')
      .eq('id', session.user.id)
      .single();

    if (!profile || (profile.tier !== 'business_pro' && profile.email !== 'admin@subzeed.com')) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

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
