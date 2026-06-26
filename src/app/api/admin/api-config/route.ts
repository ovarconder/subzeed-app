// ============================================================
// 🎛️ API Config Admin Route — SubZeed
// ============================================================
// GET  /api/admin/api-config       → ดึง config ปัจจุบัน (sanitized)
// PUT  /api/admin/api-config       → อัปเดต/บันทึก API Config
// POST /api/admin/api-config/test  → ทดสอบการเชื่อมต่อ API
//
// Security:
// - Admin Auth Required
// - API Keys ถูกเข้ารหัสก่อนบันทึก (server-side encrypt)
// - Keys ไม่ถูกส่งกลับใน response (sanitized)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getAllProviderInfos } from '@/lib/api-providers';
import type { ApiProviderPayload } from '@/lib/types';

/**
 * GET — ดึงรายการ API Providers ทั้งหมด (ไม่มี Keys)
 */
export async function GET() {
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
      .select('tier, email, is_super_admin')
      .eq('id', session.user.id)
      .single();

    if (!profile || (profile.is_super_admin !== true && profile.email !== 'overconda@gmail.com')) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // ─── Fetch Providers (sanitized) ─────────────────────
    const providers = await getAllProviderInfos();

    return NextResponse.json({
      providers,
      // Active config summary
      activeConfig: {
        stt: providers.find((p) => p.service_type === 'stt' && p.is_active) || null,
        llm: providers.find((p) => p.service_type === 'llm' && p.is_active) || null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT — อัปเดต API Provider Config
 * Body: { provider: string, service_type: 'stt'|'llm', model?: string, api_key?: string }
 *
 * ถ้าส่ง service_type + provider → เปิดใช้งาน provider นั้น (activate)
 * ถ้าส่ง model → อัปเดต model name
 * ถ้าส่ง api_key → เข้ารหัสและบันทึก
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
      .select('tier, email, is_super_admin')
      .eq('id', session.user.id)
      .single();

    if (!profile || (profile.is_super_admin !== true && profile.email !== 'overconda@gmail.com')) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // ─── Validate body ───────────────────────────────────
    const body: ApiProviderPayload = await request.json();
    const { service_type, provider, model, api_key, is_active } = body;

    if (!service_type || !provider) {
      return NextResponse.json(
        { error: 'Missing required fields: service_type, provider' },
        { status: 400 }
      );
    }

    if (!['stt', 'llm'].includes(service_type)) {
      return NextResponse.json(
        { error: 'Invalid service_type. Must be "stt" or "llm"' },
        { status: 400 }
      );
    }

    // ─── อัปเดต Config ──────────────────────────────────
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (model !== undefined) {
      updateData.model = model;
    }

    if (api_key !== undefined && api_key.trim() !== '') {
      // เข้ารหัส API Key ก่อนบันทึก (ใช้ pgp_sym_encrypt)
      try {
        const { data: encryptedKey, error: encryptError } = await adminSupabase
          .rpc('encrypt_api_key', { plain_key: api_key.trim() });

        if (encryptError || !encryptedKey) {
          console.error('[api-config] Encrypt error:', encryptError);
          return NextResponse.json(
            { error: 'Failed to encrypt API key' },
            { status: 500 }
          );
        }

        updateData.api_key_encrypted = encryptedKey;
      } catch (encryptErr) {
        console.error('[api-config] Encrypt exception:', encryptErr);
        return NextResponse.json(
          { error: 'Failed to encrypt API key' },
          { status: 500 }
        );
      }
    }

    // ─── อัปเดต record โดยใช้ provider + service_type ────
    const { error: updateError } = await adminSupabase
      .from('api_providers')
      .update(updateData)
      .eq('service_type', service_type)
      .eq('provider', provider);

    if (updateError) {
      console.error('[api-config] Update error:', updateError);
      return NextResponse.json(
        { error: 'Database update failed: ' + updateError.message },
        { status: 500 }
      );
    }

    // ─── Activate ถ้าต้องการ ─────────────────────────────
    if (is_active === true) {
      const { error: activateError } = await adminSupabase
        .rpc('activate_api_provider', {
          p_service_type: service_type,
          p_provider: provider,
        });

      if (activateError) {
        console.error('[api-config] Activate error:', activateError);
        // ไม่ return error เพราะ update สำเร็จแล้ว
      }
    }

    // ─── Return sanitized response ───────────────────────
    const providers = await getAllProviderInfos();

    return NextResponse.json({
      success: true,
      providers,
      activeConfig: {
        stt: providers.find((p) => p.service_type === 'stt' && p.is_active) || null,
        llm: providers.find((p) => p.service_type === 'llm' && p.is_active) || null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/api-config/test
 * ทดสอบการเชื่อมต่อ API Provider
 * Body: { service_type: 'stt'|'llm', provider: string, api_key: string, model: string }
 */
export async function POST(request: NextRequest) {
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
      .select('tier, email, is_super_admin')
      .eq('id', session.user.id)
      .single();

    if (!profile || (profile.is_super_admin !== true && profile.email !== 'overconda@gmail.com')) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // ─── Parse body ────────────────────────────────────
    const body = await request.json();
    const { service_type, provider, api_key, model } = body;

    if (!service_type || !provider || !api_key || !model) {
      return NextResponse.json(
        { error: 'Missing required fields: service_type, provider, api_key, model' },
        { status: 400 }
      );
    }

    // ─── Test connection ──────────────────────────────
    let testResult: { success: boolean; message: string };

    if (service_type === 'stt') {
      testResult = await testSttConnection(provider, api_key, model);
    } else if (service_type === 'llm') {
      testResult = await testLlmConnection(provider, api_key, model);
    } else {
      return NextResponse.json({ error: 'Invalid service_type' }, { status: 400 });
    }

    return NextResponse.json(testResult);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * ทดสอบ STT Connection
 */
async function testSttConnection(
  provider: string,
  apiKey: string,
  _model: string
): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl =
      provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : 'https://api.openai.com/v1';

    // ทดสอบด้วยการ list models (use HEAD to save quota)
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.ok) {
      return { success: true, message: `✅ เชื่อมต่อ ${provider} สำเร็จ` };
    } else if (response.status === 401) {
      return { success: false, message: '❌ API Key ไม่ถูกต้อง (401 Unauthorized)' };
    } else {
      return {
        success: false,
        message: `❌ เชื่อมต่อไม่สำเร็จ (${response.status}: ${response.statusText})`,
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `❌ เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * ทดสอบ LLM Connection
 */
async function testLlmConnection(
  provider: string,
  apiKey: string,
  model: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (provider === 'gemini') {
      // Gemini: test with generateContent
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "ok"' }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        }
      );

      if (response.ok) {
        return { success: true, message: `✅ เชื่อมต่อ Gemini (${model}) สำเร็จ` };
      } else {
        const errData = await response.text();
        return {
          success: false,
          message: `❌ Gemini Error: ${errData.slice(0, 200)}`,
        };
      }
    } else {
      // OpenAI / Groq
      const baseUrl =
        provider === 'groq'
          ? 'https://api.groq.com/openai/v1'
          : 'https://api.openai.com/v1';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 10,
        }),
      });

      if (response.ok) {
        return { success: true, message: `✅ เชื่อมต่อ ${provider} (${model}) สำเร็จ` };
      } else if (response.status === 401) {
        return { success: false, message: '❌ API Key ไม่ถูกต้อง (401 Unauthorized)' };
      } else {
        const errData = await response.text();
        return {
          success: false,
          message: `❌ Error: ${errData.slice(0, 200)}`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      message: `❌ เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
