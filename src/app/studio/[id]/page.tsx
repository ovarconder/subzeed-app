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
  const [selectedFontFamily, setSelectedFontFamily] = useState('Arial');
  const [selectedFontSize, setSelectedFontSize] = useState(20);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [exportQuality, setExportQuality] = useState<QualityPreset>('high');
  const [useHardwareAccel, setUseHardwareAccel] = useState(supportsHardwareAccel());
  const [gifMaxWidth, setGifMaxWidth] = useState(480);
  const [exportRangeStart, setExportRangeStart] = useState(0);
  const [exportRangeEnd, setExportRangeEnd] = useState(0);
  const [useTimeRange, setUseTimeRange] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedSub = store.subtitles.find(s => s.id === store.selectedSubtitleId) ?? null;

  // Load project
  useEffect(() => {
    const fetchProject = async () => {
      const result: { data: Project | null } = await supabase
        .from('projects').select('*').eq('id', params.id).single();
      if (!result.data) {
        addToast('Not found', 'error');
        router.push('/dashboard');
        setLoading(false);
        return;
      }
      const migrated = (result.data.subtitles || []).map((sub: any) => {
        if (!sub.segments || sub.segments.length === 0) {
          return { ...sub, segments: textToSegments(sub.id, sub.text) };
        }
        return sub;
      });
      result.data.subtitles = migrated;
      store.setCurrentProject(result.data);
      const localVideo = await loadVideoLocally(result.data.id);
      if (localVideo) {
        store.setVideoUrl(localVideo.videoUrl);
        const mockFile = new File([], localVideo.fileName, { type: 'video/mp4' });
        Object.defineProperty(mockFile, 'size', { value: localVideo.fileSize });
        store.setVideoFile(mockFile);
        setExportRangeEnd(300);
      }
      setLoading(false);
    };
    fetchProject();
  }, [params.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => store.setCurrentTime(video.currentTime);
    video.addEventListener('timeupdate', handler);
    return () => video.removeEventListener('timeupdate', handler);
  }, []);

  const handleExportVideo = async (rangeOnly = false) => {
    if (!store.videoUrl || store.subtitles.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      let subsToExport = store.subtitles;
      let outputLabel = '';
      if (rangeOnly && useTimeRange && exportRangeEnd > exportRangeStart) {
        subsToExport = store.subtitles.filter(s => s.start >= exportRangeStart && s.end <= exportRangeEnd);
        if (subsToExport.length === 0) { addToast('No subtitles in range', 'warning'); setIsExporting(false); return; }
        outputLabel = `-${exportRangeStart}s-${exportRangeEnd}s`;
      }
      const blob = await renderVideoWithSubtitles(store.videoUrl, subsToExport, {
        fontFamily: selectedFontFamily, fontSize: selectedFontSize, y_offset: 90,
        format: exportFormat, position: 'bottom', quality: exportQuality,
        useHardwareAccel, gifMaxWidth, gifFrameSkip: exportFormat === 'gif' ? 1 : 0,
        fps: exportFormat === 'gif' ? 10 : 30,
        trimStart: rangeOnly && useTimeRange ? exportRangeStart : undefined,
        trimEnd: rangeOnly && useTimeRange ? exportRangeEnd : undefined,
      }, (pct) => setExportProgress(pct));
      const base = store.videoFile?.name?.replace(/\.[^.]+$/, '') || 'subzeed-video';
      downloadVideoBlob(blob, `${base}${outputLabel}-subzeed.${exportFormat}`);
      addToast(`Downloaded (${exportFormat.toUpperCase()})!`, 'success');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('FFmpeg') || msg.includes('ffmpeg'))
        addToast('FFmpeg failed to load - refresh or check connection', 'error');
      else if (msg.includes('HTTP') || msg.includes('fetch'))
        addToast('Cannot access video file - try re-selecting video', 'error');
      else
        addToast(`Export failed: ${msg.slice(0, 120)}`, 'error');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleSave = async () => {
    if (!user || !store.currentProject) return;
    const { error } = await supabase.from('projects')
      .update({ subtitles: store.subtitles, title: store.currentProject.title, updated_at: new Date().toISOString() })
      .eq('id', store.currentProject.id);
    addToast(error ? 'Save failed' : 'Saved!', error ? 'error' : 'success');
  };

  const handleSegmentsChange = (segments: TextSegment[]) => {
    if (!selectedSub) return;
    store.updateSubtitle(selectedSub.id, { segments, text: segments.map(s => s.text).join('') });
  };

  const handleDisplayStyleChange = (style: SubtitleDisplayStyle) => {
    if (!selectedSub) return;
    store.updateSubtitle(selectedSub.id, { displayStyle: style });
  };

  const handlePositionChange = (pos: 'bottom' | 'middle' | 'top', y: number) => {
    if (!selectedSub) return;
    store.updateSubtitle(selectedSub.id, { position: pos, y_offset: y });
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

  if (loading) {
    return (<><Navbar /><div className="flex-1 flex items-center justify-center"><div className="skeleton h-8 w-32 rounded" /></div></>);
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 flex">
        {/* Video */}
        <div className="flex-1 flex flex-col">
          <div className="border-b border-border bg-surface px-4 py-2 flex items-center gap-3">
            <span className="font-medium text-sm truncate">{store.currentProject?.title}</span>
            <Button size="sm" variant="outline" onClick={handleSave}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => router.push('/dashboard')}>Back</Button>
          </div>
          {store.subtitles.length > 0 && (
            <SubtitleSettingsBar tier={profile?.tier || 'free'} fontFamily={selectedFontFamily} fontSize={selectedFontSize}
              onFontFamilyChange={setSelectedFontFamily} onFontSizeChange={setSelectedFontSize} />
          )}
          <div className="flex-1 bg-black flex items-center justify-center relative">
            {store.videoUrl ? (
              <>
                <video ref={videoRef} src={store.videoUrl} controls className="max-w-full max-h-full" />
                <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
                <SubtitleCanvasOverlay videoRef={videoRef} canvasRef={canvasRef}
                  fontFamily={selectedFontFamily} fontSize={selectedFontSize} tier={profile?.tier || 'free'} />
              </>
            ) : (
              <div className="text-white/60 text-center p-8">
                <p className="text-lg">No video loaded</p>
                <p className="text-sm mt-2">{store.subtitles.length} subtitle entries</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l border-border bg-white flex flex-col">
          <div className="p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Subtitles ({store.subtitles.length})</h3>
          </div>

          {/* Style Panel - shown when subtitle selected */}
          {selectedSub && (
            <div className="border-b border-border max-h-[400px] overflow-y-auto">
              <div className="px-3 py-2 border-b border-border">
                <div className="text-[11px] font-semibold text-text-secondary mb-2">Text Style</div>
                <SegmentStyleEditor
                  key={selectedSub.id}
                  segments={selectedSub.segments || textToSegments(selectedSub.id, selectedSub.text)}
                  onChange={handleSegmentsChange}
                />
              </div>
              <div className="px-3 py-2">
                <div className="text-[11px] font-semibold text-text-secondary mb-2">Background & Position</div>
                <SubtitleDisplayEditorCompact
                  sub={selectedSub}
                  onDisplayChange={handleDisplayStyleChange}
                  onPositionChange={handlePositionChange}
                />
              </div>
            </div>
          )}

          {/* Subtitle list */}
          <div className="flex-1 overflow-y-auto">
            {store.subtitles.length === 0 ? (
              <div className="p-4 text-center text-text-secondary text-sm">No subtitles</div>
            ) : (
              <div className="divide-y divide-border">
                {store.subtitles.map((sub, i) => (
                  <SubtitleItem key={sub.id} sub={sub} index={i}
                    isSelected={store.selectedSubtitleId === sub.id}
                    videoRef={videoRef}
                    onSelect={() => { store.selectSubtitle(sub.id); if (videoRef.current) videoRef.current.currentTime = sub.start; }}
                    onUpdate={(updates) => store.updateSubtitle(sub.id, updates)}
                    onDelete={() => store.removeSubtitle(sub.id)} />
                ))}
              </div>
            )}

            {/* Export */}
            <div className="p-3 border-t border-border space-y-2">
              {isExporting ? (
                <div className="text-center">
                  <p className="text-xs text-text-secondary mb-1">Rendering {exportProgress}%</p>
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
                      {EXPORT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  {exportFormat !== 'gif' && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-text-secondary font-medium w-12">Quality:</label>
                      <select value={exportQuality} onChange={(e) => setExportQuality(e.target.value as QualityPreset)}
                        className="flex-1 rounded border border-border px-2 py-1 text-xs bg-white">
                        {QUALITY_PRESETS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                      </select>
                    </div>
                  )}
                  <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={useTimeRange} onChange={(e) => setUseTimeRange(e.target.checked)} className="accent-primary" />
                    Time range only
                  </label>
                  {useTimeRange && (
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} step={1} value={exportRangeStart}
                        onChange={(e) => setExportRangeStart(Number(e.target.value))}
                        className="w-14 rounded border border-border px-1 py-0.5 text-[10px] bg-white" />
                      <span className="text-[10px] text-text-secondary">to</span>
                      <input type="number" min={0} step={1} value={exportRangeEnd}
                        onChange={(e) => setExportRangeEnd(Number(e.target.value))}
                        className="w-14 rounded border border-border px-1 py-0.5 text-[10px] bg-white" />
                      <span className="text-[10px] text-text-secondary">sec</span>
                    </div>
                  )}
                  {useTimeRange && (
                    <Button size="sm" variant="primary" className="w-full" onClick={() => handleExportVideo(true)}>
                      Download {fmt(exportRangeStart)}-{fmt(exportRangeEnd)}
                    </Button>
                  )}
                  <Button size="sm" variant="primary" className="w-full" onClick={() => handleExportVideo(false)}>
                    Download full ({exportFormat.toUpperCase()})
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

// Subtitle Display Editor Compact
function SubtitleDisplayEditorCompact({
  sub, onDisplayChange, onPositionChange,
}: {
  sub: SubtitleEntry;
  onDisplayChange: (style: SubtitleDisplayStyle) => void;
  onPositionChange: (pos: 'bottom' | 'middle' | 'top', y: number) => void;
}) {
  const style = sub.displayStyle ?? DEFAULT_DISPLAY_STYLE;
  const [posY, setPosY] = useState(sub.y_offset);
  const [position, setPosition] = useState(sub.position);

  return (
    <div className="space-y-3 p-3 bg-white rounded-lg border border-border">
      {/* Position */}
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1">Position</label>
        <div className="flex items-center gap-1">
          <input type="range" min={10} max={95} value={posY}
            onChange={(e) => { const v = Number(e.target.value); setPosY(v); onPositionChange(position, v); }}
            className="flex-1 h-4 accent-primary" />
          <span className="text-xs text-text-secondary w-6">{posY}%</span>
        </div>
        <div className="flex gap-1 mt-1">
          {(['bottom', 'middle', 'top'] as const).map(p => (
            <button key={p} onClick={() => { setPosition(p); onPositionChange(p, posY); }}
              className={`text-[10px] px-3 py-1.5 rounded ${position === p ? 'bg-primary text-white' : 'bg-surface text-text-secondary'}`}>
              {p === 'bottom' ? 'Bottom' : p === 'middle' ? 'Center' : 'Top'}
            </button>
          ))}
        </div>
      </div>

      <hr className="border-border" />

      {/* Background options */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-text-secondary font-medium block mb-1">Background color</label>
          <div className="flex items-center gap-1">
            <input type="color" value={style.bgColor}
              onChange={(e) => onDisplayChange({ ...style, bgColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-border shrink-0" />
            <input type="text" value={style.bgColor}
              onChange={(e) => onDisplayChange({ ...style, bgColor: e.target.value })}
              className="flex-1 rounded border border-border px-2 py-1 text-[10px] bg-white font-mono" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-text-secondary font-medium block mb-1">BG opacity</label>
          <div className="flex items-center gap-1">
            <input type="range" min={0} max={1} step={0.05} value={style.bgOpacity}
              onChange={(e) => onDisplayChange({ ...style, bgOpacity: Number(e.target.value) })}
              className="flex-1 h-4 accent-primary" />
            <span className="text-[10px] text-text-secondary w-8 text-right">{Math.round(style.bgOpacity * 100)}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-text-secondary font-medium block mb-1">Round corners</label>
          <input type="range" min={0} max={30} step={1} value={style.borderRadius}
            onChange={(e) => onDisplayChange({ ...style, borderRadius: Number(e.target.value) })}
            className="w-full h-4 accent-primary" />
          <span className="text-[10px] text-text-secondary">{style.borderRadius}px</span>
        </div>
        <div>
          <label className="text-[10px] text-text-secondary font-medium block mb-1">Padding X</label>
          <input type="range" min={0} max={40} step={1} value={style.paddingX}
            onChange={(e) => onDisplayChange({ ...style, paddingX: Number(e.target.value) })}
            className="w-full h-4 accent-primary" />
          <span className="text-[10px] text-text-secondary">{style.paddingX}px</span>
        </div>
      </div>

      <div>
        <label className="text-[10px] text-text-secondary font-medium block mb-1">Padding Y</label>
        <input type="range" min={0} max={30} step={1} value={style.paddingY}
          onChange={(e) => onDisplayChange({ ...style, paddingY: Number(e.target.value) })}
          className="w-full h-4 accent-primary" />
        <span className="text-[10px] text-text-secondary">{style.paddingY}px</span>
      </div>

      {/* Box Shadow */}
      <details className="bg-surface/50 rounded p-2">
        <summary className="text-[10px] font-medium text-text-secondary cursor-pointer select-none">Box Shadow</summary>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-text-secondary block mb-0.5">Offset X</label>
              <input type="range" min={-20} max={20} step={1} value={style.boxShadow.offsetX}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, offsetX: Number(e.target.value) } })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{style.boxShadow.offsetX}px</span>
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block mb-0.5">Offset Y</label>
              <input type="range" min={-20} max={20} step={1} value={style.boxShadow.offsetY}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, offsetY: Number(e.target.value) } })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{style.boxShadow.offsetY}px</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-text-secondary block mb-0.5">Blur</label>
              <input type="range" min={0} max={30} step={1} value={style.boxShadow.blur}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, blur: Number(e.target.value) } })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{style.boxShadow.blur}px</span>
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block mb-0.5">Spread</label>
              <input type="range" min={0} max={20} step={1} value={style.boxShadow.spread}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, spread: Number(e.target.value) } })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{style.boxShadow.spread}px</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-text-secondary block mb-0.5">Color</label>
              <input type="color" value={style.boxShadow.color}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, color: e.target.value } })}
                className="w-8 h-8 rounded cursor-pointer border border-border" />
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block mb-0.5">Opacity</label>
              <input type="range" min={0} max={1} step={0.05} value={style.boxShadow.opacity}
                onChange={(e) => onDisplayChange({ ...style, boxShadow: { ...style.boxShadow, opacity: Number(e.target.value) } })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{Math.round(style.boxShadow.opacity * 100)}%</span>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
