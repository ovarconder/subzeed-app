'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { useSubtitleStore } from '@/lib/store/subtitle-store';
import { useToast } from '@/components/ui/toaster';
import { SubtitleItem } from '@/components/studio/subtitle-item';
import { SubtitleSettingsBar } from '@/components/studio/subtitle-settings-bar';
import { SubtitleCanvasOverlay } from '@/components/studio/subtitle-canvas-overlay';
import { SegmentStyleEditor } from '@/components/studio/segment-style-editor';
import { renderVideoWithSubtitles, downloadVideoBlob, EXPORT_FORMATS, QUALITY_PRESETS, supportsHardwareAccel } from '@/lib/video-renderer';
import type { ExportFormat, QualityPreset } from '@/lib/video-renderer';
import { loadVideoLocally } from '@/lib/local-video-storage';
import type { Project, SubtitleEntry, TextSegment } from '@/lib/types';
import { textToSegments } from '@/lib/types';

export default function StudioEditPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabase = createClient();
  const { addToast } = useToast();
  const store = useSubtitleStore();
  const [loading, setLoading] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [selectedFontFamily, setSelectedFontFamily] = useState('Arial');
  const [selectedFontSize, setSelectedFontSize] = useState(20);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [exportQuality, setExportQuality] = useState<QualityPreset>('high');
  const [useHardwareAccel, setUseHardwareAccel] = useState(supportsHardwareAccel());
  const [gifMaxWidth, setGifMaxWidth] = useState(480);
  const [showStyleEditor, setShowStyleEditor] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vttUrlRef = useRef<string | null>(null);

  // ─── หา subtitle ที่กำลังเลือก ─────────────────────
  const selectedSub = store.subtitles.find(s => s.id === store.selectedSubtitleId) ?? null;

  // ─── โหลด Project + วิดีโอจาก IndexedDB ─────────────
  useEffect(() => {
    const fetchProject = async () => {
      const result: { data: Project | null } = await supabase
        .from('projects')
        .select('*')
        .eq('id', params.id)
        .single();

      if (!result.data) {
        addToast('ไม่พบโปรเจกต์', 'error');
        router.push('/dashboard');
        setLoading(false);
        return;
      }

      // แปลง subtitle ที่มีอยู่ให้มี segments (backward compat)
      const migratedSubtitles = (result.data.subtitles || []).map((sub: any) => {
        if (!sub.segments || sub.segments.length === 0) {
          return { ...sub, segments: textToSegments(sub.id, sub.text) };
        }
        return sub;
      });
      result.data.subtitles = migratedSubtitles;

      store.setCurrentProject(result.data);

      // โหลดวิดีโอจาก IndexedDB
      const localVideo = await loadVideoLocally(result.data.id);
      if (localVideo) {
        store.setVideoUrl(localVideo.videoUrl);
        const mockFile = new File([], localVideo.fileName, { type: 'video/mp4' });
        Object.defineProperty(mockFile, 'size', { value: localVideo.fileSize });
        store.setVideoFile(mockFile);
        setVideoReady(true);
      } else {
        console.warn('[StudioEdit] No local video found for:', params.id);
      }

      setLoading(false);
    };
    fetchProject();
  }, [params.id]);

  // ─── Sync video time with store ──────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      store.setCurrentTime(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);

  // ─── Export Video ────────────────────────────────────
  const handleExportVideo = async () => {
    if (!store.videoUrl || store.subtitles.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      const blob = await renderVideoWithSubtitles(
        store.videoUrl, store.subtitles,
        {
          fontFamily: selectedFontFamily, fontSize: selectedFontSize, y_offset: 80,
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
      const base = store.videoFile?.name?.replace(/\.[^.]+$/, '') || 'subzeed-video';
      downloadVideoBlob(blob, `${base}-subzeed.${exportFormat}`);
      addToast(`ดาวน์โหลด (${exportFormat.toUpperCase()})!`, 'success');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('FFmpeg') || msg.includes('ffmpeg')) {
        addToast(`⚠️ FFmpeg โหลดไม่สำเร็จ — ลองรีเฟรชหน้าหรือเปลี่ยนอินเทอร์เน็ต (${msg.slice(0, 80)})`, 'error');
      } else if (msg.includes('HTTP') || msg.includes('fetch')) {
        addToast(`⚠️ ไม่สามารถเข้าถึงไฟล์วิดีโอ — ลองเลือกวิดีโอใหม่`, 'error');
      } else {
        addToast(`ส่งออกไม่สำเร็จ: ${msg.slice(0, 120)}`, 'error');
      }
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // ─── Save ────────────────────────────────────────────
  const handleSave = async () => {
    if (!user || !store.currentProject) return;
    const { error } = await supabase
      .from('projects')
      .update({
        subtitles: store.subtitles,
        title: store.currentProject.title,
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.currentProject.id);
    addToast(error ? 'บันทึกไม่สำเร็จ' : 'บันทึกสำเร็จ ✅', error ? 'error' : 'success');
  };

  // ─── Handle segment change ─────────────────────────
  const handleSegmentsChange = (segments: TextSegment[]) => {
    if (!selectedSub) return;
    const text = segments.map(s => s.text).join('');
    store.updateSubtitle(selectedSub.id, { segments, text });
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="skeleton h-8 w-32 rounded" />
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 flex">
        {/* Video Area */}
        <div className="flex-1 flex flex-col">
          <div className="border-b border-border bg-surface px-4 py-2 flex items-center gap-3">
            <span className="font-medium text-sm truncate">{store.currentProject?.title}</span>
            <Button size="sm" variant="outline" onClick={handleSave}>💾 บันทึก</Button>
            <Button size="sm" variant="outline" onClick={() => router.push('/dashboard')}>← กลับ</Button>
            <div className="ml-auto" />
          </div>

          {store.subtitles.length > 0 && (
            <SubtitleSettingsBar
              tier={profile?.tier || 'free'}
              fontFamily={selectedFontFamily}
              fontSize={selectedFontSize}
              onFontFamilyChange={setSelectedFontFamily}
              onFontSizeChange={setSelectedFontSize}
            />
          )}

          <div className="flex-1 bg-black flex items-center justify-center relative">
            {store.videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={store.videoUrl}
                  controls
                  className="max-w-full max-h-full"
                />
                {/* Canvas Overlay for styled subtitles */}
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                />
                <SubtitleCanvasOverlay
                  videoRef={videoRef}
                  canvasRef={canvasRef}
                  fontFamily={selectedFontFamily}
                  fontSize={selectedFontSize}
                  tier={profile?.tier || 'free'}
                />
              </>
            ) : (
              <div className="text-white/60 text-center">
                <p className="text-4xl mb-2">📝</p>
                <p>โปรเจกต์โหลดแล้ว • {store.subtitles.length} รายการ</p>
                {!store.videoUrl && (
                  <p className="text-sm mt-2 text-warning/70">⚠️ ไม่พบไฟล์วิดีโอในเครื่อง กรุณาเลือกวิดีโอใหม่</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l border-border bg-white flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">ซับไตเติล ({store.subtitles.length})</h3>
            {selectedSub && (
              <button
                onClick={() => setShowStyleEditor(!showStyleEditor)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  showStyleEditor ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-surface/80'
                }`}
              >
                🎨 Style
              </button>
            )}
          </div>

          {/* Style Editor Panel (เมื่อเลือก subtitle และกด Style) */}
          {showStyleEditor && selectedSub && (
            <div className="border-b border-border">
              <SegmentStyleEditor
                segments={selectedSub.segments || textToSegments(selectedSub.id, selectedSub.text)}
                onChange={handleSegmentsChange}
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {store.subtitles.length === 0 ? (
              <div className="p-4 text-center text-text-secondary text-sm">ยังไม่มีซับไตเติล</div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {store.subtitles.map((sub, i) => (
                    <SubtitleItem
                      key={sub.id}
                      sub={sub}
                      index={i}
                      isSelected={store.selectedSubtitleId === sub.id}
                      videoRef={videoRef}
                      onSelect={() => {
                        store.selectSubtitle(sub.id);
                        if (videoRef.current) videoRef.current.currentTime = sub.start;
                      }}
                      onUpdate={(updates) => { store.updateSubtitle(sub.id, updates); }}
                      onDelete={() => { store.removeSubtitle(sub.id); }}
                    />
                  ))}
                </div>

                {/* Export */}
                <div className="p-3 border-t border-border space-y-2">
                  {isExporting ? (
                    <div className="text-center">
                      <p className="text-xs text-text-secondary mb-1">กำลังเรนเดอร์ {exportProgress}%</p>
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${exportProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <>
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

                      {supportsHardwareAccel() && exportFormat !== 'gif' && (
                        <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useHardwareAccel}
                            onChange={(e) => setUseHardwareAccel(e.target.checked)}
                            className="accent-primary"
                          />
                          🚀 เร่งด้วย GPU
                        </label>
                      )}

                      <Button size="sm" variant="primary" className="w-full" onClick={handleExportVideo}>
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
