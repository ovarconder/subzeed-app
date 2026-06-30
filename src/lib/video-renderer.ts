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
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { SubtitleEntry } from './types';

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
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  fontFamily: 'Arial',
  fontSize: 36,
  fontColor: 'white',
  strokeColor: 'black',
  position: 'bottom',
  y_offset: 90,
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

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegLoaded && ffmpeg) return ffmpeg;
  ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpegLoaded = true;
  return ffmpeg;
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

  // 1. Load FFmpeg
  onProgress?.(2);
  const ff = await getFFmpeg();
  onProgress?.(5);

  // 2. Get video data
  const videoData = typeof videoBlobOrUrl === 'string'
    ? await (await fetch(videoBlobOrUrl)).blob()
    : videoBlobOrUrl;
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
  ff.on('progress', ({ progress }) => {
    onProgress?.(Math.min(12 + Math.round(progress * 83), 95));
  });

  // 6. Build arguments
  let args: string[];

  if (opts.format === 'gif') {
    // ─── GIF Export ──────────────────────────────────
    // ใช้ palettegen + paletteuse เพื่อคุณภาพดี
    const paletteName = 'palette.png';
    const fps = Math.max(5, Math.round(opts.fps / (opts.gifFrameSkip + 1)));

    // Scale filter สำหรับ GIF (จำกัดความกว้าง)
    const scale = `scale=${opts.gifMaxWidth}:-1:flags=lanczos`;

    // Step 1: สร้าง palette
    await ff.exec([
      '-i', inName,
      '-vf', `${scale},subtitles=subs.ass,palettegen=stats_mode=diff`,
      '-y', paletteName,
    ]);

    // Step 2: สร้าง GIF จาก palette
    await ff.exec([
      '-i', inName,
      '-i', paletteName,
      '-lavfi', `${scale},subtitles=subs.ass [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`,
      '-r', String(fps),
      '-y', outName,
    ]);

    await ff.deleteFile(paletteName);
  } else {
    // ─── Video Export ────────────────────────────────
    args = [
      '-i', inName,
      '-vf', `subtitles=subs.ass`,
      ...codecArgs(opts.format, opts.quality, opts.useHardwareAccel),
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outName,
    ];

    await ff.exec(args);
  }

  // 7. Read result
  onProgress?.(97);
  const readResult = await ff.readFile(outName);
  const dataBytes: Uint8Array = typeof readResult === 'string'
    ? new TextEncoder().encode(readResult)
    : readResult;

  // Cleanup
  await ff.deleteFile(inName);
  await ff.deleteFile(outName);
  await ff.deleteFile('subs.ass');

  onProgress?.(99);
  const blob = new Blob([dataBytes.buffer.slice(0)], { type: mimeOf(opts.format) });
  onProgress?.(100);
  return blob;
}

// ─── ASS Builder ───────────────────────────────────────

function buildAss(subs: SubtitleEntry[], opts: RenderOptions): string {
  const l: string[] = [];
  l.push('[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 360', 'ScaledBorderAndShadow: yes', '');
  l.push('[V4+ Styles]');
  l.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');
  l.push(`Style: Default,${opts.fontFamily},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1`);
  l.push('');
  l.push('[Events]');
  l.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
  subs.forEach((s) => {
    l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},Default,,0,0,0,,${s.text.replace(/\n/g, '\\N')}`);
  });
  return l.join('\n');
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
