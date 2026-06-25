import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

/**
 * GET /api/admin/site-config
 * ดึง site config ปัจจุบัน
 */
export async function GET() {
  try {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from('site_config')
      .select('config, updated_at')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('[admin/site-config] Fetch error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ config: data?.config || {}, updated_at: data?.updated_at });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/site-config
 * อัปเดต site config (Admin only)
 * Body: { config: Partial<SiteConfig> }
 */
export async function PUT(request: NextRequest) {
  try {
    // ─── Admin Auth Check ───────────────────────────────
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

    if (!profile || (profile.tier !== 'business_pro' && profile.email !== 'overconda@gmail.com')) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // ─── Validate + Merge config ─────────────────────────
    const body = await request.json();
    if (!body.config || typeof body.config !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid config' }, { status: 400 });
    }

    // ดึง config เก่ามา merge (ป้องกันหาย)
    const { data: existing } = await adminSupabase
      .from('site_config')
      .select('config')
      .eq('id', 1)
      .single();

    const mergedConfig = {
      ...(existing?.config || {}),
      ...body.config,
    };

    // Deep merge สำหรับ nested objects
    if (body.config.brand) mergedConfig.brand = { ...(existing?.config as any)?.brand, ...body.config.brand };
    if (body.config.theme) mergedConfig.theme = { ...(existing?.config as any)?.theme, ...body.config.theme };
    if (body.config.homepage) mergedConfig.homepage = { ...(existing?.config as any)?.homepage, ...body.config.homepage };
    if (body.config.footer) mergedConfig.footer = { ...(existing?.config as any)?.footer, ...body.config.footer };
    if (body.config.typography) mergedConfig.typography = { ...(existing?.config as any)?.typography, ...body.config.typography };
    if (body.config.misc) mergedConfig.misc = { ...(existing?.config as any)?.misc, ...body.config.misc };

    // ─── Save ─────────────────────────────────────────────
    const { error: updateError } = await adminSupabase
      .from('site_config')
      .update({
        config: mergedConfig,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (updateError) {
      console.error('[admin/site-config] Update error:', updateError);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, config: mergedConfig });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
