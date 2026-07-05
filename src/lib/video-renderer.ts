// ============================================================
// 🎥 Video Renderer — SubZeed
// ============================================================
// ใช้ @ffmpeg/core โดยตรง (NO WORKER) — ใช้ createFFmpegCore ผ่าน
// script tag + wasm blob URL เพื่อเลี่ยง Web Worker issues
// ============================================================

import { fetchFile } from '@ffmpeg/util';
import type { SubtitleEntry, TextSegment, FontWeight } from './types';

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
  fontFamily: 'Arial',
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

const CRF_MAP: Record<QualityPreset, number> = { best: 18, high: 23, medium: 28, fast: 35 };
const VP9_CRF_MAP: Record<QualityPreset, number> = { best: 25, high: 30, medium: 35, fast: 40 };

// ─── FFmpeg Singleton (NO WORKER) ──────────────────────
// โหลด ffmpeg-core.js ผ่าน <script> tag (ไม่ผ่าน import() เพื่อเลี่ยง webpack)
// แล้วเรียก createFFmpegCore() โดยส่ง wasm แยกผ่าน locateFile

let ffmpegInstance: any = null;
let ffmpegLoaded = false;
let ffmpegLoadError: string | null = null;

const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

// สัญญาณบอกว่า createFFmpegCore ถูก global script โหลดเสร็จ
let coreScriptLoaded = false;
let coreScriptResolve: (() => void) | null = null;

function waitForCoreScript(): Promise<void> {
  return new Promise((resolve) => {
    if (coreScriptLoaded) { resolve(); return; }
    coreScriptResolve = resolve;
  });
}

// ประกาศ type สำหรับ createFFmpegCore ที่จะมาใน global scope
declare global {
  interface Window {
    createFFmpegCore?: (opts: any) => Promise<any>;
  }
}

function injectCoreScript(blobUrl: string): HTMLScriptElement {
  const script = document.createElement('script');
  script.src = blobUrl;
  // UMD build — ใช้ classic script (ไม่ type=module)
  script.onload = () => {
    coreScriptLoaded = true;
    coreScriptResolve?.();
    console.log('[ffmpeg] Core script loaded, createFFmpegCore available:', !!window.createFFmpegCore);
  };
  script.onerror = () => {
    console.error('[ffmpeg] Core script load error');
  };
  document.head.appendChild(script);
  return script;
}

async function ensureFFmpegLoaded(): Promise<any> {
  if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadError) throw new Error(`FFmpeg โหลดไม่สำเร็จ (ก่อนหน้า): ${ffmpegLoadError}`);

  try {
    // 1. โหลด core.js เป็น blob URL
    console.log('[ffmpeg] Fetching core.js...');
    const coreResp = await fetch(`${FFMPEG_BASE}/ffmpeg-core.js`);
    const coreJs = await coreResp.text();
    const coreBlob = new Blob([coreJs], { type: 'text/javascript' });
    const coreBlobURL = URL.createObjectURL(coreBlob);
    
    // 2. โหลด wasm เป็น blob URL
    console.log('[ffmpeg] Fetching wasm...');
    const wasmResp = await fetch(`${FFMPEG_BASE}/ffmpeg-core.wasm`);
    const wasmBuffer = await wasmResp.arrayBuffer();
    const wasmBlob = new Blob([wasmBuffer], { type: 'application/wasm' });
    const wasmBlobURL = URL.createObjectURL(wasmBlob);
    
    // 3. Inject core.js ผ่าน <script> (เลี่ยง dynamic import ที่ webpack ไม่ support)
    console.log('[ffmpeg] Injecting core script...');
    injectCoreScript(coreBlobURL);
    await waitForCoreScript();
    
    // 4. เรียก createFFmpegCore()
    if (!window.createFFmpegCore) {
      throw new Error('createFFmpegCore ไม่ถูกโหลด');
    }
    
    console.log('[ffmpeg] Creating FFmpeg instance...');
    ffmpegInstance = await window.createFFmpegCore({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) return wasmBlobURL;
        return path;
      },
    });
    
    // 5. ตั้ง logger
    ffmpegInstance.setLogger((data: any) => {
      if (data.type === 'error') console.error('[ffmpeg]', data.message);
    });
    
    ffmpegLoaded = true;
    console.log('[ffmpeg] FFmpeg ready');
    return ffmpegInstance;
  } catch (err) {
    ffmpegLoadError = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ffmpeg] Load failed:', ffmpegLoadError);
    throw new Error(`ไม่สามารถโหลด FFmpeg.wasm: ${ffmpegLoadError}`);
  }
}

// ─── Wrapper ──────────────────────────────────────────

class FFWrapper {
  private inst: any;
  private progressCbs: Function[] = [];
  
  constructor(inst: any) {
    this.inst = inst;
    inst.setProgress((data: any) => {
      this.progressCbs.forEach(cb => cb(data));
    });
  }
  
  writeFile(path: string, data: Uint8Array) {
    this.inst.FS_writeFile(path, data);
  }
  
  async readFile(path: string): Promise<Uint8Array> {
    return this.inst.FS_readFile(path);
  }
  
  async deleteFile(path: string) {
    try { this.inst.FS_unlink(path); } catch {}
  }
  
  async exec(args: string[]) {
    const fullArgs = ['-nostdin', '-y', ...args];
    console.log('[ffmpeg] exec:', fullArgs.join(' ').slice(0, 200));
    const code = this.inst.run(...fullArgs);
    console.log('[ffmpeg] exec done, code:', code);
    return code;
  }
  
  on(event: string, cb: Function) {
    if (event === 'progress') this.progressCbs.push(cb);
  }
}

// ─── Main Render ───────────────────────────────────────

export async function renderVideoWithSubtitles(
  videoBlobOrUrl: Blob | string,
  subtitles: SubtitleEntry[],
  options?: Partial<RenderOptions>,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const ext = extOf(opts.format);

  try {
    onProgress?.(2);
    console.log('[render] Loading FFmpeg...');
    const inst = await ensureFFmpegLoaded();
    const ff = new FFWrapper(inst);
    onProgress?.(5);

    onProgress?.(6);
    let videoData: Blob;
    if (typeof videoBlobOrUrl === 'string') {
      console.log('[render] Fetching video...');
      const resp = await fetch(videoBlobOrUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      videoData = await resp.blob();
    } else {
      videoData = videoBlobOrUrl;
    }
    if (videoData.size === 0) throw new Error('ไฟล์วิดีโอว่างเปล่า');
    onProgress?.(8);

    const inName = `input.${ext === 'gif' ? 'mp4' : ext}`;
    console.log('[render] Write input...');
    await ff.writeFile(inName, await fetchFile(videoData));
    onProgress?.(10);

    console.log('[render] Build ASS...');
    const ass = buildAss(subtitles, opts);
    // แปลง string → Uint8Array
    const assBytes = new TextEncoder().encode(ass);
    await ff.writeFile('subs.ass', assBytes);
    onProgress?.(12);

    const outName = `output.${ext}`;
    ff.on('progress', ({ progress: pct }: any) => {
      onProgress?.(Math.min(12 + Math.round(pct * 83), 95));
    });

    console.log('[render] Run FFmpeg...');
    if (opts.format === 'gif') {
      await renderGif(ff, inName, outName, opts);
    } else {
      await renderVideo(ff, inName, outName, opts);
    }

    onProgress?.(97);
    console.log('[render] Read output...');
    const readResult = await ff.readFile(outName);
    let dataBuffer: ArrayBuffer;
    if (readResult instanceof Uint8Array) {
      dataBuffer = readResult.buffer.slice(0) as ArrayBuffer;
    } else {
      throw new Error('อ่านผลลัพธ์ไม่ได้');
    }

    await ff.deleteFile(inName);
    await ff.deleteFile(outName);
    await ff.deleteFile('subs.ass');

    if (dataBuffer.byteLength === 0) throw new Error('FFmpeg สร้างไฟล์ว่างเปล่า');

    onProgress?.(99);
    const blob = new Blob([dataBuffer], { type: mimeOf(opts.format) });
    onProgress?.(100);
    console.log('[render] Done! Size:', blob.size);
    return blob;
  } catch (err) {
    console.error('[render] ERROR:', err);
    onProgress?.(0);
    throw err;
  }
}

// ─── FFmpeg Commands ───────────────────────────────────

async function renderVideo(ff: FFWrapper, inName: string, outName: string, opts: RenderOptions) {
  const args: string[] = [];
  if (opts.trimStart !== undefined && opts.trimStart > 0) args.push('-ss', String(opts.trimStart));
  if (opts.trimEnd !== undefined && opts.trimEnd > opts.trimStart!) args.push('-to', String(opts.trimEnd));
  args.push('-i', inName);
  args.push('-vf', 'subtitles=subs.ass');
  args.push(...codecArgs(opts.format, opts.quality, opts.useHardwareAccel));
  args.push('-c:a', 'aac', '-b:a', '128k');
  args.push('-movflags', '+faststart');
  args.push('-y', outName);
  await ff.exec(args);
}

async function renderGif(ff: FFWrapper, inName: string, outName: string, opts: RenderOptions) {
  const paletteName = 'palette.png';
  const fps = Math.max(5, Math.round(opts.fps / (opts.gifFrameSkip + 1)));
  const scale = `scale=${opts.gifMaxWidth}:-1:flags=lanczos`;
  const trimFilter = (opts.trimStart !== undefined || opts.trimEnd !== undefined)
    ? `trim=${opts.trimStart ?? 0}:${opts.trimEnd ?? 9999},setpts=PTS-STARTPTS,`
    : '';

  try {
    const palArgs: string[] = [];
    if (opts.trimStart !== undefined && opts.trimStart > 0) palArgs.push('-ss', String(opts.trimStart));
    if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) palArgs.push('-to', String(opts.trimEnd));
    palArgs.push('-i', inName);
    palArgs.push('-vf', `${trimFilter}${scale},subtitles=subs.ass,palettegen=stats_mode=diff`);
    palArgs.push('-y', paletteName);
    await ff.exec(palArgs);

    const gifArgs: string[] = [];
    if (opts.trimStart !== undefined && opts.trimStart > 0) gifArgs.push('-ss', String(opts.trimStart));
    if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) gifArgs.push('-to', String(opts.trimEnd));
    gifArgs.push('-i', inName);
    gifArgs.push('-i', paletteName);
    gifArgs.push('-lavfi', `${trimFilter}${scale},subtitles=subs.ass [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`);
    gifArgs.push('-r', String(fps));
    gifArgs.push('-y', outName);
    await ff.exec(gifArgs);
  } finally {
    await ff.deleteFile(paletteName);
  }
}

// ─── Codec helpers ─────────────────────────────────────

function codecArgs(format: ExportFormat, quality: QualityPreset, hwAccel: boolean): string[] {
  if (format === 'gif') return [];
  const crf = format === 'webm' ? VP9_CRF_MAP[quality] : CRF_MAP[quality];
  const baseH264 = [
    '-c:v', hwAccel ? 'h264_videotoolbox' : 'libx264',
    '-preset', quality === 'best' ? 'slow' : quality === 'fast' ? 'veryfast' : 'ultrafast',
    ...(hwAccel ? ['-b:v', String(bitrateForQuality(quality))] : ['-crf', String(crf)]),
    '-pix_fmt', 'yuv420p',
  ];
  switch (format) {
    case 'webm': return ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-cpu-used', quality === 'fast' ? '4' : '2'];
    case 'mov': return baseH264;
    default: return baseH264;
  }
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
  l.push(`Style: Default,${opts.fontFamily},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1`);
  l.push('');  l.push('[Events]');
  l.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
  subs.forEach((s) => {
    if (s.segments && s.segments.length > 0) {
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},Default,,0,0,0,,${s.segments.map(seg => segmentToAss(seg, opts)).join('')}`);
    } else {
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},Default,,0,0,0,,${s.text.replace(/\n/g, '\\N')}`);
    }
  });
  return l.join('\n');
}

function segmentToAss(seg: TextSegment, opts: RenderOptions): string {
  const st = seg.style;
  const tags: string[] = [];
  tags.push(`\\c${hexToAssColor(st.color)}`);
  const alpha = Math.round((1 - st.opacity) * 255);
  tags.push(`\\alpha&H${alpha.toString(16).padStart(2, '0').toUpperCase()}&`);
  const b = st.fontWeight === 'bold' || st.fontWeight === 'bold-italic';
  const i = st.fontWeight === 'italic' || st.fontWeight === 'bold-italic';
  tags.push(`\\b${b ? '1' : '0'}`, `\\i${i ? '1' : '0'}`);
  if (st.strokeWidth > 0 && st.strokeOpacity > 0) {
    tags.push(`\\bord${st.strokeWidth}`, `\\3c${hexToAssColor(st.strokeColor)}`);
    const oa = Math.round((1 - st.strokeOpacity) * 255);
    tags.push(`\\3a&H${oa.toString(16).padStart(2, '0').toUpperCase()}&`);
  } else { tags.push('\\bord0'); }
  if (st.shadowOpacity > 0 && (st.shadowBlur > 0 || st.shadowOffsetX !== 0 || st.shadowOffsetY !== 0)) {
    tags.push(`\\shad${Math.max(1, Math.abs(st.shadowOffsetY))}`, `\\4c${hexToAssColor(st.shadowColor)}`);
    const sa = Math.round((1 - st.shadowOpacity) * 255);
    tags.push(`\\4a&H${sa.toString(16).padStart(2, '0').toUpperCase()}&`);
  } else { tags.push('\\shad0'); }
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
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(Math.round((s % 1) * 100)).padStart(2, '0')}`;
}

// ─── Export ────────────────────────────────────────────

export function downloadVideoBlob(blob: Blob, filename: string = 'subzeed-video.mp4') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function supportsHardwareAccel(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.platform?.toLowerCase().includes('mac') || false;
}

export const EXPORT_FORMATS: { value: ExportFormat; label: string; mime: string }[] = [
  { value: 'mp4', label: 'MP4 (H.264)', mime: 'video/mp4' },
  { value: 'webm', label: 'WebM (VP9)', mime: 'video/webm' },
  { value: 'mov', label: 'MOV (H.264)', mime: 'video/quicktime' },
  { value: 'gif', label: 'GIF', mime: 'image/gif' },
];

export const QUALITY_PRESETS: { value: QualityPreset; label: string; desc: string }[] = [
  { value: 'best', label: 'ดีที่สุด', desc: 'CRF 18, ช้าที่สุด' },
  { value: 'high', label: 'สูง', desc: 'CRF 23, สมดุล' },
  { value: 'medium', label: 'ปานกลาง', desc: 'CRF 28, ไฟล์เล็ก' },
  { value: 'fast', label: 'เร็ว', desc: 'CRF 35, เหมาะ preview' },
];
