// ============================================================
// 🎛️ Dynamic API Provider SDK — SubZeed
// ============================================================
// ตัวกลางสำหรับเชื่อมต่อ API Provider ต่าง ๆ (STT, LLM)
// อ่าน config จาก Database → สร้าง SDK instance ตาม provider ที่เลือก
//
// Security Notes:
// - API Keys ถูกเข้ารหัสใน DB ด้วย pgcrypto (pgp_sym_encrypt)
// - ถอดรหัสด้วย Service Role Key (server-side เท่านั้น)
// - Keys ไม่ถูกส่งไปยัง Client-side
// ============================================================

import { createServiceSupabase } from '@/lib/supabase/server';
import type { ApiProvider, SttProvider, LlmProvider } from '@/lib/types';

// ============================================================
// 1. DATABASE ACCESSORS
// ============================================================

/**
 * ดึง API Config ปัจจุบันจาก Database
 * ใช้ Service Role เพื่อ bypass RLS
 */
async function getActiveProvider(serviceType: 'stt' | 'llm'): Promise<ApiProvider | null> {
  const supabase = createServiceSupabase();
  
  const { data, error } = await supabase
    .from('api_providers')
    .select('*')
    .eq('service_type', serviceType)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error(`[api-providers] No active ${serviceType} provider found:`, error?.message);
    return null;
  }

  return data as ApiProvider;
}

/**
 * ดึง Active Config + Decrypt API Key สำหรับ service type ที่กำหนด
 * Key ที่ได้ต้องใช้ภายใน request เดียวเท่านั้น (ไม่ cache)
 */
async function getActiveProviderWithKey(serviceType: 'stt' | 'llm'): Promise<{
  provider: string;
  model: string;
  apiKey: string;
} | null> {
  const config = await getActiveProvider(serviceType);
  if (!config || !config.api_key_encrypted) return null;

  // ถอดรหัส API Key ด้วย pgp_sym_decrypt
  const apiKey = await decryptApiKey(config.api_key_encrypted);
  if (!apiKey) return null;

  return {
    provider: config.provider,
    model: config.model,
    apiKey,
  };
}

/**
 * ถอดรหัส API Key จาก encrypted string
 * เรียกใช้ฟังก์ชัน decrypt_api_key ใน Database
 */
async function decryptApiKey(encryptedKey: string): Promise<string | null> {
  try {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase.rpc('decrypt_api_key', {
      encrypted_key: encryptedKey,
    });

    if (error || !data) {
      console.error('[api-providers] Decrypt error:', error?.message);
      // Fallback: ใช้ environment variable ถ้ามีการตั้งค่าโดยตรง
      return decryptApiKeyFallback(encryptedKey);
    }

    return data as string;
  } catch (err) {
    console.error('[api-providers] Decrypt exception:', err);
    return decryptApiKeyFallback(encryptedKey);
  }
}

/**
 * Fallback decryption: ถ้าการเรียก RPC ไม่สำเร็จ
 * ใช้ในกรณีที่ยังไม่ได้เรียกใช้งาน migration หรือ environment
 */
async function decryptApiKeyFallback(_encryptedKey: string): Promise<string | null> {
  // ถ้ามีการตั้งค่า API Keys ใน environment variables ตรง ๆ
  // ให้ใช้ค่านั้นแทน (backward compatibility)
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) return envKey;

  console.warn('[api-providers] No fallback API key found in env');
  return null;
}

// ============================================================
// 2. STT — Speech-to-Text (Transcription)
// ============================================================

export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    [key: string]: unknown;
  }>;
  duration: number;
  provider: string;
  model: string;
}

/**
 * 🎤 transcribeAudio — ถอดเสียงพูดเป็นข้อความ
 *
 * รองรับ Provider:
 * - 'openai': ใช้ OpenAI Whisper API
 * - 'groq': ใช้ Groq SDK (Whisper model)
 *
 * @param audioBuffer - Buffer ของไฟล์เสียง (WAV 16kHz mono)
 * @param language - รหัสภาษา (default: 'th')
 * @returns TranscriptionResult
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  language: string = 'th'
): Promise<TranscriptionResult> {
  const config = await getActiveProviderWithKey('stt');
  if (!config) {
    throw new Error('No active STT provider configured');
  }

  const { provider, model, apiKey } = config;

  switch (provider) {
    case 'groq':
      return transcribeWithGroq(audioBuffer, apiKey, model, language);
    case 'openai':
      return transcribeWithOpenAI(audioBuffer, apiKey, model, language);
    default:
      throw new Error(`Unsupported STT provider: ${provider}`);
  }
}

/**
 * OpenAI Whisper Transcription
 */
async function transcribeWithOpenAI(
  audioBuffer: ArrayBuffer,
  apiKey: string,
  model: string,
  language: string
): Promise<TranscriptionResult> {
  const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');
  formData.append('language', language);
  formData.append('temperature', '0.0');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[transcribeWithOpenAI] Error:', errText);
    throw new Error(`OpenAI Whisper API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.text || '',
    segments: data.segments || [],
    duration: data.duration || 0,
    provider: 'openai',
    model,
  };
}

/**
 * Groq Whisper Transcription
 * ใช้ Groq API ซึ่งเข้ากันได้กับ OpenAI Whisper format
 */
async function transcribeWithGroq(
  audioBuffer: ArrayBuffer,
  apiKey: string,
  model: string,
  language: string
): Promise<TranscriptionResult> {
  const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');
  formData.append('language', language);
  formData.append('temperature', '0.0');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[transcribeWithGroq] Error:', errText);
    throw new Error(`Groq Whisper API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.text || '',
    segments: data.segments || [],
    duration: data.duration || 0,
    provider: 'groq',
    model,
  };
}

// ============================================================
// 3. LLM — AI Smart Engine (Chat/Completion)
// ============================================================

export interface AiSmartResult {
  content: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * 🧠 processAISmart — ส่งข้อความไปยัง LLM Provider ที่เลือก
 *
 * รองรับ Provider:
 * - 'openai': OpenAI Chat Completion
 * - 'gemini': Google Generative AI
 * - 'groq': Groq Chat Completion
 *
 * @param prompt - ข้อความที่จะส่งไปยัง LLM
 * @param systemPrompt - system prompt (optional)
 * @param options - ตัวเลือกเพิ่มเติม (temperature, maxTokens)
 * @returns AiSmartResult
 */
export async function processAISmart(
  prompt: string,
  systemPrompt?: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<AiSmartResult> {
  const config = await getActiveProviderWithKey('llm');
  if (!config) {
    throw new Error('No active LLM provider configured');
  }

  const { provider, model, apiKey } = config;
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 2048;

  switch (provider) {
    case 'openai':
      return processWithOpenAI(prompt, apiKey, model, systemPrompt, temperature, maxTokens);
    case 'gemini':
      return processWithGemini(prompt, apiKey, model, systemPrompt, temperature, maxTokens);
    case 'groq':
      return processWithGroq(prompt, apiKey, model, systemPrompt, temperature, maxTokens);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * OpenAI Chat Completion
 */
async function processWithOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
  systemPrompt?: string,
  temperature: number = 0.7,
  maxTokens: number = 2048
): Promise<AiSmartResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[processWithOpenAI] Error:', errText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    provider: 'openai',
    model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

/**
 * Google Gemini API
 */
async function processWithGemini(
  prompt: string,
  apiKey: string,
  model: string,
  systemPrompt?: string,
  temperature: number = 0.7,
  _maxTokens: number = 2048
): Promise<AiSmartResult> {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: _maxTokens,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error('[processWithGemini] Error:', errText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    content,
    provider: 'gemini',
    model,
    usage: data?.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : undefined,
  };
}

/**
 * Groq Chat Completion
 */
async function processWithGroq(
  prompt: string,
  apiKey: string,
  model: string,
  systemPrompt?: string,
  temperature: number = 0.7,
  maxTokens: number = 2048
): Promise<AiSmartResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[processWithGroq] Error:', errText);
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    provider: 'groq',
    model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

// ============================================================
// 4. UTILITY — Get Provider Info (sanitized, no keys)
// ============================================================

/**
 * ดึงข้อมูล API Provider ทั้งหมด (เฉพาะข้อมูลที่ไม่-sensitive)
 * ใช้สำหรับแสดงใน UI
 */
export async function getAllProviderInfos(): Promise<Array<{
  service_type: 'stt' | 'llm';
  provider: string;
  model: string;
  is_active: boolean;
  label: string | null;
  has_key: boolean;
  updated_at: string;
}>> {
  const supabase = createServiceSupabase();
  
  const { data, error } = await supabase
    .from('api_providers')
    .select('service_type, provider, model, is_active, label, api_key_encrypted, updated_at')
    .order('service_type')
    .order('provider');

  if (error || !data) {
    console.error('[api-providers] Fetch error:', error?.message);
    return [];
  }

  return data.map((row: Record<string, unknown>) => ({
    service_type: row.service_type as 'stt' | 'llm',
    provider: row.provider as string,
    model: row.model as string,
    is_active: row.is_active as boolean,
    label: row.label as string | null,
    has_key: !!(row.api_key_encrypted as string | null),
    updated_at: row.updated_at as string,
  }));
}
