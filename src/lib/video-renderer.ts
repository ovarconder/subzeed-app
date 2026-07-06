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
  /** สำหรับ GIF: จำกัด width × height (scale proportionally) */
  gifMaxWidth: number;
  /** สำหรับ GIF: จำนวน frame ที่จะข้าม (0 = ทุก frame, 1 = ข้าม 1 frame = fps ครึ่ง) */
  gifFrameSkip: number;
  /** ตัดวิดีโอเฉพาะช่วง (trim) — เป็นวินาที */
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

// ─── Quality → CRF mapping ─────────────────────────────

const CRF_MAP: Record<QualityPreset, number> = {
  best: 18,
  high: 23,
  medium: 28,
  fast: 35,
};

const VP9_CRF_MAP: Record<QualityPreset, number> = {
  best: 25,
  high: 30,
  medium: 35,
  fast: 40,
};

// ─── CDN Base URL (ปักหมุดเวอร์ชันให้ตรงกับ package.json) ──
// @ffmpeg/core@0.12.10 ต้องตรงกับ @ffmpeg/ffmpeg@0.12.10 ที่ใช้

const CDN_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
const FFMPEG_CDN_BASE = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm';

// ─── FFmpeg Singleton ──────────────────────────────────
// โหลดครั้งเดียว เก็บไว้ reuse กัน race condition
// timeout 30 วิ — ไม่ให้ค้าง indefinitely

let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let ffmpegLoadError: string | null = null;
let ffmpegLoadAborted = false;

const FFMPEG_LOAD_TIMEOUT_MS = 45_000; // 45 วิ

async function getFFmpeg(): Promise<FFmpeg> {
  // ถ้าโหลดสำเร็จแล้ว → return ทันที
  if (ffmpeg) return ffmpeg;

  // ถ้าถูกยกเลิก (timeout) → ให้ลองใหม่
  if (ffmpegLoadAborted) {
    ffmpegLoadAborted = false;
    ffmpegLoadError = null;
    ffmpegLoadPromise = null;
  }

  // ถ้าโหลดไม่สำเร็จก่อนหน้า → throw ทันที
  if (ffmpegLoadError) {
    throw new Error(`FFmpeg โหลดไม่สำเร็จ (ก่อนหน้า): ${ffmpegLoadError}`);
  }

  // ถ้ากำลังโหลดอยู่ → รอ promise เดิม (กัน race condition)
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  // เริ่มโหลด
  ffmpegLoadPromise = (async () => {
    const instance = new FFmpeg();

    // ตั้ง logger ที่ debug level (เห็นทุกข้อความ)
    instance.on('log', ({ type, message }) => {
      console.log('[ffmpeg:log]', type === 'error' ? '❌' : 'ℹ️', message);
    });

    try {
      // 1. เตรียม Blob URLs
      console.log('[ffmpeg] Fetching core.js...');
      const coreBlobURL = await toBlobURL(`${CDN_BASE}/ffmpeg-core.js`, 'text/javascript');

      console.log('[ffmpeg] Fetching core.wasm...');
      const wasmBlobURL = await toBlobURL(`${CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm');

      // 2. ไม่ใช้ classWorkerURL — @ffmpeg/ffmpeg จะใช้ single-thread mode
      //    ซึ่งไม่ต้องพึ่ง SharedArrayBuffer / COOP+COEP headers
      //    เหมาะกับ production ที่ server ยังไม่ได้ตั้ง Cross-Origin Isolation
      //    core.js + wasm ใช้ Blob URL (toBlobURL) เพื่อเลี่ยง CORS
      console.log('[ffmpeg] Using single-thread mode (no classWorkerURL)...');

      // 3. โหลด FFmpeg.wasm พร้อม timeout
      console.log('[ffmpeg] Calling ffmpeg.load() with', {
        coreURL: 'blob:...',
        wasmURL: 'blob:...',
        classWorkerURL: 'none (single-thread)',
      });
      
      const loadPromise = instance.load({
        coreURL: coreBlobURL,
        wasmURL: wasmBlobURL,
        // ไม่ส่ง classWorkerURL → fallback เป็น single-thread
      });

      // Race condition: load vs timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`FFmpeg.load() ไม่เสร็จภายใน ${FFMPEG_LOAD_TIMEOUT_MS/1000} วินาที`)), FFMPEG_LOAD_TIMEOUT_MS);
      });

      await Promise.race([loadPromise, timeoutPromise]);

      ffmpeg = instance;
      console.log('[ffmpeg] ✅ FFmpeg ready');
      return instance;
    } catch (err) {
      ffmpegLoadError = err instanceof Error ? err.message : 'Unknown error';
      ffmpegLoadAborted = true;
      console.error('[ffmpeg] ❌ Load failed:', ffmpegLoadError);
      // cleanup
      try { instance.terminate?.(); } catch {}
      throw new Error(`ไม่สามารถโหลด FFmpeg.wasm: ${ffmpegLoadError}`);
    }
  })();

  return ffmpegLoadPromise;
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

  // 1. Load FFmpeg
  onProgress?.(2);
  const ff = await getFFmpeg();

  onProgress?.(5);

  // 2. Get video data
  let videoData: Blob;
  if (typeof videoBlobOrUrl === 'string') {
    const resp = await fetch(videoBlobOrUrl);
    if (!resp.ok) throw new Error(`โหลดวิดีโอไม่สำเร็จ (HTTP ${resp.status})`);
    videoData = await resp.blob();
  } else {
    videoData = videoBlobOrUrl;
  }
  if (videoData.size === 0) throw new Error('ไฟล์วิดีโอว่างเปล่า');
  onProgress?.(8);

  // 3. Build ASS subtitle
  const ass = buildAss(subtitles, opts);

  // 4. เขียนไฟล์เข้าระบบ virtual FS
  const inName = `input.${ext === 'gif' ? 'mp4' : ext}`;
  const assName = 'subs.ass';
  const outName = `output.${ext}`;

  await ff.writeFile(inName, await fetchFile(videoData));
  await ff.writeFile(assName, new TextEncoder().encode(ass));
  onProgress?.(12);

  // 5. Progress callback
  ff.on('progress', ({ progress: pct }) => {
    const mapped = Math.min(12 + Math.round(pct * 83), 95);
    onProgress?.(mapped);
  });

  try {
    // 6. Build arguments
    if (opts.format === 'gif') {
      await renderGif(ff, inName, outName, opts);
    } else {
      await renderVideo(ff, inName, outName, opts);
    }

    // 7. Read result
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

    // 8. Cleanup virtual FS (กัน memory leak)
    await Promise.allSettled([
      ff.deleteFile(inName),
      ff.deleteFile(outName),
      ff.deleteFile(assName),
    ]);

    if (dataBuffer.byteLength === 0) throw new Error('FFmpeg สร้างไฟล์ว่างเปล่า');

    onProgress?.(99);
    const blob = new Blob([dataBuffer], { type: mimeOf(opts.format) });
    onProgress?.(100);
    return blob;
  } catch (err) {
    // Cleanup เมื่อ error
    await Promise.allSettled([
      ff.deleteFile(inName),
      ff.deleteFile(outName),
      ff.deleteFile(assName),
    ]);
    onProgress?.(0);
    throw err;
  }
}

// ─── FFmpeg Commands (แยก format) ──────────────────────

async function renderVideo(ff: FFmpeg, inName: string, outName: string, opts: RenderOptions) {
  const args: string[] = [];

  // Trim options
  if (opts.trimStart !== undefined && opts.trimStart > 0) {
    args.push('-ss', String(opts.trimStart));
  }
  if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) {
    args.push('-to', String(opts.trimEnd));
  }

  args.push(
    '-i', inName,
    '-vf', 'subtitles=subs.ass',
    ...codecArgs(opts.format, opts.quality, opts.useHardwareAccel),
    // คัดลอก audio stream ตรงๆ (ไม่ re-encode)
    '-c:a', 'copy',
    '-movflags', '+faststart',
    '-y', outName,
  );

  await ff.exec(args);
}

async function renderGif(ff: FFmpeg, inName: string, outName: string, opts: RenderOptions) {
  const paletteName = 'palette.png';
  const fps = Math.max(5, Math.round(opts.fps / (opts.gifFrameSkip + 1)));
  const scale = `scale=${opts.gifMaxWidth}:-1:flags=lanczos`;
  const trimFilter = (opts.trimStart !== undefined || opts.trimEnd !== undefined)
    ? `trim=${opts.trimStart ?? 0}:${opts.trimEnd ?? 9999},setpts=PTS-STARTPTS,`
    : '';

  try {
    // Step 1: Generate palette
    const paletteArgs: string[] = [];
    if (opts.trimStart !== undefined && opts.trimStart > 0) paletteArgs.push('-ss', String(opts.trimStart));
    if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) paletteArgs.push('-to', String(opts.trimEnd));
    paletteArgs.push('-i', inName);
    paletteArgs.push('-vf', `${trimFilter}${scale},subtitles=subs.ass,palettegen=stats_mode=diff`);
    paletteArgs.push('-y', paletteName);
    await ff.exec(paletteArgs);

    // Step 2: Create GIF from palette
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
    await ff.deleteFile(paletteName).catch(() => {});
  }
}

// ─── Codec Helpers ─────────────────────────────────────

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
    case 'webm':
      return ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-cpu-used', quality === 'fast' ? '4' : '2'];
    case 'mov':
      return baseH264;
    default:
      return baseH264;
  }
}

function bitrateForQuality(quality: QualityPreset): number {
  switch (quality) {
    case 'best': return 8000;
    case 'high': return 5000;
    case 'medium': return 3000;
    case 'fast': return 1500;
  }
}

function extOf(format: ExportFormat): string {
  switch (format) {
    case 'mp4': return 'mp4';
    case 'webm': return 'webm';
    case 'mov': return 'mov';
    case 'gif': return 'gif';
  }
}

function mimeOf(format: ExportFormat): string {
  switch (format) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'gif': return 'image/gif';
  }
}

// ─── ASS Builder ───────────────────────────────────────
// รองรับ segment-based rendering (หลายสี/สไตล์ในบรรทัดเดียว)

function buildAss(subs: SubtitleEntry[], opts: RenderOptions): string {
  const l: string[] = [];

  l.push(
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 640',
    'PlayResY: 360',
    'ScaledBorderAndShadow: yes',
    '',
  );

  l.push('[V4+ Styles]');
  l.push(
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  );
  l.push(
    `Style: Default,${opts.fontFamily},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1`,
  );
  l.push('');

  l.push('[Events]');
  l.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  subs.forEach((s) => {
    if (s.segments && s.segments.length > 0) {
      const assText = s.segments.map((seg) => segmentToAss(seg)).join('');
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},Default,,0,0,0,,${assText}`);
    } else {
      l.push(
        `Dialogue: 0,${fmt(s.start)},${fmt(s.end)},Default,,0,0,0,,${s.text.replace(/\n/g, '\\N')}`,
      );
    }
  });

  return l.join('\n');
}

/**
 * แปลง TextSegment → ASS override codes
 */
function segmentToAss(seg: TextSegment): string {
  const st = seg.style;
  const tags: string[] = [];

  // Color (PrimaryColour) — ASS uses &HBBGGRR& (BGR little-endian)
  const hexColor = hexToAssColor(st.color);
  tags.push(`\\c${hexColor}`);

  // Opacity (Alpha)
  const alpha = Math.round((1 - st.opacity) * 255);
  tags.push(`\\alpha&H${alpha.toString(16).padStart(2, '0').toUpperCase()}&`);

  // Bold / Italic
  const isBold = st.fontWeight === 'bold' || st.fontWeight === 'bold-italic';
  const isItalic = st.fontWeight === 'italic' || st.fontWeight === 'bold-italic';
  tags.push(`\\b${isBold ? '1' : '0'}`);
  tags.push(`\\i${isItalic ? '1' : '0'}`);

  // Stroke (Outline)
  if (st.strokeWidth > 0 && st.strokeOpacity > 0) {
    const outlineColor = hexToAssColor(st.strokeColor);
    tags.push(`\\bord${st.strokeWidth}`);
    tags.push(`\\3c${outlineColor}`);
    const outlineAlpha = Math.round((1 - st.strokeOpacity) * 255);
    tags.push(`\\3a&H${outlineAlpha.toString(16).padStart(2, '0').toUpperCase()}&`);
  } else {
    tags.push('\\bord0');
  }

  // Shadow
  if (st.shadowOpacity > 0 && (st.shadowBlur > 0 || st.shadowOffsetX !== 0 || st.shadowOffsetY !== 0)) {
    const shadowDist = Math.max(1, Math.abs(st.shadowOffsetY));
    tags.push(`\\shad${shadowDist}`);
    const shadowColor = hexToAssColor(st.shadowColor);
    tags.push(`\\4c${shadowColor}`);
    const shadowAlpha = Math.round((1 - st.shadowOpacity) * 255);
    tags.push(`\\4a&H${shadowAlpha.toString(16).padStart(2, '0').toUpperCase()}&`);
  } else {
    tags.push('\\shad0');
  }

  const tagString = `{${tags.join('')}}`;
  return `${tagString}${escapeAssText(seg.text)}`;
}

/**
 * แปลง hex color (#RRGGBB หรือ #RGB) → ASS format (&HBBGGRR&)
 */
function hexToAssColor(hex: string): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const r = c.substring(0, 2);
  const g = c.substring(2, 4);
  const b = c.substring(4, 6);
  return `&H${b}${g}${r}&`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\n/g, '\\N')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\|/g, '\\|');
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(1, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(Math.round((s % 1) * 100)).padStart(2, '0')}`;
}

// ─── Helpers ───────────────────────────────────────────

export function downloadVideoBlob(blob: Blob, filename: string = 'subzeed-video.mp4') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke หลัง download (allow browser time to start download)
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** ตรวจสอบว่า browser รองรับ hardware acceleration (VideoToolbox) หรือไม่
 * หมายเหตุ: FFmpeg.wasm (compiled with emscripten) ไม่มี h264_videotoolbox 
 * ดังนั้นใน WASM context ห้ามใช้ hardware accel — fallback เป็น libx264 เสมอ */
export function supportsHardwareAccel(): boolean {
  // FFmpeg.wasm ไม่รองรับ h264_videotoolbox (native macOS encoder)
  // เช็คจาก user agent ว่าใช้ WASM build หรือไม่
  if (typeof window === 'undefined') return false;
  // WASM FFmpeg ไม่มี hardware encoder → return false เสมอ
  // (ในอนาคตถ้าเปลี่ยนเป็น native FFmpeg ถึงจะรองรับ)
  return false;
}

export const EXPORT_FORMATS: { value: ExportFormat; label: string; mime: string }[] = [
  { value: 'mp4',  label: 'MP4 (H.264)', mime: 'video/mp4' },
  { value: 'webm', label: 'WebM (VP9)',  mime: 'video/webm' },
  { value: 'mov',  label: 'MOV (H.264)', mime: 'video/quicktime' },
  { value: 'gif',  label: 'GIF',         mime: 'image/gif' },
];

export const QUALITY_PRESETS: { value: QualityPreset; label: string; desc: string }[] = [
  { value: 'best',   label: 'ดีที่สุด',   desc: 'CRF 18, ช้าที่สุด' },
  { value: 'high',   label: 'สูง',       desc: 'CRF 23, สมดุล' },
  { value: 'medium', label: 'ปานกลาง',   desc: 'CRF 28, ไฟล์เล็ก' },
  { value: 'fast',   label: 'เร็ว',      desc: 'CRF 35, เหมาะ preview' },
];
