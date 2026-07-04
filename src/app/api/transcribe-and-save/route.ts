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

    // ─── Unlimited Tier — ข้าม quota check + ไม่หักนาที ──
    const isUnlimited = profile.tier === 'unlimited';

    if (!isUnlimited && estimatedMinutes > quotaLeft) {
      return NextResponse.json(
        {
          error: `โควตาไม่เพียงพอ ต้องการ ${estimatedMinutes} นาที`,
          quotaLeft,
          needed: estimatedMinutes,
        },
        { status: 402 }
      );
    }

    // ─── 3. Whisper API (Dynamic Provider) ──────────────
    const audioBuffer = await audioFile.arrayBuffer();

    let transcriptionResult;
    try {
      // ใช้ Dynamic API Provider จาก DB config
      const { transcribeAudio } = await import('@/lib/api-providers');
      transcriptionResult = await transcribeAudio(audioBuffer, 'th');
    } catch (transcribeErr) {
      console.error('[transcribe-and-save] Transcribe error:', transcribeErr);
      const msg = transcribeErr instanceof Error ? transcribeErr.message : '';
      if (msg.includes('No active STT provider')) {
        return NextResponse.json(
          { error: 'ยังไม่ได้ตั้งค่า STT Provider — ไปที่หน้า Admin > ตั้งค่า API เพื่อตั้งค่า API Key ก่อนใช้ถอดความ' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: 'Transcription failed — ลองใหม่อีกครั้ง' },
        { status: 502 }
      );
    }

    const rawSegments = transcriptionResult.segments || [];
    const fullText = transcriptionResult.text || '';
    const actualDuration = transcriptionResult.duration || estimatedDurationSeconds;
    const usedMinutes = Math.ceil(actualDuration / 60);

    // ─── 4. แปลงเป็น SubtitleEntry ─────────────────────
    const uid = () => Math.random().toString(36).slice(2, 9);
    let subtitles: SubtitleEntry[] = rawSegments.map((seg: any) => {
      const id = `sub-${uid()}`;
      return {
        id,
        start: Math.round(seg.start * 10) / 10,
        end: Math.round(seg.end * 10) / 10,
        text: seg.text.trim(),
        segments: [{
          id: `${id}-seg-0`,
          text: seg.text.trim(),
          style: {
            color: '#FFFFFF',
            opacity: 1,
            strokeActive: false,
            shadowActive: false,
            strokeColor: '#000000',
            strokeWidth: 2,
            strokeOpacity: 1,
            shadowColor: '#000000',
            shadowOpacity: 0.5,
            shadowOffsetX: 0,
            shadowOffsetY: 2,
            shadowBlur: 4,
            shadowAngle: 0,
            fontWeight: 'normal' as const,
          },
        }],
        position: 'bottom' as const,
        y_offset: 80,
      };
    });

    // ─── 5. AI Vocabulary (Gemini) — ถ้า Premium ขึ้นไป ─
    if (enableAiVocab && profile.tier !== 'free' && profile.tier !== 'basic') {
      try {
        const brandTermsList: string[] = brandTermsRaw
          ? JSON.parse(brandTermsRaw)
          : [];

        // ใช้ Dynamic LLM Provider
        const { processAISmart } = await import('@/lib/api-providers');
        const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านการพิสูจน์อักษรภาษาไทย
- ตรวจสอบและแก้ไขคำผิดในซับไตเติล
- รักษาคำแบรนด์/ชื่อเฉพาะ: ${brandTermsList.join(', ')}
- ตอบกลับเป็น JSON array: [{"id": "...", "original": "...", "corrected": "..."}]`;

        const result = await processAISmart(
          JSON.stringify(subtitles.map((s) => ({ id: s.id, text: s.text }))),
          systemPrompt,
          { temperature: 0.3, maxTokens: 4096 }
        );

        if (result.content) {
          try {
            const corrections = JSON.parse(result.content.replace(/```json|```/g, '').trim());
            if (Array.isArray(corrections) && corrections.length > 0) {
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
          } catch {
            console.warn('[transcribe-and-save] Failed to parse Gemini vocab response');
          }
        }
      } catch (geminiErr) {
        console.warn('[transcribe-and-save] Gemini vocab error (non-fatal):', geminiErr);
      }
    }

    // ─── 6. AI Smart (Translation) — ถ้า Premium ขึ้นไป ─
    let aiSmartApplied = false;
    if (enableAiSmart && profile.tier !== 'free' && profile.tier !== 'basic') {
      try {
        const langName = getLanguageName(aiSmartLanguage);
        const { processAISmart } = await import('@/lib/api-providers');
        const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านการแปลภาษา
แปลข้อความซับไตเติลจากภาษาไทยเป็นภาษา${langName}
คงความหมายเดิมและรักษาชื่อเฉพาะ/ชื่อแบรนด์ไว้
ตอบกลับเป็น JSON array: [{"id": "...", "original": "...", "translated": "..."}]`;

        const result = await processAISmart(
          JSON.stringify(subtitles.map((s) => ({ id: s.id, text: s.text }))),
          systemPrompt,
          { temperature: 0.3, maxTokens: 4096 }
        );

        if (result.content) {
          try {
            const translations = JSON.parse(result.content.replace(/```json|```/g, '').trim());
            if (Array.isArray(translations) && translations.length > 0) {
              subtitles = subtitles.map((sub) => {
                const t = translations.find(
                  (c: any) => c.id === sub.id || c.original === sub.text
                );
                if (t && t.translated && t.translated !== sub.text) {
                  return { ...sub, text: t.translated };
                }
                return sub;
              });
              aiSmartApplied = true;
            }
          } catch {
            console.warn('[transcribe-and-save] Failed to parse translation response');
          }
        }
      } catch (aiErr) {
        console.warn('[transcribe-and-save] AI Smart translation error (non-fatal):', aiErr);
      }
    }

    // ─── 7. หัก Quota (ข้ามถ้า Unlimited) ─────────────
    let newUsed = profile.quota_minutes_used;
    if (!isUnlimited) {
      newUsed = profile.quota_minutes_used + usedMinutes;
      await serviceSupabase
        .from('profiles')
        .update({
          quota_minutes_used: newUsed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }

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
