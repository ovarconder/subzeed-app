// ============================================================
// 🔍 Test: font-registry.ts — พิมพ์ผล validate/collect ออกมาดู
// ============================================================
// รัน: node --experimental-strip-types scripts/font-registry-test.ts
// ============================================================

import {
  getFontEntry,
  resolveFamilyName,
  validateFonts,
  collectUsedFonts,
  collectFontFiles,
  fontVfsPath,
  FONT_REGISTRY,
} from '../src/lib/subtitle-render/font-registry.ts';
import type { SubtitleStyleParams, SubtitleCue } from '../src/lib/subtitle-render/types.ts';

function section(title: string, lines: (string | null)[]) {
  console.log('\n' + '='.repeat(60));
  console.log('▶ ' + title);
  console.log('-'.repeat(60));
  lines.forEach((l) => l !== null && console.log(l));
  console.log('='.repeat(60));
}

// ─── 1. Registry มีกี่ตัว + mapping ครบ ─────────────
section('1. Registry entries', [
  `total = ${FONT_REGISTRY.length}`,
  ...FONT_REGISTRY.map((f) => `  ${f.value}  →  family="${f.family}"  file=${f.file}  remote=${f.isRemote}`),
]);

// ─── 2. resolveFamilyName ───────────────────────────
section('2. resolveFamilyName', [
  `resolveFamilyName('Kanit') = ${resolveFamilyName('Kanit')}`,
  `resolveFamilyName('FakeFont') = ${resolveFamilyName('FakeFont')} (unknown → คืนค่าเดิม)`,
  `getFontEntry('Arimo') = ${JSON.stringify(getFontEntry('Arimo'))}`,
]);

// ─── 3. collectUsedFonts (font หลัก + ใน segments) ──
const style: SubtitleStyleParams = {
  fontFamily: 'Kanit',
  fontSize: 30,
  position: 'bottom',
  y_offset: 0,
};
const cues: SubtitleCue[] = [
  {
    start: 0, end: 3, text: 'a',
    segments: [
      { text: 'x', style: { fontFamily: 'Prompt' } },
      { text: 'y', style: { fontFamily: 'Kanit' } },   // ซ้ำ → ต้อง dedupe
    ],
  },
  { start: 4, end: 6, text: 'b', segments: [{ text: 'z' }] }, // ไม่มี fontFamily → ไม่เพิ่ม
];

section('3. collectUsedFonts', [
  `used = ${JSON.stringify(collectUsedFonts(style, cues))}  (คาดว่า ["Kanit","Prompt"])`,
]);

// ─── 4. collectFontFiles (เฉพาะที่ใช้จริง) ──────────
section('4. collectFontFiles', [
  ...collectFontFiles(style, cues).map((f) => `  ${f.vfsName}  ←  ${f.source}`),
]);

// ─── 5. validateFonts (กรณีทุกฟอนต์รู้จัก) ──────────
section('5. validateFonts — ฟอนต์รู้จักทั้งหมด', [
  `problems = ${JSON.stringify(validateFonts(style, cues))}  (คาดว่า [])`,
]);

// ─── 6. validateFonts (มีฟอนต์แปลกปลอม) ────────────
const badStyle: SubtitleStyleParams = {
  fontFamily: 'FakeFont', // ↑ ไม่อยู่ใน registry
  fontSize: 20,
  position: 'bottom',
  y_offset: 0,
};
section('6. validateFonts — ฟอนต์ไม่รู้จัก', [
  `problems = ${JSON.stringify(validateFonts(badStyle, cues))}  (คาดว่า ["FakeFont"])`,
]);

// ─── 7. fontVfsPath ────────────────────────────────
section('7. fontVfsPath', [
  `fontVfsPath('Kanit-Regular.ttf') = ${fontVfsPath('Kanit-Regular.ttf')}`,
]);
