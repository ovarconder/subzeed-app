// ============================================================
// 🔍 Test: ass-builder.ts — พิมพ์ .ass string เพื่อตรวจด้วยตาเปล่า
// ============================================================
// รันด้วย: node scripts/run-ts-test.cjs scripts/ass-builder-test.ts
// (runner ใช้ typescript transpile — รองรับ import .ts ภายใน)
// ============================================================

import { buildAssSimple, buildAss, buildDialogue, buildSegmentText, formatAssTime, hexToAss, colorWithOpacityToAss, escapeAssText, opacityToAssAlpha } from '../src/lib/subtitle-render/ass-builder.ts';
import type { SubtitleCue } from '../src/lib/subtitle-render/types.ts';

function section(title: string, content: string) {
  console.log('\n' + '='.repeat(60));
  console.log('▶ ' + title);
  console.log('-'.repeat(60));
  console.log(content);
  console.log('='.repeat(60));
}

// ─── 1. สี conversion ────────────────────────────────
console.log('### 1. Color conversion');
console.log('hexToAss(#FFFFFF):', JSON.stringify(hexToAss('#FFFFFF'))); // alpha 0, BBGGRR FFFFFF
console.log('hexToAss(#FF0000):', JSON.stringify(hexToAss('#FF0000'))); // red → BBGGRR 0000FF
console.log('hexToAss(#00FF00):', JSON.stringify(hexToAss('#00FF00'))); // green → BBGGRR 00FF00
console.log('hexToAss(#0000FF):', JSON.stringify(hexToAss('#0000FF'))); // blue → BBGGRR FF0000
console.log('colorWithOpacityToAss(#FFFFFF, 1):', colorWithOpacityToAss('#FFFFFF', 1)); // &H00FFFFFF&
console.log('colorWithOpacityToAss(#FFFFFF, 0.5):', colorWithOpacityToAss('#FFFFFF', 0.5)); // &H80FFFFFF&
console.log('opacityToAssAlpha(1):', opacityToAssAlpha(1)); // 0
console.log('opacityToAssAlpha(0.5):', opacityToAssAlpha(0.5)); // ~128
console.log('opacityToAssAlpha(0):', opacityToAssAlpha(0)); // 255

// ─── 2. Timestamp ────────────────────────────────────
console.log('\n### 2. Timestamp');
console.log('formatAssTime(65.5):', formatAssTime(65.5)); // 0:01:05.50
console.log('formatAssTime(0):', formatAssTime(0));       // 0:00:00.00
console.log('formatAssTime(3661.25):', formatAssTime(3661.25)); // 1:01:01.25

// ─── 3. Escaping ─────────────────────────────────────
console.log('\n### 3. Escaping');
console.log('escapeAssText("สวัสดี {TH} | ก่อน\\nหลัง"):',
  escapeAssText('สวัสดี {TH} | ก่อน\nหลัง'));

// ─── 4. Simple 1-builine .ass ────────────────────────
section('4. buildAssSimple (1 บรรทัด ฟอนต์ Arimo)',
  buildAssSimple('สวัสดีครับ', 1, 4, { fontFamily: 'Arimo', fontSize: 36, position: 'bottom', y_offset: 0 }));

// ─── 5. Full buildAss with segments + box + shadow ──
const cues: SubtitleCue[] = [
  {
    start: 0,
    end: 3,
    text: 'First subtitle',
    segments: [
      { text: 'First ', style: { color: '#FFFFFF', fontWeight: 'normal' } },
      { text: 'BOLD', style: { color: '#FFCC00', fontWeight: 'bold', fontSize: 48 } },
    ],
  },
  {
    start: 3.5,
    end: 6,
    text: 'Second line',
    position: 'top',
  },
];

const richAss = buildAss(
  {
    fontFamily: 'Kanit',
    fontSize: 30,
    position: 'bottom',
    y_offset: 70,
    box: {
      bgActive: true,
      bgOpacity: 0.7,
      bgColor: '#000000',
      borderRadius: 6,
      paddingY: 8,
      paddingX: 16,
      boxShadow: { active: true, offsetX: 0, offsetY: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.6 },
    },
    defaultSegmentStyle: {
      strokeActive: true,
      strokeWidth: 2,
      strokeColor: '#000000',
      strokeOpacity: 1,
      color: '#FFFFFF',
      opacity: 1,
      shadowActive: false,
    },
  },
  cues,
);

section('5. buildAss (rich: segments + box + shadow + top position)', richAss);

// ─── 6. Individual dialogue ──────────────────────────
section('6. buildDialogue เดี่ยว (ไม่มีกล่อง → 1 line)',
  buildDialogue({ start: 2, end: 5, text: 'Hello world' }, { fontFamily: 'Arimo', fontSize: 24, position: 'bottom', y_offset: 0 }, undefined, undefined).join('\n'));

section('6b. buildDialogue กล่อง active (→ 2 lines: layer0 กล่อง blur, layer1 text)',
  buildDialogue(
    { start: 2, end: 5, text: 'Hello world', displayStyle: { bgActive: true, bgOpacity: 0.6, bgColor: '#333333', borderRadius: 8, paddingY: 8, paddingX: 14, boxShadow: { active: false, offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: '#000000', opacity: 0 } } },
    { fontFamily: 'Arimo', fontSize: 24, position: 'bottom', y_offset: 0 },
    'bottom',
    { bgActive: true, bgOpacity: 0.6, bgColor: '#333333', borderRadius: 8, paddingY: 8, paddingX: 14, boxShadow: { active: false, offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: '#000000', opacity: 0 } },
  ).join('\n'),
);

// ─── 7. Design-verification: ทุกบรรทัดได้กล่อง + padding + y_offset ต่อเส้น ──
const designAss = buildAss(
  {
    fontFamily: 'Kanit',
    fontSize: 24,
    position: 'bottom',
    y_offset: 80,
    box: { bgActive: true, bgOpacity: 0.6, bgColor: '#000000', borderRadius: 6, paddingY: 6, paddingX: 12, boxShadow: { active: false, offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: '#000000', opacity: 0 } },
    defaultSegmentStyle: { color: '#FFFFFF', opacity: 1, strokeActive: false, shadowActive: false },
  },
  [
    { start: 0, end: 2, text: 'เป็นค่าปกติ (กล่อง + paddingX 12)' },
    { start: 3, end: 5, text: 'อันนี้เปิดกล่อง', displayStyle: { bgActive: true, bgOpacity: 0.9, bgColor: '#003366', borderRadius: 8, paddingY: 10, paddingX: 24, boxShadow: { active: false, offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: '#000000', opacity: 0 } }, y_offset: 40 },
    { start: 6, end: 8, text: 'อันนี้ปิดกล่อง (bgActive=false)', displayStyle: { bgActive: false, bgOpacity: 0.6, bgColor: '#000000', borderRadius: 0, paddingY: 6, paddingX: 12, boxShadow: { active: false, offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: '#000000', opacity: 0 } }, y_offset: 30 },
  ],
);

section('7. Design-verify: default box + per-line box + bgActive=false + y_offset', designAss);

// ─── 8. shadow offsetX → \shad (fallback) ──────────────
const shadowAss = buildAss(
  { fontFamily: 'Roboto', fontSize: 20, position: 'bottom', y_offset: 0, defaultSegmentStyle: { color: '#FFFFFF', opacity: 1, strokeActive: false, shadowActive: false } },
  [{
    start: 0, end: 2, text: 'shadow x-only', segments: [
      { text: 'ShadowX', style: { shadowActive: true, shadowOffsetX: 4, shadowOffsetY: 0, shadowColor: '#111122', shadowOpacity: 0.7 } },
      { text: 'ShadowY', style: { shadowActive: true, shadowOffsetX: 0, shadowOffsetY: 3, shadowColor: '#334455', shadowOpacity: 0.8 } },
    ],
  }],
);
section('8. shadow offsetX (x-only → \\shad) + offsetY', shadowAss);
