// ============================================================
// 🎥 Video Renderer — SubZeed
// ============================================================
// ใช้ FFmpeg.wasm (ฝั่ง Client) เพื่อสร้างวิดีโอ hardsub
// รองรับ: MP4 (H.264), WebM (VP9), MOV, GIF
//
// ข้อดีเหนือ MediaRecorder:
//   - รองรับ MP4 (H.264) — format ยอดนิยม
//   - encode เร็วกว่า (FFmpeg optimized)
//   - sync audio + subtitle อัตโนมัติ
//   - Hardware acceleration (videotoolbox บน Mac)
// ============================================================

import { FFmpeg } from '@ffmpeg/ffmpeg';
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

// ─── FFmpeg Singleton ──────────────────────────────────
// ใช้ CDN (unpkg) เพราะ Vercel มี timeout limit สำหรับไฟล์ 31MB

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;
let ffmpegLoadError: string | null = null;

const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegLoaded && ffmpeg) return ffmpeg;
  if (ffmpegLoadError) {
    throw new Error(`FFmpeg โหลดไม่สำเร็จ (ก่อนหน้า): ${ffmpegLoadError}`);
  }

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ type, message }) => {
    if (type === 'error') console.error('[ffmpeg]', message);
  });

  try {
    console.log('[ffmpeg] Loading from CDN...');
    await ffmpeg.load({
      coreURL: `${FFMPEG_BASE}/ffmpeg-core.js`,
      wasmURL: `${FFMPEG_BASE}/ffmpeg-core.wasm`,
    });
    ffmpegLoaded = true;
    console.log('[ffmpeg] Loaded from CDN');
    return ffmpeg;
  } catch (err) {
    ffmpegLoadError = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ffmpeg] Load failed:', ffmpegLoadError);
    throw new Error(`ไม่สามารถโหลด FFmpeg.wasm: ${ffmpegLoadError}`);
  }
}

// ─── Codec helpers ─────────────────────────────────────

function codecArgs(format: ExportFormat, quality: QualityPreset, hwAccel: boolean): string[] {
  if (format === 'gif') return []; // handled separately

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

/** bitrate (kbps) สำหรับ hardware encoder ที่ไม่รองรับ CRF */
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
    // 1. Load FFmpeg
    onProgress?.(2);
    const ff = await getFFmpeg();
    onProgress?.(5);

    // 2. Get video data
    onProgress?.(6);
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

    // 3. Write input to virtual FS
    const inName = `input.${ext === 'gif' ? 'mp4' : ext}`;
    await ff.writeFile(inName, await fetchFile(videoData));
    onProgress?.(10);

    // 4. Build ASS subtitle
    const ass = buildAss(subtitles, opts);
    await ff.writeFile('subs.ass', ass);
    onProgress?.(12);

    // 5. FFmpeg progress
    const outName = `output.${ext}`;
    ff.on('progress', ({ progress: pct }) => {
      const mapped = Math.min(12 + Math.round(pct * 83), 95);
      onProgress?.(mapped);
    });

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

    // Cleanup
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
    await ff.deleteFile('subs.ass').catch(() => {});

    if (dataBuffer.byteLength === 0) throw new Error('FFmpeg สร้างไฟล์ว่างเปล่า');

    onProgress?.(99);
    const blob = new Blob([dataBuffer], { type: mimeOf(opts.format) });
    onProgress?.(100);
    return blob;
  } catch (err) {
    // clean progress state
    onProgress?.(0);
    throw err; // โยนให้ caller จัดการ
  }
}

/** แยก render video ออกมาให้อ่านง่ายขึ้น */
async function renderVideo(ff: FFmpeg, inName: string, outName: string, opts: RenderOptions) {
  const args: string[] = [];
  // trim options ก่อน -i
  if (opts.trimStart !== undefined && opts.trimStart > 0) {
    args.push('-ss', String(opts.trimStart));
  }
  if (opts.trimEnd !== undefined && opts.trimEnd > opts.trimStart!) {
    args.push('-to', String(opts.trimEnd));
  }
  args.push('-i', inName);
  args.push('-vf', 'subtitles=subs.ass');
  args.push(...codecArgs(opts.format, opts.quality, opts.useHardwareAccel));
  args.push('-c:a', 'aac', '-b:a', '128k');
  args.push('-movflags', '+faststart');
  args.push('-y', outName);
  await ff.exec(args);
}

/** แยก render GIF ออกมา */
async function renderGif(ff: FFmpeg, inName: string, outName: string, opts: RenderOptions) {
  const paletteName = 'palette.png';
  const fps = Math.max(5, Math.round(opts.fps / (opts.gifFrameSkip + 1)));
  const scale = `scale=${opts.gifMaxWidth}:-1:flags=lanczos`;
  const trimFilter = (opts.trimStart !== undefined || opts.trimEnd !== undefined)
    ? `trim=${opts.trimStart ?? 0}:${opts.trimEnd ?? 9999},setpts=PTS-STARTPTS,`
    : '';

  try {
    // Step 1: palette
    const paletteArgs: string[] = [];
    if (opts.trimStart !== undefined && opts.trimStart > 0) paletteArgs.push('-ss', String(opts.trimStart));
    if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) paletteArgs.push('-to', String(opts.trimEnd));
    paletteArgs.push('-i', inName);
    paletteArgs.push('-vf', `${trimFilter}${scale},subtitles=subs.ass,palettegen=stats_mode=diff`);
    paletteArgs.push('-y', paletteName);
    await ff.exec(paletteArgs);

    // Step 2: GIF from palette
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

// ─── ASS Builder ───────────────────────────────────────
// รองรับ segment-based rendering (หลายสี/สไตล์ในบรรทัดเดียว)
// ใช้ ASS override codes: {\c&Hxxxxxx&}, {\b1}, {\i1}, {\bord}, {\shad} etc.

function buildAss(subs: SubtitleEntry[], opts: RenderOptions): string {
  const l: string[] = [];
  l.push('[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 360', 'ScaledBorderAndShadow: yes', '');
  l.push('[V4+ Styles]');
  l.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');
  // Default style (ใช้เมื่อไม่มี segment override)
  l.push(`Style: Default,${opts.fontFamily},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1`);
  l.push('');
  l.push('[Events]');
  l.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
  subs.forEach((s) => {
    // ถ้ามี segments ให้ render แบบหลายสี
    if (s.segments && s.segments.length > 0) {
      const assText = s.segments.map(seg => segmentToAss(seg, opts)).join('');
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},Default,,0,0,0,,${assText}`);
    } else {
      // Fallback: ใช้ข้อความ plain
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},Default,,0,0,0,,${s.text.replace(/\n/g, '\\N')}`);
    }
  });
  return l.join('\n');
}

/**
 * แปลง TextSegment → ASS override codes
 * รองรับ: สี (PrimaryColour), Bold, Italic, Border (Outline), Shadow
 */
function segmentToAss(seg: TextSegment, opts: RenderOptions): string {
  const st = seg.style;
  const tags: string[] = [];

  // ─── Color (PrimaryColour) ──────────────────────────
  // ASS ใช้สีรูปแบบ &HBBGGRR& (little-endian)
  const hexColor = hexToAssColor(st.color);
  tags.push(`\\c${hexColor}`);

  // ─── Opacity (Alpha) ────────────────────────────────
  // ASS alpha = 255 - (opacity * 255) แปลงเป็น &HFF&
  const alpha = Math.round((1 - st.opacity) * 255);
  tags.push(`\\alpha&H${alpha.toString(16).padStart(2, '0').toUpperCase()}&`);

  // ─── Bold ────────────────────────────────────────────
  const isBold = st.fontWeight === 'bold' || st.fontWeight === 'bold-italic';
  const isItalic = st.fontWeight === 'italic' || st.fontWeight === 'bold-italic';
  tags.push(`\\b${isBold ? '1' : '0'}`);
  tags.push(`\\i${isItalic ? '1' : '0'}`);

  // ─── Stroke (Outline) ───────────────────────────────
  if (st.strokeWidth > 0 && st.strokeOpacity > 0) {
    const outlineColor = hexToAssColor(st.strokeColor);
    tags.push(`\\bord${st.strokeWidth}`);
    tags.push(`\\3c${outlineColor}`);
    // Outline alpha
    const outlineAlpha = Math.round((1 - st.strokeOpacity) * 255);
    tags.push(`\\3a&H${outlineAlpha.toString(16).padStart(2, '0').toUpperCase()}&`);
  } else {
    tags.push('\\bord0');
  }

  // ─── Shadow ──────────────────────────────────────────
  if (st.shadowOpacity > 0 && (st.shadowBlur > 0 || st.shadowOffsetX !== 0 || st.shadowOffsetY !== 0)) {
    // ASS shadow distance (ใช้ offset Y เป็นหลัก เพราะ ASS shadow เป็นทิศทางเดียว)
    const shadowDist = Math.max(1, Math.abs(st.shadowOffsetY));
    tags.push(`\\shad${shadowDist}`);
    const shadowColor = hexToAssColor(st.shadowColor);
    tags.push(`\\4c${shadowColor}`);
    const shadowAlpha = Math.round((1 - st.shadowOpacity) * 255);
    tags.push(`\\4a&H${shadowAlpha.toString(16).padStart(2, '0').toUpperCase()}&`);
  } else {
    tags.push('\\shad0');
  }

  // ─── Font Size (ใช้ของ segment ถ้าต้องการต่าง) ─────
  // ใช้ขนาดปกติ

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
  // ASS ใช้ RGB แต่สลับเป็น BGR (little-endian)
  const r = c.substring(0, 2);
  const g = c.substring(2, 4);
  const b = c.substring(4, 6);
  return `&H${b}${g}${r}&`;
}

/**
 * Escape ข้อความสำหรับ ASS (ป้องกันอักขระพิเศษ)
 */
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
  URL.revokeObjectURL(url);
}

/** ตรวจสอบว่า browser รองรับ hardware acceleration (VideoToolbox) หรือไม่ */
export function supportsHardwareAccel(): boolean {
  if (typeof window === 'undefined') return false;
  // macOS Safari/Chromium มี videotoolbox
  const isMac = navigator.platform?.toLowerCase().includes('mac');
  // Chrome, Edge, Safari ทุกตัวบน Mac รองรับ
  return isMac;
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
