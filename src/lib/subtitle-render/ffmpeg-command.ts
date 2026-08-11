// ============================================================
// 🎨 Subtitle Render Module — FFmpeg Command Builder
// ============================================================
// รับ path ของ video input, path ของ ass, path ของ fontsdir,
// และ output settings → คืน array ของ argument ที่ส่งเข้า ffmpeg.exec()
//
// แยกไฟล์นี้ไว้เพราะ command ของ ffmpeg เป็นจุดที่ต้องปรับบ่อย
// ตอน debug (ลอง encoder / preset / filter ต่าง ๆ)
//
// ⚠️ ห้ามแตะ ffmpeg instance และห้ามแตะ file system ภายในไฟล์นี้
// เป็น pure function คืน argument arrays
// ============================================================

import type { RenderFormat, QualityPreset } from './types';

// ─── Output Settings (ไม่รวม format ที่ overlap กับ video) ──
export interface CommandOutputSettings {
  format: RenderFormat;
  quality: QualityPreset;
  fps: number;
  /** ใช้ hardware acceleration (ถ้า browser รองรับ) */
  useHardwareAccel: boolean;
  /** สำหรับ GIF เท่านั้น */
  gifMaxWidth: number;
  gifFrameSkip: number;
  /** ตัดวิดีโอเฉพาะช่วง (วินาที) */
  trimStart?: number;
  trimEnd?: number;
}

// ─── Codec mapping ─────────────────────────────────────
const CRF_MAP: Record<QualityPreset, number> = { best: 18, high: 23, medium: 28, fast: 35 };
const VP9_CRF_MAP: Record<QualityPreset, number> = { best: 25, high: 30, medium: 35, fast: 40 };

function bitrateForQuality(quality: QualityPreset): number {
  switch (quality) {
    case 'best': return 8000;
    case 'high': return 5000;
    case 'medium': return 3000;
    case 'fast': return 1500;
  }
}

function codecArgs(format: RenderFormat, quality: QualityPreset, hwAccel: boolean): string[] {
  if (format === 'gif') return [];
  const crf = format === 'webm' ? VP9_CRF_MAP[quality] : CRF_MAP[quality];

  if (format === 'webm') {
    return ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-cpu-used', quality === 'fast' ? '4' : '2'];
  }

  // H264/MP4/MOV
  const base: string[] = [
    '-c:v', hwAccel ? 'h264_videotoolbox' : 'libx264',
    '-preset', quality === 'best' ? 'slow' : quality === 'fast' ? 'veryfast' : 'ultrafast',
  ];
  if (hwAccel) {
    base.push('-b:v', String(bitrateForQuality(quality)));
  } else {
    base.push('-crf', String(crf));
  }
  base.push('-pix_fmt', 'yuv420p');
  return base;
}

// ─── Trim helpers ──────────────────────────────────────
function trimArgs(out: CommandOutputSettings): string[] {
  const args: string[] = [];
  if ((out.trimStart ?? 0) > 0) args.push('-ss', String(out.trimStart));
  if (out.trimEnd !== undefined && out.trimEnd > (out.trimStart ?? 0)) args.push('-to', String(out.trimEnd));
  return args;
}

// ─── Build video command (mp4/webm/mov) ────────────────
/**
 * คืน argument array สำหรับ render วิดีโอ (ไม่ใช่ GIF)
 */
export function buildVideoCommand(
  inputPath: string,
  assPath: string,
  fontsDir: string,
  outPath: string,
  output: CommandOutputSettings,
): string[] {
  const args: string[] = [];

  // Trim มาก่อน -i
  args.push(...trimArgs(output));
  args.push('-i', inputPath);

  // subtitles filter + fontsdir (ดู comment ด้านล่างว่าทำไมต้อง fontsdir)
  // ⭐ 'FontName' ใน ASS ต้องตรงกับ family ของ TTF; แล้ว ffmpeg ต้องรู้อีกว่า
  // font อยู่ที่ไหน → ใช้ filter option `fontsdir` บอก VFS path ไว้
  // ถ้าไม่มีบรรทัดนี้ libass จะหาฟอนต์ไม่เจอ → fallback default เงียบ ๆ
  args.push('-vf', `subtitles=${assPath}:fontsdir=${fontsDir}`);

  args.push(...codecArgs(output.format, output.quality, output.useHardwareAccel));
  args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart');
  args.push('-y', outPath);

  return args;
}

// ─── Build GIF commands (palette 2-step) ───────────────
export interface GifCommands {
  /** command 1: สร้าง palette.png */
  palette: string[];
  /** command 2: useEffect palette สร้าง GIF */
  gif: string[];
  /** path ของ palette file (ต้อง cleanup) */
  palettePath: string;
}

/**
 * สร้าง command สำหรับ GIF — เป็น 2-step (palette + paletteuse)
 */
export function buildGifCommands(
  inputPath: string,
  assPath: string,
  fontsDir: string,
  outPath: string,
  output: CommandOutputSettings,
): GifCommands {
  const palettePath = 'palette.png';
  const fps = Math.max(5, Math.round(output.fps / (output.gifFrameSkip + 1)));
  const scale = `scale=${output.gifMaxWidth}:-1:flags=lanczos`;
  const trimFilter = (output.trimStart !== undefined || output.trimEnd !== undefined)
    ? `trim=${output.trimStart ?? 0}:${output.trimEnd ?? 9999},setpts=PTS-STARTPTS,`
    : '';
  const subF = `subtitles=${assPath}:fontsdir=${fontsDir}`;

  // Step 1: palette
  const paletteArgs: string[] = [];
  if ((output.trimStart ?? 0) > 0) paletteArgs.push('-ss', String(output.trimStart));
  if (output.trimEnd !== undefined && output.trimEnd > (output.trimStart ?? 0)) paletteArgs.push('-to', String(output.trimEnd));
  paletteArgs.push('-i', inputPath);
  paletteArgs.push('-vf', `${trimFilter}${scale},${subF},palettegen=stats_mode=diff`);
  paletteArgs.push('-y', palettePath);

  // Step 2: gif
  const gifArgs: string[] = [];
  if ((output.trimStart ?? 0) > 0) gifArgs.push('-ss', String(output.trimStart));
  if (output.trimEnd !== undefined && output.trimEnd > (output.trimStart ?? 0)) gifArgs.push('-to', String(output.trimEnd));
  gifArgs.push('-i', inputPath, '-i', palettePath);
  gifArgs.push('-lavfi', `${trimFilter}${scale},${subF} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`);
  gifArgs.push('-r', String(fps));
  gifArgs.push('-y', outPath);

  return { palette: paletteArgs, gif: gifArgs, palettePath };
}
