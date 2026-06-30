import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier, type SubtitleEntry } from '@/lib/types';

// ============================================================
// 🎤 Whisper STT API — SubZeed
// ============================================================
// POST /api/transcribe
// รับ audio file → ส่ง Whisper API → คืน segments (พร้อมภาษาไทย)
//
// Body: FormData
//   - audio: Blob (WAV, 16kHz mono)
//   - userId: string (UUID)
//   - projectTitle?: string
//   - language?: string (default: 'th')
//
// Response: { segments: [...], text: string, duration: number }
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as Blob | null;
    const userId = formData.get('userId') as string | null;
    const language = (formData.get('language') as string) || 'th';

    if (!audioFile || !userId) {
      return NextResponse.json(
        { error: 'Missing audio or userId' },
        { status: 400 }
      );
    }

    // ─── 1. ตรวจสอบ Auth ─────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user || session.user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── 2. ตรวจสอบสิทธิ์: เช็ค Quota + Abuser ───────
    const serviceSupabase = createServiceSupabase();
    const { data: profile, error: profileError } = await serviceSupabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // ─── 3. เช็ค Abuser ───────────────────────────────
    if (profile.is_quota_abuser) {
      return NextResponse.json(
        { error: 'บัญชีของคุณถูกระงับการใช้งานเนื่องจากตรวจพบการใช้งานที่ผิดปกติ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 403 }
      );
    }

    // ─── 4. คำนวณ Audio Duration (โดยประมาณจาก Blob) ─
    // ไฟล์ WAV 16kHz mono 16bit → bytes ต่อวินาที = 16000*2 = 32000
    const estimatedDurationSeconds = audioFile.size / 32000;
    const estimatedMinutes = Math.ceil(estimatedDurationSeconds / 60);

    // ─── 5. เช็ค Quota (ข้ามถ้า Unlimited) ────────────
    const isUnlimited = profile.tier === 'unlimited';
    const quotaLeft = profile.quota_minutes_total - profile.quota_minutes_used;
    if (!isUnlimited && estimatedMinutes > quotaLeft) {
      return NextResponse.json(
        {
          error: `โควตาไม่เพียงพอ ต้องการ ${estimatedMinutes} นาที แต่คงเหลือ ${quotaLeft.toFixed(1)} นาที`,
          quotaLeft: quotaLeft,
          needed: estimatedMinutes,
        },
        { status: 402 } // Payment Required
      );
    }

    // ─── 6. เรียก Whisper API ──────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

    const whisperForm = new FormData();
    whisperForm.append('file', file);
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('response_format', 'verbose_json');
    whisperForm.append('language', language);
    whisperForm.append('temperature', '0.0');

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[transcribe] Whisper API error:', errorText);
      return NextResponse.json(
        { error: 'Transcription failed — ลองใหม่อีกครั้ง' },
        { status: 502 }
      );
    }

    const data = await response.json();
    const segments = data.segments || [];
    const text = data.text || '';

    // ─── 7. 計算 duration (ใช้ทั้งใน response และ quota) ─
    const actualDuration = data.duration || estimatedDurationSeconds;
    const usedMinutes = Math.ceil(actualDuration / 60);

    // ─── 8. หัก Quota (ข้ามถ้า Unlimited) ─────────────
    let newUsed = profile.quota_minutes_used;
    if (!isUnlimited) {
      newUsed = profile.quota_minutes_used + usedMinutes;

      const { error: quotaError } = await serviceSupabase
        .from('profiles')
        .update({
          quota_minutes_used: newUsed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (quotaError) {
        console.error('[transcribe] Quota update error:', quotaError);
      }

      // ─── 9. บันทึก Quota Activity Log ─────────────────
      await serviceSupabase.from('quota_activity_logs').insert({
        user_id: userId,
        log_type: 'stt_transcription',
        minutes_changed: -usedMinutes,
        quota_minutes_used_snapshot: newUsed,
        description: `ถอดความ ${language === 'th' ? 'ภาษาไทย' : 'ภาษา'} ความยาว ${actualDuration.toFixed(1)} วินาที`,
      });
    }

    return NextResponse.json({
      segments,
      text,
      duration: actualDuration,
      durationMinutes: usedMinutes,
      quotaUsed: usedMinutes,
      quotaLeft: profile.quota_minutes_total - newUsed,
    });
  } catch (error: any) {
    console.error('[transcribe] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
