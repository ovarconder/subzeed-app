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
import type { SubtitleEntry } from '@/lib/types';

// Helper: generate unique ID
const uid = () => Math.random().toString(36).slice(2, 9);

export default function StudioPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, profile } = useAuth();
  const { addToast } = useToast();
  const store = useSubtitleStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subtitleText, setSubtitleText] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);

  // Check quota
  const tierConfig = profile ? TIER_CONFIGS[profile.tier] : TIER_CONFIGS.free;
  const quotaLeft = profile ? profile.quota_minutes_total - profile.quota_minutes_used : 0;

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
  }, [tierConfig]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ---- Transcription (STT) ----
  const handleTranscribe = async () => {
    if (!store.videoFile || !user) return;

    // Check quota
    const estimatedMinutes = Math.ceil(videoDuration / 60);
    if (estimatedMinutes > quotaLeft) {
      addToast('โควตาไม่เพียงพอ กรุณาเติมเงิน', 'error');
      return;
    }

    store.setIsProcessing(true);
    store.setProcessingProgress(0);

    try {
      // Audio extraction via Web Audio API
      const audioCtx = new AudioContext();
      const arrayBuffer = await store.videoFile.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Convert to mono WAV (simplified)
      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const length = audioBuffer.length;
      const channelData = audioBuffer.getChannelData(0); // Take left channel
      
      // Downsample to 16kHz for Whisper
      const targetSampleRate = 16000;
      const ratio = sampleRate / targetSampleRate;
      const newLength = Math.floor(length / ratio);
      const resampled = new Float32Array(newLength);
      
      for (let i = 0; i < newLength; i++) {
        const srcIdx = Math.floor(i * ratio);
        resampled[i] = channelData[srcIdx] || 0;
      }

      // Encode as WAV
      const wavBuffer = encodeWav(resampled, targetSampleRate);
      const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });

      // Send to API
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.wav');
      formData.append('userId', user.id);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const { segments } = await response.json();

      // Convert segments to subtitles
      const newSubtitles: SubtitleEntry[] = segments.map((seg: any, i: number) => ({
        id: `sub-${uid()}`,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        position: 'bottom' as const,
        y_offset: 90,
      }));

      store.setSubtitles(newSubtitles);
      addToast(`ถอดความสำเร็จ! ${newSubtitles.length} รายการ`, 'success');
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
    if (!store.videoRef?.current) return;
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
                  ⬇️ โหลด .srt
                </Button>
              </>
            )}
            <div className="ml-auto text-sm text-text-secondary">
              {quotaLeft.toFixed(1)} / {profile?.quota_minutes_total || 20} นาที
            </div>
          </div>

          {/* Video + Subtitles Area */}
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
                />
                {/* Subtitle Overlay */}
                {currentSub && (
                  <div
                    className="subtitle-overlay subtitle-animate"
                    style={{ bottom: `${currentSub.y_offset}%` }}
                  >
                    <span
                      className="inline-block bg-black/60 px-4 py-2 rounded-lg text-white text-xl"
                    >
                      {currentSub.text}
                    </span>
                  </div>
                )}
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
                  <p>กำลังถอดความเสียง...</p>
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
                      🎤 ถอดความด้วย AI
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

// ---- WAV Encoder ----
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}
