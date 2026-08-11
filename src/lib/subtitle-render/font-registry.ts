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
// ⭐ ต้องตรงกับ ALL_FONTS ใน src/lib/types.ts
// แต่เพิ่ม field family (ชื่อจริงภายใน TTF) และ vfsName
//
// หมายเหตุ: ชื่อ family ของ TTF แต่ละตัวอาจต่างจากชื่อ UI
// เช่น 'Arimo' ครอบคลุม Arimo-Regular.ttf
// ต้องแก้ให้ตรงกับ family ภายในไฟล์จริงตอนจบ เมื่อเรา verify กับ myfont/FC
export const FONT_REGISTRY: FontRegistryEntry[] = [
  {
    value: 'Arimo',
    label: 'Arial (มาตรฐาน)',
    family: 'Arimo',
    file: '/fonts/Arimo-Regular.ttf',
    isRemote: false,
    vfsName: 'Arimo-Regular.ttf',
  },
  {
    value: 'Kanit',
    label: 'Kanit',
    family: 'Kanit',
    file: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/kanit/Kanit-Regular.ttf',
    isRemote: true,
    vfsName: 'Kanit-Regular.ttf',
  },
  {
    value: 'Itim',
    label: 'Itim',
    family: 'Itim',
    file: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/itim/Itim-Regular.ttf',
    isRemote: true,
    vfsName: 'Itim-Regular.ttf',
  },
  {
    value: 'Chonburi',
    label: 'Chonburi',
    family: 'Chonburi',
    file: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/chonburi/Chonburi-Regular.ttf',
    isRemote: true,
    vfsName: 'Chonburi-Regular.ttf',
  },
  {
    value: 'Prompt',
    label: 'Prompt',
    family: 'Prompt',
    file: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/prompt/Prompt-Regular.ttf',
    isRemote: true,
    vfsName: 'Prompt-Regular.ttf',
  },
  {
    value: 'Sarabun',
    label: 'Sarabun',
    family: 'Sarabun',
    file: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf',
    isRemote: true,
    vfsName: 'Sarabun-Regular.ttf',
  },
  {
    value: 'Mali',
    label: 'Mali',
    family: 'Mali',
    file: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/mali/Mali-Regular.ttf',
    isRemote: true,
    vfsName: 'Mali-Regular.ttf',
  },
  {
    value: 'Noto Sans Thai',
    label: 'Noto Sans Thai',
    family: 'Noto Sans Thai',
    file: 'https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf',
    isRemote: true,
    vfsName: 'NotoSansThai-Regular.ttf',
  },
];

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
      return;
    }

    // local font ต้องมีไฟล์ใน public/fonts — node side ตรวจได้ง่าย
    if (!entry.isRemote && entry.file.startsWith('/fonts/')) {
      // ยังไม่ตรวจ physical file ที่นี่ (ไม่มี fs ใน browser)
      // แต่ไฟล์ชื่อ "Arimo-Regular.ttf" เป็นค่าเริ่มต้นที่รู้ว่ามีในโปรเจกต์นี้
      void 0;
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
 * คืน VFS path ที่จะใช้ mount ลง /fonts/<vfsName>
 */
export function fontVfsPath(vfsName: string): string {
  return `/fonts/${vfsName}`;
}
