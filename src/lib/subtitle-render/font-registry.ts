// ============================================================
// 🎨 Subtitle Render Module — Font Registry
// ============================================================
// เก็บ mapping ชื่อ font ที่ user เห็นใน UI ↔ ชื่อ family จริงที่
// libass ต้องใช้ + ตำแหน่งไฟล์ font + ฟังก์ชัน validate
//
// ทำไมต้องมี mapping นี้:
//   libass จำชื่อ font เป็น family name ภายในไฟล์ TTF นั้น ๆ
//   ถ้าชื่อที่ใส่ใน ASS ต่างกับ family ของ TTF → libass fallback
//   เป็น default เงียบ ๆ โดยไม่ error เลย → พิมพ์ไม่ออก
//
// ⚠️ ห้ามแตะ ffmpeg และห้ามแตะ file system ภายในไฟล์นี้
// ============================================================

import type { SubtitleStyleParams, SubtitleCue } from './types';

// ─── Registry Entry ────────────────────────────────────
export interface FontRegistryEntry {
  /** ชื่อที่ user/UI ใช้เรียก (ตาม font.value ใน ALL_FONTS) */
  value: string;
  /** label สำหรับ UI */
  label: string;
  /** ชื่อ family จริงภายในไฟล์ TTF ที่ libass ต้องใช้ (ต้องตรงเป๊ะ) */
  family: string;
  /** path ไปไฟล์ .ttf (relative ต่อ public/ หรือ URL เต็ม) */
  file: string;
  /** true ถ้าไฟล์อยู่บน CDN (ต้อง fetch) / false ถ้าอยู่ใน public (local) */
  isRemote: boolean;
  /** ชื่อไฟล์เมื่อ mount เข้า VFS ของ ffmpeg */
  vfsName: string;
}

// ─── Registry หลัก ─────────────────────────────────────
// ✅ ทุกฟอนต์ self-host ใน public/fonts/ (isRemote: false)
// ⭐ family ต้องตรงกับชื่อ family ภายใน TTF จริง เป๊ะ
//    (ตรวจจากไฟล์ TTF ที่ได้จาก google/fonts)
//
// หมายเหตุ: Arimo มีเฉพาะ placeholder เสียใน public/fonts (ไม่ใช่ TTF จริง)
// ดังนั้นจึงไม่รวม Arimo ไว้ — ใช้ Kanit เป็นฟอนต์หลัก default แทน
export const FONT_REGISTRY: FontRegistryEntry[] = [
  {
    value: 'Kanit',
    label: 'Kanit',
    family: 'Kanit',
    file: '/fonts/Kanit-Regular.ttf',
    isRemote: false,
    vfsName: 'Kanit-Regular.ttf',
  },
  {
    value: 'Itim',
    label: 'Itim',
    family: 'Itim',
    file: '/fonts/Itim-Regular.ttf',
    isRemote: false,
    vfsName: 'Itim-Regular.ttf',
  },
  {
    value: 'Chonburi',
    label: 'Chonburi',
    family: 'Chonburi',
    file: '/fonts/Chonburi-Regular.ttf',
    isRemote: false,
    vfsName: 'Chonburi-Regular.ttf',
  },
  {
    value: 'Prompt',
    label: 'Prompt',
    family: 'Prompt',
    file: '/fonts/Prompt-Regular.ttf',
    isRemote: false,
    vfsName: 'Prompt-Regular.ttf',
  },
  {
    value: 'Sarabun',
    label: 'Sarabun',
    family: 'Sarabun',
    file: '/fonts/Sarabun-Regular.ttf',
    isRemote: false,
    vfsName: 'Sarabun-Regular.ttf',
  },
  {
    value: 'Mali',
    label: 'Mali',
    family: 'Mali',
    file: '/fonts/Mali-Regular.ttf',
    isRemote: false,
    vfsName: 'Mali-Regular.ttf',
  },
  {
    value: 'Noto Sans Thai',
    label: 'Noto Sans Thai',
    family: 'Noto Sans Thai',
    file: '/fonts/NotoSansThai-Regular.ttf',
    isRemote: false,
    vfsName: 'NotoSansThai-Regular.ttf',
  },
  // ── ฟอนต์สากล (Latin) สำหรับขายต่างประเทศ ──
  {
    value: 'Roboto',
    label: 'Roboto',
    family: 'Roboto',
    file: '/fonts/Roboto-Regular.ttf',
    isRemote: false,
    vfsName: 'Roboto-Regular.ttf',
  },
  {
    value: 'Open Sans',
    label: 'Open Sans',
    family: 'Open Sans',
    file: '/fonts/OpenSans-Regular.ttf',
    isRemote: false,
    vfsName: 'OpenSans-Regular.ttf',
  },
  {
    value: 'Inter',
    label: 'Inter',
    family: 'Inter',
    file: '/fonts/Inter-Regular.ttf',
    isRemote: false,
    vfsName: 'Inter-Regular.ttf',
  },
  {
    value: 'Oswald',
    label: 'Oswald',
    family: 'Oswald',
    file: '/fonts/Oswald-Regular.ttf',
    isRemote: false,
    vfsName: 'Oswald-Regular.ttf',
  },
  {
    value: 'Poppins',
    label: 'Poppins',
    family: 'Poppins',
    file: '/fonts/Poppins-Regular.ttf',
    isRemote: false,
    vfsName: 'Poppins-Regular.ttf',
  },
  {
    value: 'Lato',
    label: 'Lato',
    family: 'Lato',
    file: '/fonts/Lato-Regular.ttf',
    isRemote: false,
    vfsName: 'Lato-Regular.ttf',
  },
];

// ─── Default Font ──────────────────────────────────────
/**
 * ฟอนต์หลัก default ของแอป
 * (ใช้ Kanit เพราะ Arimo placeholder เสียจริง ๆ)
 */
export const DEFAULT_FONT = 'Kanit';

// ─── Lookup Helpers ────────────────────────────────────
export function getFontEntry(value: string): FontRegistryEntry | undefined {
  return FONT_REGISTRY.find((f) => f.value === value);
}

/**
 * แปลงชื่อ font ที่ UI ให้ → ชื่อ family ที่ libass ต้องใช้
 * ถ้าไม่เจอ → คืนค่าเดิม (fallback default)
 */
export function resolveFamilyName(value: string): string {
  const entry = getFontEntry(value);
  return entry ? entry.family : value;
}

// ─── Error ─────────────────────────────────────────────
export type FontValidationIssue = {
  value: string;
  kind: 'unknown-font' | 'missing-file';
  message: string;
};

/**
 * validate ว่าฟอนต์ที่ style ใช้ทั้งหมดมี mapping + ไฟล์ครบ
 * ดึงจาก style หลัก + ทุก segment ทุก cue — ตรวจเฉพาะที่ job ใช้จริง
 *
 * @param issueReceiver optional — ส่ง issues ไปที่ receiver ถ้าต้องการดูทีละอัน
 * @returns string[] รายชื่อ font value ที่หาย/ผิด (ถ้า empty = ผ่าน)
 */
export function validateFonts(
  style: SubtitleStyleParams,
  cues: SubtitleCue[],
  issues?: (issue: FontValidationIssue) => void,
): string[] {
  const used = collectUsedFonts(style, cues);
  const problems: string[] = [];

  used.forEach((value) => {
    const entry = getFontEntry(value);

    if (!entry) {
      const issue: FontValidationIssue = {
        value,
        kind: 'unknown-font',
        message: `ฟอนต์ "${value}" ไม่มีใน registry — libass จะ fallback เป็น default (ทำให้พิมพ์ไม่ออก)`,
      };
      issues?.(issue);
      problems.push(value);
    }
  });

  return problems;
}

/**
 * รวมรายชื่อ font ที่ job นี้ใช้งานทั้งหมด
 * (font หลัก + font ย่อยจากทุก segment) unique
 */
export function collectUsedFonts(style: SubtitleStyleParams, cues: SubtitleCue[]): string[] {
  const set = new Set<string>();

  if (style.fontFamily) set.add(style.fontFamily);

  cues.forEach((cue) => {
    cue.segments?.forEach((seg) => {
      if (seg.style?.fontFamily) set.add(seg.style.fontFamily);
    });
  });

  return Array.from(set);
}

/**
 * เตรียมรายชื่อไฟล์ font ที่ต้อง mount เข้า VFS เฉพาะที่ job ใช้จริง
 * (เฉพาะ font ที่ปรากฏใน style + cues)
 *
 * @returns Array ของ { vfsPath, sourceUrl } — เฉพาะที่ใช้จริงเท่านั้น
 */
export function collectFontFiles(
  style: SubtitleStyleParams,
  cues: SubtitleCue[],
): { vfsName: string; source: string }[] {
  const used = collectUsedFonts(style, cues);
  const result: { vfsName: string; source: string }[] = [];

  used.forEach((value) => {
    const entry = getFontEntry(value);
    if (entry) {
      result.push({ vfsName: entry.vfsName, source: entry.file });
    }
  });

  return result;
}

/**
 * คืน VFS path ที่จะใช้ mount ลง root ของ ffmpeg
 * ⚠️ เขียนที่ root `/` โดยตรง เพื่อเลี่ยงปัญหา createDir FS error
 *    (root ของ @ffmpeg VFS มีอยู่เสมอ — ไม่ต้องสร้างโฟลเดอร์)
 */
export function fontVfsPath(vfsName: string): string {
  return `/${vfsName}`;
}
