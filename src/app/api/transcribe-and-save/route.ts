import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier, type SubtitleEntry } from '@/lib/types';

// ============================================================
// 🎬 Transcribe + Save All-in-One — SubZeed
// ============================================================
// POST /api/transcribe-and-save
//
// รับ audio + metadata → ถอดความ → หัก Quota → ตรวจ vocab (Gemini) → Save Project
//
// Body: FormData
//   - audio: Blob (WAV 16kHz mono)
//   - userId: string
//   - projectTitle?: string
//   - enableAiVocab?: 'true' | 'false'
//   - brandTerms?: string (JSON array, e.g. '["SubZeed","CP"]')
//
// Response: { projectId, segments, text, subtitles, duration, quotaUsed }
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as Blob | null;
    const userId = formData.get('userId') as string | null;
    const projectTitle = (formData.get('projectTitle') as string) || 'วิดีโอไม่มีชื่อ';
    const enableAiVocab = formData.get('enableAiVocab') === 'true';
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

    // ─── 6. หัก Quota ─────────────────────────────────
    const newUsed = profile.quota_minutes_used + usedMinutes;
    await serviceSupabase
      .from('profiles')
      .update({
        quota_minutes_used: newUsed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    // ─── 7. Save Project ──────────────────────────────
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

    // ─── 8. Log ───────────────────────────────────────
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
    });
  } catch (error: any) {
    console.error('[transcribe-and-save] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
