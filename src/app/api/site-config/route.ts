// src/app/api/site-config/route.ts

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

/**
 * GET /api/site-config
 * ดึง site config สำหรับ client-side ใช้ (ไม่ต้อง Auth)
 * ใช้ service role แต่ data ไม่ sensitive
 */
export async function GET() {
  try {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from('site_config')
      .select('config')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('[site-config] Fetch error:', error);
      return NextResponse.json({ config: null });
    }

    return NextResponse.json({ config: data?.config || null });
  } catch {
    return NextResponse.json({ config: null });
  }
}
