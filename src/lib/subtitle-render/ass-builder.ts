// ============================================================


// 🎨 Subtitle Render Module — ASS Builder
// ============================================================
// รับ SubtitleStyleParams + SubtitleCue[] → คืน string ของ .ass
//
// ⚠️ ห้ามแตะ ffmpeg และห้ามแตะ file system ภายในไฟล์นี้
// ทุกฟังก์ชันเป็น pure function → ทดสอบได้จากการ print string
// ออกมาดูตาเปล่า เทียบกับตัวอย่าง .ass ที่ถูกต้อง
// ============================================================

import type {
  SubtitleStyleParams,
  SubtitleCue,
  SubtitleCueSegment,
  SubtitlePosition,
  SubtitleBoxStyle,
  FontWeight,
} from './types';

// ─── Color Conversion ──────────────────────────────────
// UI ใช้ hex (#RRGGBB / #RGB) หรือ rgba() หรือชื่อสี
// ASS ใช้ &HAABBGGRR& (alpha, blue, green, red — แบบ BGR reversed)

export type AssColor = { alpha: number; bbggrr: string };

/**
 * แปลง hex (#RGB / #RRGGBB / #RRGGBBAA) → ค่า ASS
 * คืน alpha (0-255 กลับด้าน) + BBGGRR
 */
export function hexToAss(hex: string): AssColor {
  let c = (hex || '#FFFFFF').replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  if (c.length === 6) {
    // ไม่มี alpha → ไม่โปร่งใส (alpha 0)
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return { alpha: 0, bbggrr: `${bt(b)}${bt(g)}${bt(r)}` };
  }
  if (c.length === 8) {
    const alphaHex = c.substring(6, 8);
    const alphaPct = parseInt(alphaHex, 16) / 255; // เช่น 40 = 25% opacity
    const aa = Math.round((1 - alphaPct) * 255);
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return { alpha: aa, bbggrr: `${bt(b)}${bt(g)}${bt(r)}` };
  }
  // fallback: ขาว ไม่โปร่งใส
  return { alpha: 0, bbggrr: 'FFFFFF' };
}

function bt(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0').toUpperCase();
}

/**
 * แปลง opacity (0-1) → ค่า alpha ASS (0-255 กลับด้าน)
 * opacity 1 → alpha 0 (ทึบ) / opacity 0 → alpha 255 (โปร่งใส)
 */
export function opacityToAssAlpha(opacity: number): number {
  const clamped = Math.max(0, Math.min(1, opacity));
  return Math.round((1 - clamped) * 255);
}

/**
 * รวมสี hex + opacity → ASS &HAABBGGRR& string
 */
export function colorWithOpacityToAss(hex: string, opacity: number): string {
  const { bbggrr } = hexToAss(hex);
  const aa = opacityToAssAlpha(opacity);
  return `&H${bt(aa)}${bbggrr}&`;
}

// ─── Alignment Mapping ─────────────────────────────────
const ALIGNMENT_BY_POSITION: Record<SubtitlePosition, number> = {
  bottom: 2,
  middle: 5,
  top: 8,
};

// ─── Timestamp ─────────────────────────────────────────
/**
 * แปลงวินาที → H:MM:SS.CC (องศา . 1/100 วินาที)
 * เช่น 65.5 → 0:01:05.50
 */
export function formatAssTime(sec: number): string {
  const safe = Math.max(0, sec || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.round((safe % 1) * 100);
  return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ─── Text Escaping ─────────────────────────────────────
/**
 * Escape อักขระพิเศษของ ASS ในข้อความ:
 * { } → \{ \} (เพราะใช้เป็น override tag)
 * |  → \| (ตัวคั่นในบาง context)
 * ขึ้นบรรทัดใหม่ \n → \N
 */
export function escapeAssText(text: string): string {
  return text
    .replace(/\n/g, '\\N')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\|/g, '\\|');
}

// ─── Style Line Building ───────────────────────────────
export interface AssStyle {
  name: string;
  fontName: string;
  fontSize: number;
  primary: string;        // &HAABBGGRR&
  secondary: string;
  outline: string;
  back: string;           // shadow/box colour
  bold: 0 | 1;
  italic: 0 | 1;
  underline?: 0 | 1;
  strikeOut?: 0 | 1;
  borderStyle: 1 | 3;     // 1 = outline+shadow, 3 = opaque box
  outlineWidth: number;
  shadowDist: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
}

export const ASS_STYLE_LINE_FORMAT =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

/**
 * แปลง SubtitleStyleParams → row ของ Style: line ที่ใช้ห่อข้อความแต่ละบรรทัด
 */
export function buildStyleLine(style: AssStyle): string {
  return `Style: ${style.name},${style.fontName},${style.fontSize},${style.primary},${style.secondary},${style.outline},${style.back},${style.bold},${style.italic},${style.underline ?? 0},${style.strikeOut ?? 0},100,100,0,0,${style.borderStyle},${style.outlineWidth},${style.shadowDist},${style.alignment},${style.marginL},${style.marginR},${style.marginV},1`;
}

// ─── Full ASS Builder ──────────────────────────────────
/**
 * ฟังก์ชันหลัก: สร้าง .ass string ทั้งหมดจาก style + cues
 *
 * สร้าง style rows ต่อตำแหน่ง (bottom/top/middle) จาก global box
 * แล้วสำหรับ cue ที่มีตำแหน่ง/box/ย่อหน้าที่ต่างจาก global
 * จะสร้าง style row เฉพาะ (ชื่อ unique) เพื่อให้แต่ละบรรทัด
 * แสดงผลแบบที่ UI ตั้งไว้ได้ครบ
 */
export function buildAss(style: SubtitleStyleParams, cues: SubtitleCue[]): string {
  const l: string[] = [];
  l.push('[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 360', 'ScaledBorderAndShadow: yes', '');
  l.push('[V4+ Styles]');
  l.push(ASS_STYLE_LINE_FORMAT);

  // Style row ฐานตามตำแหน่ง (จาก global box) — สำหรับบรรทัดที่ไม่ override
  const baseKeys = baseStyleKeys(style);
  const styleRows: string[] = [];

  // เก็บ mapping cue → ชื่อ style row ที่จะใช้ (เพื่อ override box/position per line)
  const cueStyleName = new Map<number, string>();

  // วินาทีแรก: สร้าง style rows สำหรับ global ทั้ง 3 ตำแหน่ง
  buildPositionStyles(style).forEach((r) => styleRows.push(r));

  // จากนั้น: ตรวจว่า cue ไหนมี box/ตำแหน่งเฉพาะ → สร้าง style row เดิมเพิ่ม (ต่างจาก global)
  cues.forEach((cue, i) => {
    const pos = cue.position || style.position || 'bottom';
    const deviatesFromBase = JSON.stringify(cue.displayStyle ?? null) !== JSON.stringify(style.box ?? null);
    if (deviatesFromBase) {
      // สร้าง style row เฉพาะของบรรทัดนี้ (ใช้ box ของบรรทัดแทน global)
      const name = `d${i}_${pos}`;
      styleRows.push(buildPerLineStyle(name, style, cue.displayStyle, pos));
      cueStyleName.set(i, name);
    }
  });

  // เก็บเฉพาะ style rows ที่ unique (กันซ้ำ)
  const seen = new Set<string>();
  styleRows.forEach((r) => { if (!seen.has(r)) { seen.add(r); l.push(r); } });
  l.push('');

  l.push('[Events]');
  l.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
  cues.forEach((cue, i) => {
    const styleName = cueStyleName.get(i) || cue.position || style.position || 'bottom';
    l.push(buildDialogue(cue, style, styleName, style));
  });

  return l.join('\n');
}

/**
 * key รวมของ box ที่ทำให้ global styles ทั้ง 3 ต่างกันน้อยหรือไม่
 */
function baseStyleKeys(style: SubtitleStyleParams): string {
  return JSON.stringify({ box: style.box, seg: style.defaultSegmentStyle });
}

/**
 * สร้าง style row เฉพาะเส้น โดยใช้ box ของเส้น (displayStyle) — ตำแหน่งนี้
 */
function buildPerLineStyle(
  name: string,
  style: SubtitleStyleParams,
  displayStyle: SubtitleBoxStyle | undefined,
  pos: SubtitlePosition,
): string {
  const box = displayStyle;
  const seg = style.defaultSegmentStyle;

  const useBox = box && box.bgActive !== false && box.bgOpacity > 0;
  const borderStyle: 1 | 3 = useBox ? 3 : 1;
  const outlineWidth = useBox ? 0 : seg && seg.strokeActive !== false && seg.strokeWidth ? seg.strokeWidth : 0;
  const shadowDist = useBox ? 0 : seg && seg.shadowActive !== false && seg.shadowOffsetY ? Math.abs(seg.shadowOffsetY) : 0;
  const padL = useBox ? Math.round(box.paddingX ?? 12) : 0;
  const padR = useBox ? Math.round(box.paddingX ?? 12) : 0;
  const padV = useBox ? Math.round(box.paddingY ?? 6) : 0;

  return buildStyleLine({
    name,
    fontName: style.fontFamily,
    fontSize: style.fontSize ?? 24,
    primary: seg?.color ? colorWithOpacityToAss(seg.color, seg.opacity ?? 1) : '&H00FFFFFF&',
    secondary: '&H000000FF&',
    outline: seg?.strokeColor ? colorWithOpacityToAss(seg.strokeColor, seg.strokeOpacity ?? 1) : '&H00000000&',
    back: box?.bgColor && box.bgActive !== false
      ? colorWithOpacityToAss(box.bgColor, box.bgOpacity ?? 0.6)
      : '&H80000000&',
    bold: seg && (seg.fontWeight === 'bold' || seg.fontWeight === 'bold-italic') ? 1 : 0,
    italic: seg && (seg.fontWeight === 'italic' || seg.fontWeight === 'bold-italic') ? 1 : 0,
    borderStyle,
    outlineWidth,
    shadowDist,
    marginL: padL,
    marginR: padR,
    alignment: ALIGNMENT_BY_POSITION[pos],
    marginV: posVOffset(pos, style.y_offset ?? 0, padV),
  });
}

/**
 * สร้าง Style rows สำหรับทั้ง 3 ตำแหน่ง
 */
export function buildPositionStyles(style: SubtitleStyleParams): string[] {
  const fontName = style.fontFamily;
  const fontSize = style.fontSize ?? 24;
  const position = style.position || 'bottom';
  const yOffsetPct = style.y_offset ?? 0;

  const seg = style.defaultSegmentStyle;
  const box = style.box;

  const primaryColour = seg?.color
    ? colorWithOpacityToAss(seg.color, seg.opacity ?? 1)
    : '&H00FFFFFF&';
  const outlineColour = seg?.strokeColor
    ? colorWithOpacityToAss(seg.strokeColor, seg.strokeOpacity ?? 1)
    : '&H00000000&';
  const backColour = box?.bgColor && box.bgActive !== false
    ? colorWithOpacityToAss(box.bgColor, box.bgOpacity ?? 0.6)
    : '&H80000000&';

  const bold = seg && (seg.fontWeight === 'bold' || seg.fontWeight === 'bold-italic') ? 1 : 0;
  const italic = seg && (seg.fontWeight === 'italic' || seg.fontWeight === 'bold-italic') ? 1 : 0;

  // กำหนด BorderStyle/Outline/Shadow จาก box (background) + segment (stroke/shadow)
  // - ถ้ามี background box → BorderStyle=3 (opaque box) ใช้ Padding เป็น margin
  const useBox = box && box.bgActive !== false && box.bgOpacity > 0;
  const borderStyle: 1 | 3 = useBox ? 3 : 1;
  const outlineWidth = useBox ? 0 : seg && seg.strokeActive !== false && seg.strokeWidth ? seg.strokeWidth : 0;
  const shadowDist = useBox ? 0 : seg && seg.shadowActive !== false && seg.shadowOffsetY ? Math.abs(seg.shadowOffsetY) : 0;

  // margin จาก padding ของ box (ขยายรอบข้อความ)
  const padL = useBox ? Math.round(box.paddingX ?? 12) : 0;
  const padR = useBox ? Math.round(box.paddingX ?? 12) : 0;
  const padV = useBox ? Math.round(box.paddingY ?? 6) : 0;

  const common: Omit<AssStyle, 'name' | 'alignment' | 'marginV'> = {
    fontName,
    fontSize,
    primary: primaryColour,
    secondary: '&H000000FF&',
    outline: outlineColour,
    back: backColour,
    bold,
    italic,
    borderStyle,
    outlineWidth,
    shadowDist,
    marginL: padL,
    marginR: padR,
  };

  const positions: SubtitlePosition[] = ['bottom', 'middle', 'top'];
  return positions.map((pos) => {
    const marginV = posVOffset(pos, yOffsetPct, padV);
    return buildStyleLine({
      ...common,
      name: pos,
      alignment: ALIGNMENT_BY_POSITION[pos],
      marginV,
    });
  });
}

/**
 * คำนวณ marginV สำหรับตำแหน่ง + y-offset (%)
 * y_offset 0-100 → เปอร์เซ็นต์ของความสูงจอ (PlayResY = 360)
 * bottom: marginV = padV + (y_offset/100 * 300)  (ยกขึ้นจากล่าง) — ใช้ 300 เผื่อขอบ
 * top/middle ใช้ค่า default + padV
 */
function posVOffset(pos: SubtitlePosition, yOffsetPct: number, padV: number): number {
  const offset = Math.max(0, Math.min(100, yOffsetPct || 0));
  switch (pos) {
    case 'bottom':
      return padV + Math.round((offset / 100) * 300);
    case 'top':
      return padV + 10;
    case 'middle':
    default:
      return padV;
  }
}

// ─── Dialogue Line ─────────────────────────────────────
/**
 * แปลง 1 cue → Dialogue: line
 * รองรับทั้งข้อความ plain (text) และ segment (หลายสไตล์)
 *
 * @param cue             แถว cue
 * @param style           global style
 * @param styleName       ชื่อ style row ที่จะใช้ (อาจเป็น style line เฉพาะ)
 * @param globalStyle     ใช้คำนวณ marginV หาจาก global box + y_offset base
 */
export function buildDialogue(
  cue: SubtitleCue,
  style: SubtitleStyleParams,
  styleName: string = cue.position || 'bottom',
  globalStyle: SubtitleStyleParams = style,
): string {
  const start = formatAssTime(cue.start);
  const end = formatAssTime(cue.end);
  const pos = cue.position || style.position || 'bottom';

  let text: string;
  if (cue.segments && cue.segments.length > 0) {
    text = buildSegmentText(cue.segments, style);
  } else {
    text = escapeAssText(cue.text || '');
  }

  // marginV ของ dialogue — ใช้ y_offset ของ cue เป็นหลัก (override global)
  // Padding ประมาณจาก global box (well enough) — marginV = y_offset% → px
  const yPct = cue.y_offset ?? globalStyle.y_offset ?? 0;
  const useBox = (cue.displayStyle ?? globalStyle.box)?.bgActive !== false;
  const padV = useBox ? Math.round((cue.displayStyle ?? globalStyle.box)?.paddingY ?? 0) : 0;
  const marginV = posVOffset(pos, yPct, padV);

  // ใช้ marginL/R ปกติจาก style row (0) — marginV ได้จากนี้
  return `Dialogue: 0,${start},${end},${styleName},,0,0,${marginV},,${text}`;
}

/**
 * แปลง segment list → ASS text พร้อม override tags
 */
export function buildSegmentText(segments: SubtitleCueSegment[], style: SubtitleStyleParams): string {
  return segments
    .map((seg) => {
      const tags: string[] = [];

      // Font name — ต้องตรงกับ font registry เป๊ะ
      const segFont = seg.style?.fontFamily || style.fontFamily;
      tags.push(`\\fn${segFont}`);

      // Font size
      const segSize = seg.style?.fontSize || style.fontSize;
      if (segSize !== style.fontSize) tags.push(`\\fs${segSize}`);

      // Font weight / italic
      const fw = (seg.style?.fontWeight || style.defaultSegmentStyle?.fontWeight || 'normal') as FontWeight;
      const isBold = fw === 'bold' || fw === 'bold-italic';
      const isItalic = fw === 'italic' || fw === 'bold-italic';
      tags.push(`\\b${isBold ? 1 : 0}`);
      tags.push(`\\i${isItalic ? 1 : 0}`);

      // Color
      const segColor = seg.style?.color || style.defaultSegmentStyle?.color || '#FFFFFF';
      const segOpacity = seg.style?.opacity ?? style.defaultSegmentStyle?.opacity ?? 1;
      tags.push(`\\c${colorWithOpacityToAss(segColor, segOpacity)}`);

      // Stroke (outline) เฉพาะของ segment นี้
      const strokeActive = seg.style?.strokeActive ?? style.defaultSegmentStyle?.strokeActive ?? false;
      if (strokeActive && (seg.style?.strokeWidth ?? 0) > 0) {
        const sw = seg.style?.strokeWidth ?? 0;
        const sc = seg.style?.strokeColor || '#000000';
        const so = seg.style?.strokeOpacity ?? 1;
        tags.push(`\\bord${sw}`);
        tags.push(`\\3c${colorWithOpacityToAss(sc, so)}`);
      } else {
        tags.push('\\bord0');
      }

      // Shadow เฉพาะของ segment นี้
      const shadowActive = seg.style?.shadowActive ?? style.defaultSegmentStyle?.shadowActive ?? false;
      if (shadowActive && (seg.style?.shadowOffsetY ?? 0) !== 0) {
        const sd = Math.max(1, Math.abs(seg.style?.shadowOffsetY ?? 1));
        const shc = seg.style?.shadowColor || '#000000';
        const sho = seg.style?.shadowOpacity ?? 0.5;
        tags.push(`\\shad${sd}`);
        tags.push(`\\4c${colorWithOpacityToAss(shc, sho)}`);
      } else {
        tags.push('\\shad0');
      }

      const tagString = `{${tags.join('')}}`;
      return `${tagString}${escapeAssText(seg.text)}`;
    })
    .join('');
}

// ─── Convenience: ฟังก์ชันเดียวสำหรับ .srt-style ง่าย ๆ ──
/**
 * สร้าง ASS โดยใช้ข้อความ plain (ไม่แบ่ง segment) ค่าเริ่มต้นง่าย ๆ
 * ใช้สำหรับ test spike (5 วิ หนึ่งบรรทัด) เป็นหลัก
 */
export function buildAssSimple(text: string, start: number, end: number, opts?: Partial<SubtitleStyleParams>): string {
  const style: SubtitleStyleParams = {
    fontFamily: opts?.fontFamily || 'Kanit',
    fontSize: opts?.fontSize || 36,
    position: opts?.position || 'bottom',
    y_offset: opts?.y_offset ?? 0,
    defaultSegmentStyle: opts?.defaultSegmentStyle,
  };
  const cue: SubtitleCue = {
    start,
    end,
    text,
  };
  return buildAss(style, [cue]);
}
