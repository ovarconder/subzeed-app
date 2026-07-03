'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { SubtitleItem } from '@/components/studio/subtitle-item';
import { SubtitleSettingsBar } from '@/components/studio/subtitle-settings-bar';
import { SubtitleCanvasOverlay } from '@/components/studio/subtitle-canvas-overlay';
import { InteractiveCanvasOverlay } from '@/components/studio/interactive-canvas-overlay';
import { renderVideoWithSubtitles, downloadVideoBlob, EXPORT_FORMATS, QUALITY_PRESETS, supportsHardwareAccel } from '@/lib/video-renderer';
import type { ExportFormat, QualityPreset } from '@/lib/video-renderer';
import { createClient } from '@/lib/supabase/client';
import { useVideoStorage } from '@/lib/hooks/use-video-storage';
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

/**
 * inject WebVTT track เข้า video โดยตรงด้วย DOM API
 * ไม่ใช้ React state/JSX conditional → video ไม่ถูก mount ใหม่
 */
function injectVttTrack(video: HTMLVideoElement | null, vttUrl: string) {
  if (!video) return;

  // ลบ track เก่า
  const oldTracks = video.querySelectorAll('track');
  oldTracks.forEach((t) => {
    if (t.src) URL.revokeObjectURL(t.src);
    t.remove();
  });

  // สร้าง track ใหม่
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.src = vttUrl;
  track.srclang = 'th';
  track.label = 'ไทย';
  track.default = true;
  video.appendChild(track);

  // trigger browser ให้ reload track
  track.addEventListener('load', () => {
    const textTrack = track.track;
    if (textTrack) {
      textTrack.mode = 'showing';
    }
  });
}

export default function StudioPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuth();
  const { addToast } = useToast();
  const store = useSubtitleStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const interactiveCanvasRef = useRef<HTMLCanvasElement>(null);
  const vttUrlRef = useRef<string | null>(null);

  // ─── Fetch profile จาก `/api/profile` โดยตรง (ไม่พึ่ง useAuth cache) ──
  const [studioProfile, setStudioProfile] = useState<{
    tier: string;
    quota_minutes_total: number;
    quota_minutes_used: number;
    is_super_admin: boolean;
  } | null>(null);

  useEffect(() => {
    if (!user) { setStudioProfile(null); return; }
    fetch(api('/api/profile'), { headers: { 'x-user-id': user.id } })
      .then(r => r.json())
      .then(d => {
        if (d.profile) setStudioProfile(d.profile);
      })
      .catch(() => {});
  }, [user]);

  // Local video storage (IndexedDB)
  const { storeVideo, loadVideo, removeVideo } = useVideoStorage();
  const [subtitleText, setSubtitleText] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [brandTerms, setBrandTerms] = useState('');
  const [enableAiVocab, setEnableAiVocab] = useState(false);
  const [enableAiSmart, setEnableAiSmart] = useState(false); // AI แปลภาษา
  const [aiSmartLanguage, setAiSmartLanguage] = useState('en'); // ภาษาเป้าหมาย
  const [showWatermarkPreview, setShowWatermarkPreview] = useState(false);

  // ---- Subtitle Display Settings ----
  const [selectedFontFamily, setSelectedFontFamily] = useState('Arial');
  const [selectedFontSize, setSelectedFontSize] = useState(20);

  // -- Export Video State --
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [exportQuality, setExportQuality] = useState<QualityPreset>('high');
  const [useHardwareAccel, setUseHardwareAccel] = useState(supportsHardwareAccel());
  const [gifMaxWidth, setGifMaxWidth] = useState(480);

  // Check quota (จาก studioProfile ที่ fetch เอง ไม่พึ่ง useAuth cache)
  const p = studioProfile;
  const tierConfig = p ? TIER_CONFIGS[p.tier as keyof typeof TIER_CONFIGS] : TIER_CONFIGS.free;
  const isFree = p?.tier === 'free';
  const isPremiumOrUp = p?.tier === 'premium' || p?.tier === 'business_starter' || p?.tier === 'business_pro' || p?.tier === 'unlimited';
  const hasAiSmart = p ? TIER_CONFIGS[p.tier as keyof typeof TIER_CONFIGS]?.aiVocabulary : false;
  const hasAiVocab = p ? TIER_CONFIGS[p.tier as keyof typeof TIER_CONFIGS]?.aiVocabulary : false;
  const isUnlimited = p?.tier === 'unlimited';
  const quotaLeft = isUnlimited ? Infinity : (p ? (p.quota_minutes_total ?? 0) - (p.quota_minutes_used ?? 0) : 0);

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
    tempVideo.onloadedmetadata = async () => {
      const dur = tempVideo.duration;
      const maxDur = isUnlimited ? Infinity : tierConfig.maxVideoMinutes * 60;
      if (dur > maxDur) {
        addToast(`วิดีโอความยาวสูงสุด ${tierConfig.maxVideoMinutes} นาที สำหรับแพ็กเกจ ${tierConfig.name}`, 'error');
        URL.revokeObjectURL(tempVideo.src);
        return;
      }
      setVideoDuration(dur);

      // ✅ เก็บวิดีโอลง IndexedDB (local) โดยใช้ projectId ชั่วคราว
      const tempProjectId = `project_${Date.now()}`;
      await storeVideo(tempProjectId, file);
      store.setCurrentProject({
        id: tempProjectId,
        user_id: user?.id || '',
        title: file.name,
        video_url: null,
        duration_seconds: dur,
        subtitles: [],
        is_client_review_enabled: false,
        review_token: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      URL.revokeObjectURL(tempVideo.src);
    };
    tempVideo.src = URL.createObjectURL(file);
  }, [tierConfig, addToast, storeVideo, user]);

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
    if (!isUnlimited && estimatedMinutes > quotaLeft) {
      addToast(`โควตาไม่เพียงพอ ต้องการ ${estimatedMinutes} นาที แต่มี ${quotaLeft === Infinity ? 'ไม่จำกัด' : quotaLeft.toFixed(1)} นาที`, 'error');
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
      const newSubtitles: SubtitleEntry[] = data.subtitles.map((seg: any) => {
        const id = seg.id;
        // ถ้า backend ส่ง segments มาแล้วใช้เลย ถ้าไม่ก็สร้างใหม่
        if (seg.segments && seg.segments.length > 0) {
          return {
            id,
            start: seg.start,
            end: seg.end,
            text: seg.text,
            segments: seg.segments,
            position: seg.position || 'bottom',
            y_offset: seg.y_offset ?? 90,
          };
        }
        // Fallback: สร้าง segments ปกติ
        return {
          id,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          segments: [{
            id: `${id}-seg-0`,
            text: seg.text,
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
          position: seg.position || 'bottom',
          y_offset: seg.y_offset ?? 90,
        };
      });

      // ✅ ไล่ลบ strokeActive อีกครั้ง เผื่อ backend ส่ง segments ที่มี strokeActive = true มาด้วย
      const cleaned = newSubtitles.map(sub => ({
        ...sub,
        segments: sub.segments?.map(seg => ({
          ...seg,
          style: { ...seg.style, strokeActive: false },
        })),
      }));

      store.setSubtitles(cleaned);
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

  // ---- Refresh subtitle display on video (ใช้ canvas overlay แทน VTT) ----
  const refreshVttTrack = useCallback(() => {
    // Canvas overlay จะ re-render ทุก frame ผ่าน requestAnimationFrame
    // ไม่ต้อง inject VTT track อีกต่อไป
  }, []);

  // ---- ถอดคำพูดเฉพาะ subtitle ที่เลือก (ช่วงเวลาที่เลือก) ----
  const handleRetranscribeSelection = async () => {
    const selectedId = store.selectedSubtitleId;
    if (!selectedId) {
      addToast('กรุณาเลือก subtitle ที่ต้องการถอดใหม่ก่อน', 'warning');
      return;
    }
    if (!store.videoFile || !user) {
      addToast('ไม่มีวิดีโอหรือไม่ได้เข้าสู่ระบบ', 'warning');
      return;
    }

    const selectedSub = store.subtitles.find(s => s.id === selectedId);
    if (!selectedSub) return;

    // เลือก subtitle ที่ overlap กับช่วงนี้ (รวมก่อน/หลังเล็กน้อย)
    const startTime = Math.max(0, selectedSub.start - 1);
    const endTime = selectedSub.end + 1;

    store.setIsProcessing(true);
    store.setProcessingProgress(0);

    try {
      const result = await extractAudio(
        store.videoFile,
        {
          targetSampleRate: 16000,
          normalizeAudio: true,
        },
        (pct) => store.setProcessingProgress(pct)
      );

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
      // ✅ ส่ง time range ให้ backend รู้ว่าต้องถอดความเฉพาะช่วงนี้
      formData.append('timeStart', String(startTime));
      formData.append('timeEnd', String(endTime));

      const response = await fetch(api('/api/transcribe-and-save'), {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        addToast(data.error || 'ถอดความไม่สำเร็จ', 'error');
        return;
      }

      // แทนที่ subtitle ในช่วงเวลาที่เลือกด้วยของใหม่
      const newSubs = data.subtitles.map((seg: any) => {
        const id = seg.id;
        if (seg.segments && seg.segments.length > 0) {
          return { id, start: seg.start, end: seg.end, text: seg.text, segments: seg.segments, position: seg.position || 'bottom', y_offset: seg.y_offset ?? 90 };
        }
        return {
          id, start: seg.start, end: seg.end, text: seg.text,
          segments: [{ id: `${id}-seg-0`, text: seg.text, style: { color: '#FFFFFF', opacity: 1, strokeActive: false, shadowActive: false, strokeColor: '#000000', strokeWidth: 2, strokeOpacity: 1, shadowColor: '#000000', shadowOpacity: 0.5, shadowOffsetX: 0, shadowOffsetY: 2, shadowBlur: 4, shadowAngle: 0, fontWeight: 'normal' as const } }],
          position: seg.position || 'bottom', y_offset: seg.y_offset ?? 90,
        };
      });

      // ✅ ลบ strokeActive ที่ backend ส่งมา
      const cleaned = newSubs.map((sub: SubtitleEntry) => ({
        ...sub,
        segments: sub.segments?.map(seg => ({
          ...seg,
          style: { ...seg.style, strokeActive: false },
        })),
      }));

      // ลบ subtitle เก่าที่ overlap
      const kept = store.subtitles.filter(s => s.end < startTime || s.start > endTime);
      store.setSubtitles([...kept, ...cleaned].sort((a: SubtitleEntry, b: SubtitleEntry) => a.start - b.start));

      addToast(`ถอดคำพูดช่วงนี้ใหม่แล้ว! ${newSubs.length} รายการ`, 'success');
    } catch (err: any) {
      addToast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally {
      store.setIsProcessing(false);
      store.setProcessingProgress(0);
    }
  };

  // ---- Export Video with Hardsub ----
  const handleExportVideo = async () => {
    if (!store.videoUrl || store.subtitles.length === 0) return;

    setIsExporting(true);
    setExportProgress(0);

    try {
      const blob = await renderVideoWithSubtitles(
        store.videoUrl,
        store.subtitles,
        {
          fontFamily: selectedFontFamily,
          fontSize: selectedFontSize,
          y_offset: 90,
          format: exportFormat,
          position: 'bottom',
          quality: exportQuality,
          useHardwareAccel,
          gifMaxWidth,
          gifFrameSkip: exportFormat === 'gif' ? 1 : 0,
          fps: exportFormat === 'gif' ? 10 : 30,
        },
        (pct) => setExportProgress(pct),
      );

      const baseName = store.videoFile?.name?.replace(/\.[^.]+$/, '') || 'subzeed-video';
      downloadVideoBlob(blob, `${baseName}-subzeed.${exportFormat}`);
      addToast(`ดาวน์โหลดวิดีโอ (${exportFormat.toUpperCase()}) ที่ฝังซับแล้ว!`, 'success');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('FFmpeg') || msg.includes('ffmpeg')) {
        addToast(`⚠️ FFmpeg โหลดไม่สำเร็จ — ลองรีเฟรชหน้าหรือเปลี่ยนอินเทอร์เน็ต`, 'error');
      } else if (msg.includes('HTTP') || msg.includes('fetch')) {
        addToast(`⚠️ ไม่สามารถเข้าถึงไฟล์วิดีโอ — ลองเลือกวิดีโอใหม่`, 'error');
      } else {
        addToast(`ส่งออกวิดีโอไม่สำเร็จ: ${msg.slice(0, 120)}`, 'error');
      }
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // ---- Subtitle CRUD ----
  const addSubtitle = () => {
    const ct = videoRef.current?.currentTime || 0;
    const id = `sub-${uid()}`;
    const text = subtitleText || '...';
    const newSub: SubtitleEntry = {
      id,
      start: Math.round(ct * 10) / 10,
      end: Math.round((ct + 3) * 10) / 10,
      text,
      segments: [{
        id: `${id}-seg-0`,
        text,
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
      if (vttUrlRef.current) URL.revokeObjectURL(vttUrlRef.current);
    };
  }, []);

  // ---- Canvas Subtitle Overlay ----
  // ใช้ canvasOverlayRef ที่ประกาศไว้แล้วข้างบน (บรรทัด 87)

  return (
    <>
      <Navbar />
      <main className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          {/* Toolbar + Settings Bar */}
          <div className="border-b border-border bg-surface shrink-0">
            {/* Toolbar row */}
            <div className="px-4 py-2 flex items-center gap-3">
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
              {isUnlimited ? (
                <span className="text-xs text-success font-medium">♾️ ไม่จำกัด</span>
              ) : (
                <>{quotaLeft.toFixed(1)} / {p?.quota_minutes_total || 20} นาที</>
              )}
            </div>
          </div>

            {/* Subtitle Display Settings Bar (อยู่ใน toolbar section = ไม่ดัน video) */}
            {store.subtitles.length > 0 && (
              <SubtitleSettingsBar
                tier={(p?.tier || 'free') as any}
                fontFamily={selectedFontFamily}
                fontSize={selectedFontSize}
                onFontFamilyChange={setSelectedFontFamily}
                onFontSizeChange={setSelectedFontSize}
              />
            )}
          </div>

          {/* Video + Subtitles + Watermark Area */}
          <div
            className="relative flex-1 min-h-0 bg-black flex items-start justify-center overflow-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {store.videoUrl ? (
              <div className="relative w-full h-full flex items-start justify-center">
                <video
                  ref={videoRef}
                  src={store.videoUrl}
                  controls
                  className="max-w-full max-h-full object-contain"
                />
                {/* Canvas subtitle overlay — static */}
                <canvas
                  ref={canvasOverlayRef}
                  className="absolute pointer-events-none"
                />
                <SubtitleCanvasOverlay
                  videoRef={videoRef}
                  canvasRef={canvasOverlayRef}
                  fontFamily={selectedFontFamily}
                  fontSize={selectedFontSize}
                  tier={(p?.tier || 'free') as any}
                />
                {/* 🆕 Interactive Canvas — ลากย้าย Y, ดับเบิลคลิกแก้ไข, multi-segment (Premium+) */}
                <canvas
                  ref={interactiveCanvasRef}
                  className="absolute"
                />
                <InteractiveCanvasOverlay
                  videoRef={videoRef}
                  canvasRef={interactiveCanvasRef}
                  fontFamily={selectedFontFamily}
                  fontSize={selectedFontSize}
                  tier={(p?.tier || 'free') as any}
                />
                {/* Only VTT fallback (ไม่ต้อง inject VTT แล้ว — ใช้ canvas แทน) */}
              </div>
            ) : (
              <div className="text-center text-white/60 pt-12">
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
        <div className="w-80 border-l border-border bg-white flex flex-col min-h-0">
          <div className="p-4 border-b border-border shrink-0">
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
                      🎤 ถอดเสียงเป็นซับไตเติล
                    </Button>
                  </div>
                ) : (
                  <p>ยังไม่มีซับไตเติล</p>
                )}
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 bg-white border-b border-border px-3 py-2 flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleTranscribe} loading={store.isProcessing}>
                    🔄 ถอดคำพูดอีกครั้ง
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {store.subtitles.map((sub, i) => (
                    <SubtitleItem
                      key={sub.id}
                      sub={sub}
                      index={i}
                      isSelected={store.selectedSubtitleId === sub.id}
                      videoRef={videoRef}
                      fontFamily={selectedFontFamily}
                      fontSize={selectedFontSize}
                      onRetranscribeSelection={(subId) => {
                        store.selectSubtitle(subId);
                        handleRetranscribeSelection();
                      }}
                      onSelect={() => {
                        store.selectSubtitle(sub.id);
                        if (videoRef.current) videoRef.current.currentTime = sub.start;
                      }}
                      onUpdate={(updates) => {
                        store.updateSubtitle(sub.id, updates);
                        refreshVttTrack();
                      }}
                      onDelete={() => {
                        store.removeSubtitle(sub.id);
                        refreshVttTrack();
                      }}
                    />
                  ))}
                </div>

                {/* Export Video Button */}
                <div className="p-3 border-t border-border space-y-2">
                  {isExporting ? (
                    <div className="text-center">
                      <p className="text-xs text-text-secondary mb-1">กำลังเรนเดอร์วิดีโอ {exportProgress}%</p>
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${exportProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Format */}
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-text-secondary font-medium w-14">Format:</label>
                        <select
                          value={exportFormat}
                          onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                          className="flex-1 rounded border border-border px-2 py-1 text-xs bg-white"
                        >
                          {EXPORT_FORMATS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Quality (ไม่แสดงสำหรับ GIF เพราะ quality ต่างกัน) */}
                      {exportFormat !== 'gif' && (
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-text-secondary font-medium w-14">คุณภาพ:</label>
                          <select
                            value={exportQuality}
                            onChange={(e) => setExportQuality(e.target.value as QualityPreset)}
                            className="flex-1 rounded border border-border px-2 py-1 text-xs bg-white"
                          >
                            {QUALITY_PRESETS.map((q) => (
                              <option key={q.value} value={q.value}>{q.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* GIF options */}
                      {exportFormat === 'gif' && (
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-text-secondary font-medium w-14">ความกว้าง:</label>
                          <input
                            type="number"
                            min={120}
                            max={1920}
                            step={10}
                            value={gifMaxWidth}
                            onChange={(e) => setGifMaxWidth(Number(e.target.value))}
                            className="flex-1 rounded border border-border px-2 py-1 text-xs bg-white"
                          />
                          <span className="text-[10px] text-text-secondary">px</span>
                        </div>
                      )}

                      {/* Hardware acceleration (เฉพาะ Mac) */}
                      {supportsHardwareAccel() && exportFormat !== 'gif' && (
                        <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useHardwareAccel}
                            onChange={(e) => setUseHardwareAccel(e.target.checked)}
                            className="accent-primary"
                          />
                          🚀 เร่งด้วย GPU (VideoToolbox)
                        </label>
                      )}

                      <Button
                        size="sm"
                        variant="primary"
                        className="w-full"
                        onClick={handleExportVideo}
                      >
                        ⬇️ ดาวน์โหลด ({exportFormat.toUpperCase()})
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
