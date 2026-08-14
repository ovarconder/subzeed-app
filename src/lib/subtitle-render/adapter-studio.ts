// ============================================================
// 🎨 Subtitle Render Module — Studio Adapter
// ============================================================
// ใช้เชื่อม "UI เก่า (studio)" กับ "renderer ใหม่ (subtitle-render)"
// โดยไม่ให้ UI ต้องรู้จัก type ใหม่ของ renderer
//
// หน้าที่: แปลง data จาก store เดิม (SubtitleEntry[]) + options
// ที่ studio ส่งอยู่เดิม → RenderJobConfig ที่ renderSubtitleVideo ใช้
//
// UI เก่า (/app/studio) ใช้ type จาก `@/lib/types`:
//   SubtitleEntry, TextSegmentStyle, SubtitleDisplayStyle, FontConfig
// renderer ใหม่ใช้ type จาก `./types`:
//   SubtitleCue, SubtitleSegmentStyle, SubtitleBoxStyle
//
// ตัว adapter นี้ map สองชุดนั้นหากัน
// ============================================================

import type {
  SubtitleEntry,
  SubtitleDisplayStyle,
  TextSegmentStyle,
} from '@/lib/types';
import { DEFAULT_DISPLAY_STYLE } from '@/lib/types';
import type {
  RenderJobConfig,
  SubtitleBoxStyle,
  SubtitleCue,
  SubtitleSegmentStyle,
  RenderFormat,
  QualityPreset,
} from './types';

// ─── Options ที่ studio เดิมส่ง (เหมือนเดิม เดิมให้ renderVideoWithSubtitles) ──
export interface StudioRenderOptions {
  fontFamily: string;
  fontSize: number;
  fontColor?: string;
  strokeColor?: string;
  position?: 'bottom' | 'top' | 'middle';
  y_offset: number;
  format: RenderFormat;
  fps: number;
  quality: QualityPreset;
  useHardwareAccel: boolean;
  gifMaxWidth: number;
  gifFrameSkip: number;
  trimStart?: number;
  trimEnd?: number;
}

/**
 * แปลง TextSegmentStyle (UI เดิม) → SubtitleSegmentStyle (renderer ใหม่)
 * field ทั้งหมดตรงกันอยู่แล้ว (map 1:1)
 */
function mapSegmentStyle(st: TextSegmentStyle | undefined): Partial<SubtitleSegmentStyle> | undefined {
  if (!st) return undefined;
  return {
    strokeActive: st.strokeActive,
    shadowActive: st.shadowActive,
    color: st.color,
    opacity: st.opacity,
    strokeColor: st.strokeColor,
    strokeWidth: st.strokeWidth,
    strokeOpacity: st.strokeOpacity,
    shadowColor: st.shadowColor,
    shadowOpacity: st.shadowOpacity,
    shadowOffsetX: st.shadowOffsetX,
    shadowOffsetY: st.shadowOffsetY,
    shadowBlur: st.shadowBlur,
    shadowAngle: st.shadowAngle,
    fontWeight: st.fontWeight,
    fontFamily: st.fontFamily,
    fontSize: st.fontSize,
  };
}

/**
 * แปลง SubtitleDisplayStyle (UI เดิม, ต่อบรรทัด) → SubtitleBoxStyle (renderer ใหม่)
 * boxShadow เดิมมี active/offsetX/offsetY/blur/spread/color/opacity → map ไปของใหม่
 */
function mapDisplayStyle(ds: SubtitleDisplayStyle | undefined): SubtitleBoxStyle | undefined {
  if (!ds) return undefined;
  return {
    bgActive: ds.bgActive,
    bgOpacity: ds.bgOpacity,
    bgColor: ds.bgColor,
    borderRadius: ds.borderRadius,
    paddingY: ds.paddingY,
    paddingX: ds.paddingX,
    boxShadow: {
      active: ds.boxShadow.active,
      offsetX: ds.boxShadow.offsetX,
      offsetY: ds.boxShadow.offsetY,
      blur: ds.boxShadow.blur,
      spread: ds.boxShadow.spread,
      color: ds.boxShadow.color,
      opacity: ds.boxShadow.opacity,
    },
  };
}

/**
 * แปลง SubtitleEntry[] (UI เดิม) → SubtitleCue[] (renderer ใหม่)
 * โดยคง position/y_offset/displayStyle/segments ครบตามที่มีในแต่ละบรรทัด
 */
export function studioEntriesToCues(subtitles: SubtitleEntry[]): SubtitleCue[] {
  return subtitles.map((s) => {
    // segments: ถ้ามีใช้เลย (map style), ถ้าไม่มี fallback เป็น text อย่างเดียว
    const segments = s.segments && s.segments.length > 0
      ? s.segments.map((seg) => ({
          text: seg.text,
          style: mapSegmentStyle(seg.style),
        }))
      : undefined;

    return {
      start: s.start,
      end: s.end,
      text: s.text,
      segments,
      position: s.position,
      y_offset: s.y_offset,
      displayStyle: mapDisplayStyle(s.displayStyle),
    };
  });
}

/**
 * สร้าง RenderJobConfig ฉบับสมบูรณ์จากข้อมูลที่ studio มีอยู่
 *
 * @param videoBlobOrUrl  ไฟล์วิดีโอ (Blob หรือ URL)
 * @param subtitles       รายการซับแบบ UI เดิม (SubtitleEntry[])
 * @param opts            options เดียวกับที่ renderVideoWithSubtitles เคยรับ
 */
export function buildRenderConfig(
  videoBlobOrUrl: Blob | string,
  subtitles: SubtitleEntry[],
  opts: Partial<StudioRenderOptions>,
): RenderJobConfig {
  // ค่า default ตรงกับที่ studio เดิมเคยใช้
  const format: RenderFormat = opts.format || 'mp4';
  const quality: QualityPreset = opts.quality || 'high';

  // default segment style (ถ้า UI ไม่ได้ระบุ) — ใช้สีขาว opacity 1 ไม่มี stroke/shadow
  const defaultSegmentStyle: SubtitleSegmentStyle = {
    strokeActive: false,
    shadowActive: false,
    color: opts.fontColor || '#FFFFFF',
    opacity: 1,
    strokeColor: opts.strokeColor || '#000000',
    strokeWidth: 2,
    strokeOpacity: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowBlur: 4,
    shadowAngle: 0,
    fontWeight: 'normal',
  };

  return {
    videoSource: videoBlobOrUrl,
    cues: studioEntriesToCues(subtitles),
    style: {
      fontFamily: opts.fontFamily || 'Kanit',
      fontSize: opts.fontSize || 24,
      position: opts.position || 'bottom',
      y_offset: opts.y_offset ?? 0,
      // ⭐ ให้ global box มีค่าเริ่มต้นเดียวกับ DEFAULT_DISPLAY_STYLE (มีกล่องตามดีไซน์)
      //    เพื่อให้บรรทัดที่ไม่มี displayStyle ต่อเส้น ก็ยังได้กล่องเหมือนใน canvas preview
      box: DEFAULT_DISPLAY_STYLE,
      defaultSegmentStyle,
    },
    output: {
      format,
      quality,
      fps: opts.fps || (format === 'gif' ? 10 : 30),
      useHardwareAccel: opts.useHardwareAccel ?? false,
      gifMaxWidth: opts.gifMaxWidth || 480,
      gifFrameSkip: opts.gifFrameSkip ?? (format === 'gif' ? 1 : 0),
    },
    trimStart: opts.trimStart,
    trimEnd: opts.trimEnd,
  };
}
