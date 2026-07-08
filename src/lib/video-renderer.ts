// ============================================================
// 🎥 Video Renderer — SubZeed
// ============================================================
// ใช้ @ffmpeg/ffmpeg v0.12.x wrapper API (ไม่ใช้ @ffmpeg/core ตรงๆ)
// Asset ทั้งหมดโหลดจาก CDN (unpkg) → Blob URL → ส่งให้ ffmpeg.load()
// core + wasm + worker ของ @ffmpeg/ffmpeg เอง (classWorkerURL)
// เพื่อเลี่ยง Web Worker path resolution issue ใน Next.js + basePath
// ============================================================

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { SubtitleEntry, TextSegment } from './types';

// ─── Font Constants ────────────────────────────────────
const FONT_URL = 'https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf';
const FONT_VFS_DIR = '/fonts';
const FONT_VFS_PATH = `${FONT_VFS_DIR}/NotoSansThai-Regular.ttf`;
const FONT_FAMILY_NAME = 'Noto Sans Thai';

// ─── Types ──────────────────────────────────────────────
export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'gif';
export type QualityPreset = 'best' | 'high' | 'medium' | 'fast';

export interface RenderOptions {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  strokeColor: string;
  position: 'bottom' | 'top' | 'middle';
  y_offset: number;
  format: ExportFormat;
  fps: number;
  quality: QualityPreset;
  useHardwareAccel: boolean;
  gifMaxWidth: number;
  gifFrameSkip: number;
  trimStart?: number;
  trimEnd?: number;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  fontFamily: FONT_FAMILY_NAME,
  fontSize: 36,
  fontColor: 'white',
  strokeColor: 'black',
  position: 'bottom',
  y_offset: 80,
  format: 'mp4',
  fps: 30,
  quality: 'high',
  useHardwareAccel: false,
  gifMaxWidth: 480,
  gifFrameSkip: 1,
};

// ─── Quality → CRF mapping ─────────────────────────────
const CRF_MAP: Record<QualityPreset, number> = { best: 18, high: 23, medium: 28, fast: 35 };
const VP9_CRF_MAP: Record<QualityPreset, number> = { best: 25, high: 30, medium: 35, fast: 40 };

// ─── CDN Base URLs (ปักหมุดเวอร์ชันตายตัว) ────────────
const CORE_CDN = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
const FFMPEG_CDN = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm';

// ─── FFmpeg Singleton ──────────────────────────────────
let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let ffmpegLoadError: string | null = null;

export function terminateFFmpeg() {
  if (ffmpeg) { try { ffmpeg.terminate(); } catch {} ffmpeg = null; }
  ffmpegLoadPromise = null;
  ffmpegLoadError = null;
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (ffmpegLoadError) throw new Error(`FFmpeg โหลดไม่สำเร็จ (ก่อนหน้า): ${ffmpegLoadError}`);
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const instance = new FFmpeg();
    instance.on('log', ({ type, message }) => {
      if (type === 'error') console.error('[ffmpeg]', message);
    });
    try {
      console.log('[ffmpeg] Loading core.js + core.wasm from unpkg...');
      // ⭐ coreURL/wasmURL: ส่ง CDN URL ตรงๆ (ไม่ผ่าน toBlobURL)
      // classWorkerURL เท่านั้นที่ต้องเป็น Blob URL
      const workerBlobURL = await toBlobURL(`${FFMPEG_CDN}/worker.js`, 'text/javascript');
      console.log('[ffmpeg] Calling ffmpeg.load()...');
      await instance.load({
        coreURL: `${CORE_CDN}/ffmpeg-core.js`,
        wasmURL: `${CORE_CDN}/ffmpeg-core.wasm`,
        classWorkerURL: workerBlobURL,
      });
      ffmpeg = instance;
      console.log('[ffmpeg] FFmpeg ready');
      return instance;
    } catch (err) {
      ffmpegLoadError = err instanceof Error ? err.message : 'Unknown error';
      console.error('[ffmpeg] Load failed:', ffmpegLoadError);
      throw new Error(`ไม่สามารถโหลด FFmpeg.wasm: ${ffmpegLoadError}`);
    }
  })();
  return ffmpegLoadPromise;
}

// ─── execWithAbort — wrapper กัน ff.exec() ค้าง ⭐ ─────
async function execWithAbort(ff: FFmpeg, args: string[], signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('ABORTED');
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      try { ff.terminate(); } catch {}
      ffmpeg = null; ffmpegLoadPromise = null; ffmpegLoadError = null;
      reject(new Error('ABORTED'));
    };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    ff.exec(args)
      .then(() => resolve())
      .catch((err) => {
        const msg = err?.message || '';
        if (msg === 'ABORTED' || signal?.aborted) reject(new Error('ABORTED'));
        else reject(err);
      })
      .finally(() => { signal?.removeEventListener('abort', onAbort); });
  });
}

// ─── Main Render ───────────────────────────────────────
export async function renderVideoWithSubtitles(
  videoBlobOrUrl: Blob | string,
  subtitles: SubtitleEntry[],
  options?: Partial<RenderOptions>,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const ext = extOf(opts.format);
  if (signal?.aborted) throw new Error('ABORTED');
  const onAbort = () => { terminateFFmpeg(); };
  if (signal) {
    if (signal.aborted) throw new Error('ABORTED');
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const checkAborted = () => { if (signal?.aborted) throw new Error('ABORTED'); };

  try {
    onProgress?.(2);
    const ff = await getFFmpeg();
    checkAborted();
    onProgress?.(5);

    let videoData: Blob;
    if (typeof videoBlobOrUrl === 'string') {
      const resp = await fetch(videoBlobOrUrl);
      if (!resp.ok) throw new Error(`โหลดวิดีโอไม่สำเร็จ (HTTP ${resp.status})`);
      videoData = await resp.blob();
    } else {
      videoData = videoBlobOrUrl;
    }
    if (videoData.size === 0) throw new Error('ไฟล์วิดีโอว่างเปล่า');
    checkAborted();
    onProgress?.(8);

    const needsThaiFont = opts.fontFamily === FONT_FAMILY_NAME ||
      subtitles.some(s => s.segments?.some(seg => seg.style.fontFamily === FONT_FAMILY_NAME));
    if (needsThaiFont) {
      try { await ff.createDir(FONT_VFS_DIR); } catch {}
      try { await ff.writeFile(FONT_VFS_PATH, await fetchFile(FONT_URL)); } catch {}
    }
    checkAborted();

    const ass = buildAss(subtitles, opts);
    const inName = `input.${ext === 'gif' ? 'mp4' : ext}`;
    const assName = 'subs.ass';
    const outName = `output.${ext}`;
    await ff.writeFile(inName, await fetchFile(videoData));
    await ff.writeFile(assName, new TextEncoder().encode(ass));
    checkAborted();
    onProgress?.(12);

    ff.on('progress', ({ progress: pct }) => {
      const mapped = Math.min(12 + Math.round(pct * 83), 95);
      onProgress?.(mapped);
    });

    if (opts.format === 'gif') {
      await renderGif(ff, inName, outName, opts, signal);
    } else {
      await renderVideo(ff, inName, outName, opts, signal);
    }
    checkAborted();

    onProgress?.(97);
    const readResult = await ff.readFile(outName);
    let dataBuffer: ArrayBuffer;
    if (readResult instanceof Uint8Array) {
      dataBuffer = readResult.buffer.slice(0) as ArrayBuffer;
    } else if (typeof readResult === 'string') {
      dataBuffer = new TextEncoder().encode(readResult).buffer as ArrayBuffer;
    } else {
      throw new Error('ไม่สามารถอ่านผลลัพธ์จาก FFmpeg ได้');
    }
    await Promise.allSettled([
      ff.deleteFile(inName).catch(() => {}),
      ff.deleteFile(outName).catch(() => {}),
      ff.deleteFile(assName).catch(() => {}),
    ]);
    if (dataBuffer.byteLength === 0) throw new Error('FFmpeg สร้างไฟล์ว่างเปล่า');
    onProgress?.(99);
    const blob = new Blob([dataBuffer], { type: mimeOf(opts.format) });
    onProgress?.(100);
    return blob;
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg === 'ABORTED' || signal?.aborted) { onProgress?.(0); throw new Error('ABORTED'); }
    onProgress?.(0); throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

// ─── FFmpeg Commands ───────────────────────────────────
async function renderVideo(ff: FFmpeg, inName: string, outName: string, opts: RenderOptions, signal?: AbortSignal) {
  const args: string[] = [];
  if (opts.trimStart !== undefined && opts.trimStart > 0) args.push('-ss', String(opts.trimStart));
  if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) args.push('-to', String(opts.trimEnd));
  args.push('-i', inName);
  args.push('-vf', opts.fontFamily === FONT_FAMILY_NAME ? `ass=subs.ass:fontsdir=${FONT_VFS_DIR}` : 'subtitles=subs.ass');
  args.push(...codecArgs(opts.format, opts.quality, opts.useHardwareAccel), '-c:a', 'copy', '-movflags', '+faststart', '-y', outName);
  await execWithAbort(ff, args, signal);
}

async function renderGif(ff: FFmpeg, inName: string, outName: string, opts: RenderOptions, signal?: AbortSignal) {
  const paletteName = 'palette.png';
  const fps = Math.max(5, Math.round(opts.fps / (opts.gifFrameSkip + 1)));
  const scale = `scale=${opts.gifMaxWidth}:-1:flags=lanczos`;
  const trimFilter = (opts.trimStart !== undefined || opts.trimEnd !== undefined)
    ? `trim=${opts.trimStart ?? 0}:${opts.trimEnd ?? 9999},setpts=PTS-STARTPTS,` : '';
  const subF = opts.fontFamily === FONT_FAMILY_NAME ? `ass=subs.ass:fontsdir=${FONT_VFS_DIR}` : 'subtitles=subs.ass';
  try {
    const pa: string[] = [];
    if (opts.trimStart !== undefined && opts.trimStart > 0) pa.push('-ss', String(opts.trimStart));
    if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) pa.push('-to', String(opts.trimEnd));
    pa.push('-i', inName, '-vf', `${trimFilter}${scale},${subF},palettegen=stats_mode=diff`, '-y', paletteName);
    await execWithAbort(ff, pa, signal);

    const ga: string[] = [];
    if (opts.trimStart !== undefined && opts.trimStart > 0) ga.push('-ss', String(opts.trimStart));
    if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) ga.push('-to', String(opts.trimEnd));
    ga.push('-i', inName, '-i', paletteName);
    ga.push('-lavfi', `${trimFilter}${scale},${subF} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`);
    ga.push('-r', String(fps), '-y', outName);
    await execWithAbort(ff, ga, signal);
  } finally {
    await ff.deleteFile(paletteName).catch(() => {});
  }
}

// ─── Codec Helpers ─────────────────────────────────────
function codecArgs(format: ExportFormat, quality: QualityPreset, hwAccel: boolean): string[] {
  if (format === 'gif') return [];
  const crf = format === 'webm' ? VP9_CRF_MAP[quality] : CRF_MAP[quality];
  const baseH264 = ['-c:v', hwAccel ? 'h264_videotoolbox' : 'libx264', '-preset', quality === 'best' ? 'slow' : quality === 'fast' ? 'veryfast' : 'ultrafast'];
  if (hwAccel) baseH264.push('-b:v', String(bitrateForQuality(quality)));
  else baseH264.push('-crf', String(crf));
  baseH264.push('-pix_fmt', 'yuv420p');
  if (format === 'webm') return ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-cpu-used', quality === 'fast' ? '4' : '2'];
  return baseH264;
}

function bitrateForQuality(quality: QualityPreset): number {
  switch (quality) { case 'best': return 8000; case 'high': return 5000; case 'medium': return 3000; case 'fast': return 1500; }
}

function extOf(format: ExportFormat): string {
  switch (format) { case 'mp4': return 'mp4'; case 'webm': return 'webm'; case 'mov': return 'mov'; case 'gif': return 'gif'; }
}

function mimeOf(format: ExportFormat): string {
  switch (format) { case 'mp4': return 'video/mp4'; case 'webm': return 'video/webm'; case 'mov': return 'video/quicktime'; case 'gif': return 'image/gif'; }
}

// ─── ASS Builder ───────────────────────────────────────
function buildAss(subs: SubtitleEntry[], opts: RenderOptions): string {
  const l: string[] = [];
  l.push('[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 360', 'ScaledBorderAndShadow: yes', '');
  l.push('[V4+ Styles]');
  l.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');
  l.push(`Style: bottom,${opts.fontFamily},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1`);
  l.push(`Style: top,${opts.fontFamily},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,8,10,10,10,1`);
  l.push(`Style: middle,${opts.fontFamily},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,5,10,10,10,1`);
  l.push('', '[Events]');
  l.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
  subs.forEach((s) => {
    if (s.segments && s.segments.length > 0) {
      const assText = s.segments.map((seg) => segmentToAss(seg, opts.fontFamily, opts.fontSize)).join('');
      const pos = s.position || 'bottom';
      const marginV = Math.round(((s.y_offset ?? opts.y_offset) / 100) * 360);
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},${pos},,0,0,${marginV},,${assText}`);
    } else {
      const pos = s.position || 'bottom';
      const marginV = Math.round(((s.y_offset ?? opts.y_offset) / 100) * 360);
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},${pos},,0,0,${marginV},,${s.text.replace(/\n/g, '\\N')}`);
    }
  });
  return l.join('\n');
}

function segmentToAss(seg: TextSegment, fallbackFontFamily: string, fallbackFontSize: number): string {
  const st = seg.style;
  const tags: string[] = [];
  const segFont = st.fontFamily || fallbackFontFamily;
  if (segFont !== fallbackFontFamily) tags.push(`\\fn${segFont}`);
  const segSize = st.fontSize || fallbackFontSize;
  if (segSize !== fallbackFontSize) tags.push(`\\fs${segSize}`);
  tags.push(`\\c${hexToAssColor(st.color)}`);
  tags.push(`\\alpha&H${Math.round((1 - st.opacity) * 255).toString(16).padStart(2, '0').toUpperCase()}&`);
  const isBold = st.fontWeight === 'bold' || st.fontWeight === 'bold-italic';
  const isItalic = st.fontWeight === 'italic' || st.fontWeight === 'bold-italic';
  tags.push(`\\b${isBold ? '1' : '0'}`, `\\i${isItalic ? '1' : '0'}`);
  const isStrokeActive = st.strokeActive !== undefined ? st.strokeActive : true;
  if (isStrokeActive && st.strokeWidth > 0 && st.strokeOpacity > 0) {
    tags.push(`\\bord${st.strokeWidth}`, `\\3c${hexToAssColor(st.strokeColor)}`);
    tags.push(`\\3a&H${Math.round((1 - st.strokeOpacity) * 255).toString(16).padStart(2, '0').toUpperCase()}&`);
  } else tags.push('\\bord0');
  const isShadowActive = st.shadowActive !== undefined ? st.shadowActive : true;
  if (isShadowActive && st.shadowOpacity > 0 && (st.shadowBlur > 0 || st.shadowOffsetX !== 0 || st.shadowOffsetY !== 0)) {
    const shadowDist = Math.max(1, Math.abs(st.shadowOffsetY));
    tags.push(`\\shad${shadowDist}`, `\\4c${hexToAssColor(st.shadowColor)}`);
    tags.push(`\\4a&H${Math.round((1 - st.shadowOpacity) * 255).toString(16).padStart(2, '0').toUpperCase()}&`);
  } else tags.push('\\shad0');
  return `{${tags.join('')}}${escapeAssText(seg.text)}`;
}

function hexToAssColor(hex: string): string {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  return `&H${c.substring(4, 6)}${c.substring(2, 4)}${c.substring(0, 2)}&`;
}

function escapeAssText(text: string): string {
  return text.replace(/\n/g, '\\N').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\|/g, '\\|');
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(1, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(Math.round((s % 1) * 100)).padStart(2, '0')}`;
}

// ─── Helpers ───────────────────────────────────────────
export function downloadVideoBlob(blob: Blob, filename: string = 'subzeed-video.mp4') {
  const key = `download_count_${filename}`;
  let count = 0;
  try { count = parseInt(localStorage.getItem(key) || '0', 10); } catch {}
  let finalName = filename;
  if (count > 0) {
    const dotIdx = filename.lastIndexOf('.');
    finalName = dotIdx > 0 ? `${filename.substring(0, dotIdx)} (${count})${filename.substring(dotIdx)}` : `${filename} (${count})`;
  }
  try { localStorage.setItem(key, String(count + 1)); } catch {}
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = finalName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function supportsHardwareAccel(): boolean { return false; }

export const EXPORT_FORMATS = [
  { value: 'mp4' as ExportFormat, label: 'MP4 (H.264)', mime: 'video/mp4' },
  { value: 'webm' as ExportFormat, label: 'WebM (VP9)', mime: 'video/webm' },
  { value: 'mov' as ExportFormat, label: 'MOV (H.264)', mime: 'video/quicktime' },
  { value: 'gif' as ExportFormat, label: 'GIF', mime: 'image/gif' },
];

export const QUALITY_PRESETS = [
  { value: 'best' as QualityPreset, label: 'ดีที่สุด', desc: 'CRF 18, ช้าที่สุด' },
  { value: 'high' as QualityPreset, label: 'สูง', desc: 'CRF 23, สมดุล' },
  { value: 'medium' as QualityPreset, label: 'ปานกลาง', desc: 'CRF 28, ไฟล์เล็ก' },
  { value: 'fast' as QualityPreset, label: 'เร็ว', desc: 'CRF 35, เหมาะ preview' },
];
