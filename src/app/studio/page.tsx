'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { useSubtitleStore } from '@/lib/store/subtitle-store';
import { useToast } from '@/components/ui/toaster';
import { TIER_CONFIGS } from '@/lib/types';
import { extractAudio } from '@/lib/audio-extractor';
import { api } from '@/lib/api';
import type { SubtitleEntry } from '@/lib/types';

// Helper: generate unique ID
const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * แปลง SubtitleEntry array → WebVTT string
 */
function generateVtt(subtitles: SubtitleEntry[]): string {
  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const cs = Math.round((s % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(cs).padStart(3, '0')}`;
  };

  let vtt = 'WEBVTT\n\n';
  subtitles.forEach((sub, i) => {
    vtt += `${i + 1}\n`;
    vtt += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n`;
    vtt += `${sub.text}\n\n`;
  });
  return vtt;
}

export default function StudioPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, profile } = useAuth();
  const { addToast } = useToast();
  const store = useSubtitleStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [subtitleText, setSubtitleText] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [brandTerms, setBrandTerms] = useState('');
  const [enableAiVocab, setEnableAiVocab] = useState(false);
  const [enableAiSmart, setEnableAiSmart] = useState(false); // AI แปลภาษา
  const [aiSmartLanguage, setAiSmartLanguage] = useState('en'); // ภาษาเป้าหมาย
  const [showWatermarkPreview, setShowWatermarkPreview] = useState(false);
  // WebVTT blob URL สำหรับ subtitle track
  const [vttUrl, setVttUrl] = useState<string | null>(null);
  const trackRef = useRef<HTMLTrackElement | null>(null);

  // Check quota
  const tierConfig = profile ? TIER_CONFIGS[profile.tier] : TIER_CONFIGS.free;
  const quotaLeft = profile ? profile.quota_minutes_total - profile.quota_minutes_used : 0;
  const isFree = profile?.tier === 'free';
  const isPremiumOrUp = profile?.tier === 'premium' || profile?.tier === 'business_starter' || profile?.tier === 'business_pro';
  // ตรวจสอบว่า tier นี้มีสิทธิ์ใช้ AI Smart (Translation) หรือไม่
  const hasAiSmart = profile ? TIER_CONFIGS[profile.tier]?.aiVocabulary : false;
  const hasAiVocab = profile ? TIER_CONFIGS[profile.tier]?.aiVocabulary : false;

  // ---- Video Handling ----
  const handleFileSelect = useCallback((file: File) => {
    const isVideo = file.type.startsWith('video/');
    if (!isVideo) {
      addToast('กรุณาเลือกไฟล์วิดีโอ', 'error');
      return;
    }

    // Check duration via video element
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      const dur = tempVideo.duration;
      const maxDur = tierConfig.maxVideoMinutes * 60;
      if (dur > maxDur) {
        addToast(`วิดีโอความยาวสูงสุด ${tierConfig.maxVideoMinutes} นาที สำหรับแพ็กเกจ ${tierConfig.name}`, 'error');
        URL.revokeObjectURL(tempVideo.src);
        return;
      }
      setVideoDuration(dur);
      store.setVideoFile(file);
      URL.revokeObjectURL(tempVideo.src);
    };
    tempVideo.src = URL.createObjectURL(file);
  }, [tierConfig, addToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ---- Enhanced Transcription (ใช้ audio-extractor + transcribe-and-save) ----
  const handleTranscribe = async () => {
    console.log('[Studio] handleTranscribe called', {
      hasVideoFile: !!store.videoFile,
      hasUser: !!user,
      videoDuration,
      quotaLeft,
    });

    if (!store.videoFile) {
      addToast('กรุณาเลือกวิดีโอก่อน', 'warning');
      return;
    }
    if (!user) {
      addToast('กรุณาเข้าสู่ระบบก่อนใช้งาน', 'warning');
      return;
    }

    const estimatedMinutes = Math.ceil(videoDuration / 60);
    if (estimatedMinutes > quotaLeft) {
      addToast(`โควตาไม่เพียงพอ ต้องการ ${estimatedMinutes} นาที แต่มี ${quotaLeft.toFixed(1)} นาที`, 'error');
      return;
    }

    store.setIsProcessing(true);
    store.setProcessingProgress(0);

    try {
      // 1. Extract audio ด้วย library ใหม่
      console.log('[Studio] Starting audio extraction...');
      const result = await extractAudio(
        store.videoFile,
        { targetSampleRate: 16000, normalizeAudio: true },
        (pct) => store.setProcessingProgress(pct)
      );
      console.log('[Studio] Audio extraction done', { sizeBytes: result.sizeBytes, durationSeconds: result.durationSeconds });

      // 2. ส่ง transcribe-and-save (all-in-one)
      const formData = new FormData();
      formData.append('audio', result.blob, 'audio.wav');
      formData.append('userId', user.id);
      formData.append('projectTitle', store.videoFile.name);
      formData.append('enableAiVocab', enableAiVocab ? 'true' : 'false');
      formData.append('enableAiSmart', enableAiSmart ? 'true' : 'false');
      formData.append('aiSmartLanguage', aiSmartLanguage);
      formData.append('brandTerms', JSON.stringify(
        brandTerms.split(',').map(s => s.trim()).filter(Boolean)
      ));

      console.log('[Studio] Sending to /api/transcribe-and-save...');
      const response = await fetch(api('/api/transcribe-and-save'), {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      console.log('[Studio] Response', { ok: response.ok, status: response.status, data });

      if (!response.ok) {
        if (response.status === 402) {
          addToast(`โควตาไม่พอ — ต้องการ ${data.needed} นาที`, 'error');
        } else if (response.status === 403) {
          addToast('บัญชีถูกระงับชั่วคราว ติดต่อฝ่ายสนับสนุน', 'error');
        } else {
          addToast(data.error || 'ถอดความไม่สำเร็จ', 'error');
        }
        return;
      }

      // 3. อัปเดต store
      const newSubtitles: SubtitleEntry[] = data.subtitles.map((seg: any) => ({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        text: seg.text,
        position: seg.position || 'bottom',
        y_offset: seg.y_offset ?? 90,
      }));

      store.setSubtitles(newSubtitles);
      store.setCurrentProject({
        id: data.projectId,
        user_id: user.id,
        title: store.videoFile.name,
        video_url: null,
        duration_seconds: data.duration,
        subtitles: newSubtitles,
        is_client_review_enabled: false,
        review_token: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // สร้าง WebVTT blob
      const vttContent = generateVtt(newSubtitles);
      if (vttUrl) URL.revokeObjectURL(vttUrl);
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      setVttUrl(URL.createObjectURL(blob));

      const vocabMsg = data.aiVocabApplied ? ' + AI Vocabulary' : '';
      const smartMsg = data.aiSmartApplied ? ` + AI แปล(${data.aiSmartLanguage || 'en'})` : '';
      addToast(`ถอดความสำเร็จ! ${newSubtitles.length} รายการ${vocabMsg}${smartMsg}`, 'success');
    } catch (err: any) {
      addToast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally {
      store.setIsProcessing(false);
      store.setProcessingProgress(0);
    }
  };

  // ---- Save Project ----
  const handleSave = async () => {
    if (!user) return;
    const { error } = await supabase.from('projects').insert({
      user_id: user.id,
      title: store.videoFile?.name || 'วิดีโอไม่มีชื่อ',
      duration_seconds: videoDuration,
      subtitles: store.subtitles,
      video_url: null,
    });

    if (error) {
      addToast('บันทึกไม่สำเร็จ', 'error');
    } else {
      addToast('บันทึกโปรเจกต์สำเร็จ', 'success');
      router.push('/dashboard');
    }
  };

  // ---- Subtitle CRUD ----
  const addSubtitle = () => {
    const ct = videoRef.current?.currentTime || 0;
    const newSub: SubtitleEntry = {
      id: `sub-${uid()}`,
      start: Math.round(ct * 10) / 10,
      end: Math.round((ct + 3) * 10) / 10,
      text: subtitleText || '...',
      position: 'bottom',
      y_offset: 90,
    };
    store.addSubtitle(newSub);
    setSubtitleText('');
  };

  // Current subtitle at playback time
  const currentSub = store.subtitles.find(
    (s) => store.currentTime >= s.start && store.currentTime <= s.end
  );

  // ---- Watch video time ----
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const handler = () => store.setCurrentTime(vid.currentTime);
    vid.addEventListener('timeupdate', handler);
    return () => vid.removeEventListener('timeupdate', handler);
  }, [store.videoUrl]);

  // Cleanup vttUrl เมื่อ component unmount
  useEffect(() => {
    return () => {
      if (vttUrl) URL.revokeObjectURL(vttUrl);
    };
  }, []);

  // ---- Canvas Watermark Overlay (Free tier) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !store.videoUrl) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ใช้ ResizeObserver จับขนาด video จริง ๆ (ไม่ใช่ clientWidth ที่เปลี่ยนทุกครั้ง)
    const resizeCanvas = () => {
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resizeCanvas();

    const drawFrame = () => {
      if (video.paused || video.ended) return;

      // ★★★ สำคัญ: clear canvas ก่อนวาดทุกครั้ง ★★★
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isFree) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Generated by SubZeed', canvas.width / 2, canvas.height - 20);
        ctx.restore();
      }
      requestAnimationFrame(drawFrame);
    };

    video.addEventListener('play', drawFrame);

    // ดู resize ด้วย ResizeObserver แทน clientWidth ที่ผันผวน
    const observer = new ResizeObserver(() => {
      resizeCanvas();
      ctx.clearRect(0, 0, canvas.width, canvas.height); // clear เมื่อขนาดเปลี่ยน
    });
    observer.observe(video);

    return () => {
      video.removeEventListener('play', drawFrame);
      observer.disconnect();
    };
  }, [store.videoUrl, isFree]);

  return (
    <>
      <Navbar />
      <main className="flex-1 flex">
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="border-b border-border bg-surface px-4 py-2 flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              เลือกวิดีโอ
            </Button>
            {store.subtitles.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={handleSave}>
                  💾 บันทึก
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const blob = new Blob([JSON.stringify(store.subtitles, null, 2)], { type: 'text/plain' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'subtitles.srt';
                  a.click();
                }}>
                  ⬇️ .srt
                </Button>
              </>
            )}

            {/* ─── AI Features Toggle ─────────────────── */}
            {/* AI Vocab (ตรวจคำศัพท์/พิสูจน์อักษร) */}
            <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${
              hasAiVocab ? 'text-text-secondary' : 'text-text-secondary/40 cursor-not-allowed'
            }`}>
              <input
                type="checkbox"
                checked={enableAiVocab}
                disabled={!hasAiVocab}
                onChange={(e) => {
                  if (hasAiVocab) setEnableAiVocab(e.target.checked);
                }}
                className="accent-primary"
              />
              AI Vocab
              {!hasAiVocab && <span className="text-warning/60 text-[10px]" title='เฉพาะ Premium ขึ้นไป'>🔒</span>}
            </label>

            {/* Brand Terms Input */}
            {enableAiVocab && (
              <input
                type="text"
                value={brandTerms}
                onChange={(e) => setBrandTerms(e.target.value)}
                placeholder="คำแบรนด์ (เช่น SubZeed, CP)"
                className="w-40 rounded border border-border px-2 py-1 text-xs"
              />
            )}

            {/* AI Smart (แปลภาษา) */}
            <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${
              hasAiSmart ? 'text-text-secondary' : 'text-text-secondary/40 cursor-not-allowed'
            }`}>
              <input
                type="checkbox"
                checked={enableAiSmart}
                disabled={!hasAiSmart}
                onChange={(e) => {
                  if (hasAiSmart) setEnableAiSmart(e.target.checked);
                }}
                className="accent-primary"
              />
              AI แปล
              {!hasAiSmart && <span className="text-warning/60 text-[10px]" title='เฉพาะ Premium ขึ้นไป'>🔒</span>}
            </label>

            {/* ภาษาเป้าหมาย (AI Smart) */}
            {enableAiSmart && (
              <select
                value={aiSmartLanguage}
                onChange={(e) => setAiSmartLanguage(e.target.value)}
                className="w-28 rounded border border-border px-2 py-1 text-xs bg-white"
              >
                <option value="en">🇬🇧 อังกฤษ</option>
                <option value="zh">🇨🇳 จีน</option>
                <option value="ja">🇯🇵 ญี่ปุ่น</option>
                <option value="ko">🇰🇷 เกาหลี</option>
                <option value="vi">🇻🇳 เวียดนาม</option>
                <option value="ms">🇲🇾 มาเลย์</option>
                <option value="fr">🇫🇷 ฝรั่งเศส</option>
                <option value="de">🇩🇪 เยอรมัน</option>
                <option value="es">🇪🇸 สเปน</option>
                <option value="ar">🇸🇦 อาหรับ</option>
              </select>
            )}

            <div className="ml-auto text-sm text-text-secondary flex items-center gap-3">
              {isFree && (
                <span className="text-xs text-warning">🔒 ลายน้ำ</span>
              )}
              {quotaLeft.toFixed(1)} / {profile?.quota_minutes_total || 20} นาที
            </div>
          </div>

          {/* Video + Subtitles + Watermark Area */}
          <div
            className="relative flex-1 bg-black flex items-center justify-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {store.videoUrl ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={store.videoUrl}
                  controls
                  className="max-w-full max-h-full"
                >
                  {/* WebVTT Subtitle Track — native browser rendering ไม่ดัน layout */}
                  {vttUrl && (
                    <track
                      ref={trackRef}
                      kind="subtitles"
                      src={vttUrl}
                      srcLang="th"
                      label="ไทย"
                      default
                    />
                  )}
                </video>
              </div>
            ) : (
              <div className="text-center text-white/60">
                <p className="text-4xl mb-4">🎬</p>
                <p>ลากวิดีโอมาวางหรือกดปุ่มเพื่อเลือกไฟล์</p>
              </div>
            )}

            {/* Processing overlay */}
            {store.isProcessing && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <div className="text-white text-center">
                  <div className="flex gap-1 justify-center mb-4">
                    {[0, 0.2, 0.4, 0.6, 0.8].map((d, i) => (
                      <div key={i} className="w-2 bg-primary rounded-full wave-bar" style={{ animationDelay: `${d}s` }} />
                    ))}
                  </div>
                  <p className="mb-2">กำลังถอดความเสียง {store.processingProgress}%</p>
                  <div className="w-48 h-1.5 bg-white/20 rounded-full mx-auto overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${store.processingProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Subtitle List */}
        <div className="w-80 border-l border-border bg-white flex flex-col">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm mb-2">ซับไตเติล ({store.subtitles.length})</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={subtitleText}
                onChange={(e) => setSubtitleText(e.target.value)}
                placeholder="พิมพ์ข้อความ..."
                className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addSubtitle()}
              />
              <Button size="sm" onClick={addSubtitle}>+</Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {store.subtitles.length === 0 ? (
              <div className="p-4 text-center text-text-secondary text-sm">
                {store.videoUrl ? (
                  <div>
                    <p className="mb-3">กดปุ่มด้านล่างเพื่อถอดความอัตโนมัติ</p>
                    <Button size="sm" onClick={handleTranscribe} loading={store.isProcessing}>
                      🎤 ถอดเสียงเป็น Subtitle
                    </Button>
                  </div>
                ) : (
                  <p>ยังไม่มีซับไตเติล</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {store.subtitles.map((sub, i) => (
                  <div
                    key={sub.id}
                    className={`p-3 cursor-pointer hover:bg-surface text-sm ${
                      store.selectedSubtitleId === sub.id ? 'bg-primary-light' : ''
                    }`}
                    onClick={() => {
                      store.selectSubtitle(sub.id);
                      if (videoRef.current) videoRef.current.currentTime = sub.start;
                    }}
                  >
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>#{i + 1}</span>
                      <span>{sub.start.toFixed(1)}s → {sub.end.toFixed(1)}s</span>
                    </div>
                    <p className="line-clamp-2">{sub.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
