'use client';

import { useEffect, useState, useRef } from 'react';
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
import type { Project, SubtitleEntry, TextSegment, SubtitleDisplayStyle } from '@/lib/types';
import { textToSegments, DEFAULT_DISPLAY_STYLE } from '@/lib/types';

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
  const [exportRangeStart, setExportRangeStart] = useState<number>(0);
  const [exportRangeEnd, setExportRangeEnd] = useState<number>(0);
  const [useTimeRange, setUseTimeRange] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // subtitle ที่กำลังเลือก
  const selectedSub = store.subtitles.find(s => s.id === store.selectedSubtitleId) ?? null;

  // ─── โหลด Project + วิดีโอ ─────────────────────────
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

      const migratedSubtitles = (result.data.subtitles || []).map((sub: any) => {
        if (!sub.segments || sub.segments.length === 0) {
          return { ...sub, segments: textToSegments(sub.id, sub.text) };
        }
        return sub;
      });
      result.data.subtitles = migratedSubtitles;

      store.setCurrentProject(result.data);

      const localVideo = await loadVideoLocally(result.data.id);
      if (localVideo) {
        store.setVideoUrl(localVideo.videoUrl);
        const mockFile = new File([], localVideo.fileName, { type: 'video/mp4' });
        Object.defineProperty(mockFile, 'size', { value: localVideo.fileSize });
        store.setVideoFile(mockFile);
        setVideoReady(true);
        // default 5 นาที
        setExportRangeEnd(300);
      } else {
        console.warn('[StudioEdit] No local video found for:', params.id);
      }
      setLoading(false);
    };
    fetchProject();
  }, [params.id]);

  // ─── Sync video time ───────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => store.setCurrentTime(video.currentTime);
    video.addEventListener('timeupdate', handler);
    return () => video.removeEventListener('timeupdate', handler);
  }, []);

  // ─── อัปเดต export range ตาม subtitle ที่เลือก ────
  useEffect(() => {
    if (selectedSub && useTimeRange) {
      setExportRangeStart(Math.floor(selectedSub.start));
      setExportRangeEnd(Math.ceil(selectedSub.end));
    }
  }, [selectedSub, useTimeRange]);

  // ─── Export ────────────────────────────────────────
  const handleExportVideo = async (rangeOnly = false) => {
    if (!store.videoUrl || store.subtitles.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      let subsToExport = store.subtitles;
      let outputLabel = '';
      if (rangeOnly && useTimeRange && exportRangeEnd > exportRangeStart) {
        subsToExport = store.subtitles.filter(
          s => s.start >= exportRangeStart && s.end <= exportRangeEnd,
        );
        if (subsToExport.length === 0) {
          addToast('ไม่มีซับในช่วงเวลาที่เลือก', 'warning');
          setIsExporting(false);
          return;
        }
        outputLabel = `-${exportRangeStart}s-${exportRangeEnd}s`;
      }
      const blob = await renderVideoWithSubtitles(
        store.videoUrl, subsToExport,
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
          trimStart: rangeOnly && useTimeRange ? exportRangeStart : undefined,
          trimEnd: rangeOnly && useTimeRange ? exportRangeEnd : undefined,
        },
        (pct) => setExportProgress(pct),
      );
      const base = store.videoFile?.name?.replace(/\.[^.]+$/, '') || 'subzeed-video';
      downloadVideoBlob(blob, `${base}${outputLabel}-subzeed.${exportFormat}`);
      addToast(`ดาวน์โหลด (${exportFormat.toUpperCase()})!`, 'success');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('FFmpeg') || msg.includes('ffmpeg')) {
        addToast('⚠️ FFmpeg โหลดไม่สำเร็จ — ลองรีเฟรชหน้าหรือเปลี่ยนอินเทอร์เน็ต', 'error');
      } else if (msg.includes('HTTP') || msg.includes('fetch')) {
        addToast('⚠️ ไม่สามารถเข้าถึงไฟล์วิดีโอ — ลองเลือกวิดีโอใหม่', 'error');
      } else {
        addToast(`ส่งออกไม่สำเร็จ: ${msg.slice(0, 120)}`, 'error');
      }
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // ─── Save ──────────────────────────────────────────
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

  // ─── Segment style change ─────────────────────────
  const handleSegmentsChange = (segments: TextSegment[]) => {
    if (!selectedSub) return;
    const text = segments.map(s => s.text).join('');
    store.updateSubtitle(selectedSub.id, { segments, text });
  };

  // ─── Display style change ─────────────────────────
  const handleDisplayStyleChange = (style: SubtitleDisplayStyle) => {
    if (!selectedSub) return;
    store.updateSubtitle(selectedSub.id, { displayStyle: style });
  };

  // ─── Position / Y-offset change ───────────────────
  const handlePositionChange = (position: 'bottom' | 'middle' | 'top', yOffset: number) => {
    if (!selectedSub) return;
    store.updateSubtitle(selectedSub.id, { position, y_offset: yOffset });
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return `${m}:${sec.padStart(4, '0')}`;
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
        {/* ─── Video Area ────────────────────────────── */}
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
                <video ref={videoRef} src={store.videoUrl} controls className="max-w-full max-h-full" />
                <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
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
                {!store.videoUrl && <p className="text-sm mt-2 text-warning/70">⚠️ ไม่พบไฟล์วิดีโอในเครื่อง</p>}
              </div>
            )}
          </div>
        </div>

        {/* ─── Sidebar ───────────────────────────────── */}
        <div className="w-80 border-l border-border bg-white flex flex-col">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm">ซับไตเติล ({store.subtitles.length})</h3>
          </div>

          {/* 🖌️ Style Panel — แสดงเมื่อเลือก subtitle */}
          {selectedSub && (
            <div className="border-b border-border bg-white">
              <details className="px-3 py-2" open>
                <summary className="text-[11px] font-semibold text-text-secondary cursor-pointer select-none mb-1">
                  🖌️ ตัวอักษร
                </summary>
                <SegmentStyleEditor
                  key={selectedSub.id}
                  segments={selectedSub.segments || textToSegments(selectedSub.id, selectedSub.text)}
                  onChange={handleSegmentsChange}
                />
              </details>
              <details className="px-3 py-2 border-t border-border" open>
                <summary className="text-[11px] font-semibold text-text-secondary cursor-pointer select-none mb-1">
                  🎬 กล่องซับไตเติล
                </summary>
                <SubtitleDisplayEditorCompact
                  sub={selectedSub}
                  onDisplayChange={handleDisplayStyleChange}
                  onPositionChange={handlePositionChange}
                />
              </details>
            </div>
          )}

          {/* ─── รายการซับไตเติล ─────────────────────── */}
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

                {/* ─── Export ──────────────────────────── */}
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
                        <label className="text-[10px] text-text-secondary font-medium w-12">Format:</label>
                        <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                          className="flex-1 rounded border border-border px-2 py-1 text-xs bg-white">
                          {EXPORT_FORMATS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
                        </select>
                      </div>
                      {exportFormat !== 'gif' && (
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-text-secondary font-medium w-12">คุณภาพ:</label>
                          <select value={exportQuality} onChange={(e) => setExportQuality(e.target.value as QualityPreset)}
                            className="flex-1 rounded border border-border px-2 py-1 text-xs bg-white">
                            {QUALITY_PRESETS.map((q) => (<option key={q.value} value={q.value}>{q.label}</option>))}
                          </select>
                        </div>
                      )}

                      <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={useTimeRange} onChange={(e) => setUseTimeRange(e.target.checked)}
                          className="accent-primary" />
                        ⏱️ ส่งออกเฉพาะช่วง
                      </label>

                      {useTimeRange && (
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} step={1}
                            value={exportRangeStart}
                            onChange={(e) => setExportRangeStart(Number(e.target.value))}
                            className="w-14 rounded border border-border px-1 py-0.5 text-[10px] bg-white" />
                          <span className="text-[10px] text-text-secondary">ถึง</span>
                          <input type="number" min={0} step={1}
                            value={exportRangeEnd}
                            onChange={(e) => setExportRangeEnd(Number(e.target.value))}
                            className="w-14 rounded border border-border px-1 py-0.5 text-[10px] bg-white" />
                          <span className="text-[10px] text-text-secondary">วิ</span>
                        </div>
                      )}

                      {useTimeRange && (
                        <Button size="sm" variant="primary" className="w-full"
                          onClick={() => handleExportVideo(true)}>
                          ⬇️ ดาวน์โหลดช่วง {fmt(exportRangeStart)}–{fmt(exportRangeEnd)}
                        </Button>
                      )}

                      <Button size="sm" variant="primary" className="w-full"
                        onClick={() => handleExportVideo(false)}>
                        ⬇️ ดาวน์โหลดทั้งคลิป ({exportFormat.toUpperCase()})
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

// ═══════════════════════════════════════════════════════════
// 🎬 SubtitleDisplayEditorCompact — ปรับ bg, padding, shadow, position
// ═══════════════════════════════════════════════════════════
function SubtitleDisplayEditorCompact({
  sub,
  onDisplayChange,
  onPositionChange,
}: {
  sub: SubtitleEntry;
  onDisplayChange: (style: SubtitleDisplayStyle) => void;
  onPositionChange: (position: 'bottom' | 'middle' | 'top', yOffset: number) => void;
}) {
  const style = sub.displayStyle ?? DEFAULT_DISPLAY_STYLE;
  const [posY, setPosY] = useState(sub.y_offset);
  const [position, setPosition] = useState(sub.position);

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] text-text-secondary font-medium block mb-0.5">ตำแหน่งแนวตั้ง</label>
        <div className="flex items-center gap-1">
          <input type="range" min={10} max={95} value={posY}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPosY(v);
              onPositionChange(position, v);
            }}
            className="flex-1 h-4 accent-primary" />
          <span className="text-[10px] text-text-secondary w-6">{posY}%</span>
        </div>
        <div className="flex gap-1 mt-1">
          {(['bottom', 'middle', 'top'] as const).map((pos) => (
            <button key={pos}
              onClick={() => {
                setPosition(pos);
                onPositionChange(pos, posY);
              }}
              className={`text-[9px] px-2 py-1 rounded transition-colors capitalize ${
                position === pos ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
              }`}>
              {pos === 'bottom' ? 'ล่าง' : pos === 'middle' ? 'กลาง' : 'บน'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] text-text-secondary block mb-0.5">สีพื้นหลัง</label>
          <div className="flex items-center gap-1">
            <input type="color" value={style.bgColor}
              onChange={(e) => onDisplayChange({ ...style, bgColor: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer border border-border" />
            <input type="text" value={style.bgColor}
              onChange={(e) => onDisplayChange({ ...style, bgColor: e.target.value })}
              className="flex-1 rounded border border-border px-1 py-0.5 text-[9px] bg-white font-mono" />
          </div>
        </div>
        <div>
          <label className="text-[9px] text-text-secondary block mb-0.5">ความทึบ BG</label>
          <div className="flex items-center gap-1">
            <input type="range" min={0} max={1} step={0.05} value={style.bgOpacity}
              onChange={(e) => onDisplayChange({ ...style, bgOpacity: Number(e.target.value) })}
              className="flex-1 h-4 accent-primary" />
            <span className="text-[8px] text-text-secondary w-6">{Math.round(style.bgOpacity * 100)}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] text-text-secondary block mb-0.5">มุมโค้ง</label>
          <input type="range" min={0} max={30} step={1} value={style.borderRadius}
            onChange={(e) => onDisplayChange({ ...style, borderRadius: Number(e.target.value) })}
            className="w-full h-4 accent-primary" />
          <span className="text-[9px] text-text-secondary">{style.borderRadius}px</span>
        </div>
        <div>
          <label className="text-[9px] text-text-secondary block mb-0.5">Padding Y</label>
          <input type="range" min={0} max={30} step={1} value={style.paddingY}
            onChange={(e) => onDisplayChange({ ...style, paddingY: Number(e.target.value) })}
            className="w-full h-4 accent-primary" />
          <span className="text-[9px] text-text-secondary">{style.paddingY}px</span>
        </div>
      </div>
      <div>
        <label className="text-[9px] text-text-secondary block mb-0.5">Padding X</label>
        <input type="range" min={0} max={40} step={1} value={style.paddingX}
          onChange={(e) => onDisplayChange({ ...style, paddingX: Number(e.target.value) })}
          className="w-full h-4 accent-primary" />
        <span className="text-[9px] text-text-secondary">{style.paddingX}px</span>
      </div>

      <details className="bg-surface/50 rounded p-1.5">
        <summary className="text-[10px] font-medium text-text-secondary cursor-pointer select-none">
          🌓 Box Shadow (เงากล่อง)
        </summary>
        <div className="mt-1.5 space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[8px] text-text-secondary block">Offset X</label>
              <input type="range" min={-20} max={20} step={1} value={style.boxShadow.offsetX}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, offsetX: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
            <div>
              <label className="text-[8px] text-text-secondary block">Offset Y</label>
              <input type="range" min={-20} max={20} step={1} value={style.boxShadow.offsetY}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, offsetY: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[8px] text-text-secondary block">Blur</label>
              <input type="range" min={0} max={30} step={1} value={style.boxShadow.blur}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, blur: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
            <div>
              <label className="text-[8px] text-text-secondary block">Spread</label>
              <input type="range" min={0} max={20} step={1} value={style.boxShadow.spread}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, spread: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[8px] text-text-secondary block">สีเงา</label>
              <input type="color" value={style.boxShadow.color}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, color: e.target.value } })}
                className="w-7 h-7 rounded cursor-pointer border border-border" />
            </div>
            <div>
              <label className="text-[8px] text-text-secondary block">ทึบ</label>
              <input type="range" min={0} max={1} step={0.05} value={style.boxShadow.opacity}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, opacity: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
