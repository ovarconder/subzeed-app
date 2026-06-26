import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier, type SubtitleEntry } from '@/lib/types';

// ============================================================
// 🎬 Transcribe + Save All-in-One — SubZeed
// ============================================================
// POST /api/transcribe-and-save
//
// รับ audio + metadata → ถอดความ → หัก Quota → ตรวจ vocab (Gemini)
// → AI แปลภาษา (ถ้าเปิดใช้) → Save Project
//
// Body: FormData
//   - audio: Blob (WAV 16kHz mono)
//   - userId: string
//   - projectTitle?: string
//   - enableAiVocab?: 'true' | 'false'
//   - enableAiSmart?: 'true' | 'false'     ← NEW: AI แปลภาษา
//   - aiSmartLanguage?: string              ← NEW: ภาษาเป้าหมาย (default 'en')
//   - brandTerms?: string (JSON array, e.g. '["SubZeed","CP"]')
//
// Response: { projectId, segments, text, subtitles, duration, quotaUsed, aiSmartApplied }
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as Blob | null;
    const userId = formData.get('userId') as string | null;
    const projectTitle = (formData.get('projectTitle') as string) || 'วิดีโอไม่มีชื่อ';
    const enableAiVocab = formData.get('enableAiVocab') === 'true';
    const enableAiSmart = formData.get('enableAiSmart') === 'true';
    const aiSmartLanguage = (formData.get('aiSmartLanguage') as string) || 'en';
    const brandTermsRaw = formData.get('brandTerms') as string | null;

    if (!audioFile || !userId) {
      return NextResponse.json(
        { error: 'Missing audio or userId' },
        { status: 400 }
      );
    }

    // ─── 1. Auth ──────────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── 2. Check Quota + Abuser ──────────────────────
    const serviceSupabase = createServiceSupabase();
    const { data: profile, error: profileError } = await serviceSupabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.is_quota_abuser) {
      return NextResponse.json(
        { error: 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 403 }
      );
    }

    const tierConfig = TIER_CONFIGS[profile.tier as SubscriptionTier];
    const estimatedDurationSeconds = audioFile.size / 32000;
    const estimatedMinutes = Math.ceil(estimatedDurationSeconds / 60);
    const quotaLeft = profile.quota_minutes_total - profile.quota_minutes_used;

    if (estimatedMinutes > quotaLeft) {
      return NextResponse.json(
        {
          error: `โควตาไม่เพียงพอ ต้องการ ${estimatedMinutes} นาที`,
          quotaLeft,
          needed: estimatedMinutes,
        },
        { status: 402 }
      );
    }

    // ─── 3. Whisper API ───────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

    const whisperForm = new FormData();
    whisperForm.append('file', file);
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('response_format', 'verbose_json');
    whisperForm.append('language', 'th');
    whisperForm.append('temperature', '0.0');

    const whisperResponse = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
      }
    );

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      console.error('[transcribe-and-save] Whisper error:', errText);
      return NextResponse.json(
        { error: 'Transcription failed — ลองใหม่อีกครั้ง' },
        { status: 502 }
      );
    }

    const data = await whisperResponse.json();
    const rawSegments = data.segments || [];
    const fullText = data.text || '';
    const actualDuration = data.duration || estimatedDurationSeconds;
    const usedMinutes = Math.ceil(actualDuration / 60);

    // ─── 4. แปลงเป็น SubtitleEntry ─────────────────────
    const uid = () => Math.random().toString(36).slice(2, 9);
    let subtitles: SubtitleEntry[] = rawSegments.map((seg: any) => ({
      id: `sub-${uid()}`,
      start: Math.round(seg.start * 10) / 10,
      end: Math.round(seg.end * 10) / 10,
      text: seg.text.trim(),
      position: 'bottom' as const,
      y_offset: 90,
    }));

    // ─── 5. AI Vocabulary (Gemini) — ถ้า Premium ขึ้นไป ─
    if (enableAiVocab && profile.tier !== 'free' && profile.tier !== 'basic') {
      try {
        const brandTerms: string[] = brandTermsRaw
          ? JSON.parse(brandTermsRaw)
          : [];

        const geminiResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/gemini-vocab`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subtitles: subtitles.map((s) => ({ id: s.id, text: s.text })),
              brandTerms,
            }),
          }
        );

        if (geminiResponse.ok) {
          const { corrections } = await geminiResponse.json();
          if (corrections && corrections.length > 0) {
            // อัปเดตข้อความที่แก้ไข
            subtitles = subtitles.map((sub) => {
              const correction = corrections.find(
                (c: any) => c.original === sub.text
              );
              if (correction && correction.corrected && correction.corrected !== sub.text) {
                return { ...sub, text: correction.corrected };
              }
              return sub;
            });
          }
        }
      } catch (geminiErr) {
        console.warn('[transcribe-and-save] Gemini vocab error (non-fatal):', geminiErr);
        // ไม่ล้มเหลวทั้งกระบวนการ แค่ข้ามไป
      }
    }

    // ─── 6. AI Smart (Translation) — ถ้า Premium ขึ้นไป ─
    let aiSmartApplied = false;
    if (enableAiSmart && profile.tier !== 'free' && profile.tier !== 'basic') {
      try {
        // ใช้ processAISmart จาก api-providers ถ้ามี หรือเรียก Gemini โดยตรง
        const langName = getLanguageName(aiSmartLanguage);
        const translationPrompt = `คุณคือผู้เชี่ยวชาญด้านการแปลภาษา กรุณาแปลข้อความซับไตเติลภาษาไทยด้านล่างเป็นภาษา${langName} โดยคงความหมายเดิม รักษาคำเฉพาะ/ชื่อเฉพาะไว้ (เช่น SubZeed, ชื่อคน, ชื่อแบรนด์) และปรับให้เป็นภาษาธรรมชาติที่เข้าใจง่าย

ให้ตอบกลับเป็น JSON array ที่มีฟิลด์ "id" (id เดิม), "original", "translated"

ข้อความซับไตเติล:
${JSON.stringify(subtitles.map((s) => ({ id: s.id, text: s.text })))}`;

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/gemini-vocab`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subtitles: subtitles.map((s) => ({ id: s.id, text: s.text })),
              brandTerms: [],
              translationMode: true,
              targetLanguage: aiSmartLanguage,
              targetLanguageName: langName,
            }),
          }
        );

        if (response.ok) {
          const { corrections } = await response.json();
          if (corrections && corrections.length > 0) {
            subtitles = subtitles.map((sub) => {
              const correction = corrections.find(
                (c: any) => c.id === sub.id || c.original === sub.text
              );
              if (correction && correction.translated && correction.translated !== sub.text) {
                return { ...sub, text: correction.translated };
              }
              return sub;
            });
            aiSmartApplied = true;
          }
        }
      } catch (aiErr) {
        console.warn('[transcribe-and-save] AI Smart translation error (non-fatal):', aiErr);
        // ไม่ล้มเหลวทั้งกระบวนการ แค่ข้ามไป
      }
    }

    // ─── 7. หัก Quota ─────────────────────────────────
    const newUsed = profile.quota_minutes_used + usedMinutes;
    await serviceSupabase
      .from('profiles')
      .update({
        quota_minutes_used: newUsed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    // ─── 8. Save Project ──────────────────────────────
    const { data: project, error: projectError } = await serviceSupabase
      .from('projects')
      .insert({
        user_id: userId,
        title: projectTitle,
        duration_seconds: actualDuration,
        subtitles: subtitles,
        video_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (projectError) {
      console.error('[transcribe-and-save] Save project error:', projectError);
    }

    // ─── 9. Log ───────────────────────────────────────
    await serviceSupabase.from('quota_activity_logs').insert({
      user_id: userId,
      project_id: project?.id || null,
      log_type: 'stt_transcription',
      minutes_changed: -usedMinutes,
      quota_minutes_used_snapshot: newUsed,
      description: `🎤 ถอดความ "${projectTitle}" (${actualDuration.toFixed(0)} วิ) พร้อมสร้างโปรเจกต์`,
    });

    return NextResponse.json({
      projectId: project?.id || null,
      segments: rawSegments,
      text: fullText,
      subtitles,
      duration: actualDuration,
      durationMinutes: usedMinutes,
      quotaUsed: usedMinutes,
      quotaLeft: profile.quota_minutes_total - newUsed,
      aiVocabApplied: enableAiVocab && profile.tier !== 'free' && profile.tier !== 'basic',
      aiSmartApplied,
      aiSmartLanguage: aiSmartApplied ? aiSmartLanguage : undefined,
    });
  } catch (error: any) {
    console.error('[transcribe-and-save] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * แปลงรหัสภาษา (ISO 639-1) เป็นชื่อภาษาไทย
 */
function getLanguageName(code: string): string {
  const map: Record<string, string> = {
    en: 'อังกฤษ',
    zh: 'จีน',
    ja: 'ญี่ปุ่น',
    ko: 'เกาหลี',
    vi: 'เวียดนาม',
    ms: 'มาเลย์',
    fr: 'ฝรั่งเศส',
    de: 'เยอรมัน',
    es: 'สเปน',
    ar: 'อาหรับ',
    pt: 'โปรตุเกส',
    ru: 'รัสเซีย',
    it: 'อิตาลี',
    hi: 'ฮินดี',
    th: 'ไทย',
    id: 'อินโดนีเซีย',
  };
  return map[code] || code;
}
