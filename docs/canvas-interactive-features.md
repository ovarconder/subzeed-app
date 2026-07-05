# Canvas Interactive Features

> ประวัติการเปลี่ยนแปลงและเหตุผลในการออกแบบ interactive canvas (subtitle overlay ที่ตอบสนองต่อการคลิก/ลาก)

---

## ⚙️ Default y_offset: 90% → 80% (2026-07-04)

### ปัญหา
- ตำแหน่งเริ่มต้น subtitle อยู่ที่ 90% ของความสูงวิดีโอ
- ทับซ้อนกับ video controls (play/pause, timeline, volume ฯลฯ)
- ทำให้คลิกเพื่อลาก subtitle ไม่ได้ เพราะ video controls บัง

### ไฟล์ที่เกี่ยวข้อง
- `src/app/studio/[id]/page.tsx`
- `src/app/studio/page.tsx`
- `src/app/api/transcribe-and-save/route.ts`
- `src/components/studio/interactive-canvas-overlay.tsx`
- `src/components/studio/subtitle-canvas-overlay.tsx`
- `src/components/studio/subtitle-settings-bar.tsx`
- `src/components/studio/subtitle-item.tsx`
- `src/lib/video-renderer.ts`

### การเปลี่ยนแปลง
เปลี่ยนค่า default `y_offset` จาก `90` → `80` ทุกตำแหน่งที่กำหนด default:
- `?? 90` → `?? 80` (nullish coalescing)
- `|| 90` → `|| 80` (logical OR)
- `y_offset: 90` → `y_offset: 80` (literal assignment)

---

## 📏 Guideline 8 ส่วน + Magnet Snap (2026-07-04)

### ปัญหา
- ไม่มี visual guide สำหรับจัดตำแหน่ง subtitle
- subtitle แต่ละอันมีระยะห่างไม่ uniform
- ต้องเดาค่า y_offset ด้วยตัวเลขอย่างเดียว

### ไฟล์ที่เกี่ยวข้อง
- `src/components/studio/interactive-canvas-overlay.tsx`

### การเปลี่ยนแปลง
1. **Guideline แบ่ง 8 ส่วน**: วาดเส้นประที่ตำแหน่ง 1/8 ถึง 7/8 ของ canvas height
   - เส้นทั่วไประบุด้วย `rgba(255,255,255,0.3)`, lineWidth=1
   - เส้น 50% (i=4) ชัดกว่า: `rgba(255,255,255,0.5)`, lineWidth=2
   - แสดง % label ข้างซ้าย
   - Guideline setTransform ที่ DPR ก่อนวาด

2. **Magnet snap**: ถ้าลาก subtitle แล้ว center ของ subtitle ใกล้ guideline ภายใน ±3% → snap
   - `MAGNET_POINTS = [12.5, 25, 37.5, 50, 62.5, 75, 87.5]`
   - `SNAP_TOLERANCE = 3` (percent)

#### Evolution: snap ที่ center (ไม่ใช่ขอบ)
- **V1 (commit 4d99445)**: snap ที่ `y_offset` โดยตรง (ขอบบน = guideline) — ไม่ถูกต้อง
- **V2 (commit ebae71d)**: snap ที่ center = `y_offset + halfBgPct` โดย `halfBgPct = (fontSize * 2 / canvasH / 2) * 100`

---

## 🖱️ Video Controls Fix (2026-07-04)

### ปัญหา
- interactive canvas มี `pointer-events: none` ทำให้คลิก canvas ไม่ได้
- แต่ถ้าเอาออก video controls จะไม่ทำงาน (canvas บัง video)

### วิธีแก้
1. Canvas → `pointer-events: none` เสมอ
2. Event listeners (`pointerdown`, `pointermove`, `pointerup`, `dblclick`) ย้ายไปที่ `video` element แทน
3. ใช้ `video.setPointerCapture()` แทน `canvas.setPointerCapture()`

### ไฟล์ที่เกี่ยวข้อง
- `src/components/studio/interactive-canvas-overlay.tsx` — event listeners
- `src/app/studio/page.tsx` — canvas style

---

## ✂️ Split Segment ด้วย Cursor Position (2026-07-04)

### ปัญหา
- การแบ่ง segment ต้องพิมพ์ตัวเลขตำแหน่ง (index) — ใช้งานยาก
- User ต้องการแบ่งตรงตำแหน่งที่ cursor อยู่

### ไฟล์ที่เกี่ยวข้อง
- `src/components/studio/interactive-canvas-overlay.tsx` — `InlineSubtitleEditor`

### การเปลี่ยนแปลง
- ปุ่ม "+ แยก" ใน inline editor
- ใช้ `textarea.selectionStart` อ่าน cursor position
- Split ที่ตำแหน่งนั้นโดยตรง ไม่ต้องพิมพ์ตัวเลข

---

## ✏️ Font Family ต่อ Segment (2026-07-04)

### ปัญหา
- แต่ละ subtitle ใช้ font family เดียวกันทั่วทั้ง app
- ไม่สามารถผสมฟอนต์ใน subtitle เดียวกันได้

### ไฟล์ที่เกี่ยวข้อง
- `src/lib/types.ts` — `TextSegmentStyle.fontFamily` (optional field)
- `src/components/studio/interactive-canvas-overlay.tsx`

### การเปลี่ยนแปลง
1. **Type**: เพิ่ม `fontFamily?: string` ใน `TextSegmentStyle`
2. **UI**: Dropdown ฟอนต์ 15 แบบใน inline editor (Arial, Arial Black, Verdana, Tahoma, Trebuchet MS, Times New Roman, Georgia, Garamond, Courier New, Brush Script MT, Impact, Comic Sans MS, Kanit, Sarabun, Noto Sans Thai)
3. **Drawing**: `buildFontString()` เปลี่ยน signature จาก `(fontWeight: string, ...)` เป็น `(fontWeight: string | TextSegmentStyle, ...)`
   - ถ้าเป็น object → ใช้ `st.fontFamily || fontFamily` แล้ว switch ตาม `st.fontWeight`
   - ถ้าเป็น string → เหมือนเดิม (backward compatible)

---

## 🧹 Bug Fix: subtitle-canvas-overlay.tsx ถูกเขียนทับ (2026-07-04)

### ปัญหา
- ไฟล์ `src/components/studio/subtitle-canvas-overlay.tsx` ถูกเขียนทับด้วย content ของ `interactive-canvas-overlay.tsx` โดยไม่ได้ตั้งใจ (เกิดจาก `read_file` tool อาจมี path overlap)
- ทำให้ build error: `Module has no exported member 'SubtitleCanvasOverlay'`

### วิธีแก้
- Restore จาก commit `105421e` (ก่อนถูกเขียนทับ)
- `git show 105421e:src/components/studio/subtitle-canvas-overlay.tsx > src/components/studio/subtitle-canvas-overlay.tsx`

---

## 🖱️ Inline Editor: Drag-to-move + Editor Font Size (2026-07-04)

### ปัญหา
- Inline editor popup ถูกสร้างที่ตำแหน่งคลิก และไม่สามารถขยับได้
- ถ้า popup เกิดใกล้ขอบจอ อาจถูกตัดหรือซ้อนทับ element ที่ต้องการ
- ขนาดตัวอักษรใน textarea ของ editor คงที่ ปรับไม่ได้

### ไฟล์ที่เกี่ยวข้อง
- `src/components/studio/interactive-canvas-overlay.tsx`

### การเปลี่ยนแปลง

1. **Drag-to-move popup**:
   - เพิ่ม `pos` state (`useState({ x, y })`) แทนการใช้ prop `x`, `y` โดยตรง
   - เพิ่ม drag handle bar (3 เส้นแนวนอน) ที่ด้านบนของ popup
   - `onDragBarMouseDown` → เริ่ม drag
   - `mousemove` event → อัปเดต `pos.x`/`pos.y`
   - `mouseup` event → หยุด drag
   - ปรับ `style={{ left, top }}` ใช้ `pos.x`/`pos.y`

2. **Editor Font Size Slider**:
   - เพิ่ม `editorFontSize` state (ค่าเริ่มต้น 14px)
   - Slider ปรับค่าตั้งแต่ 10px–28px ใน inline editor
   - แสดงค่าปัจจุบันแบบ real-time
   - ส่ง `editorFontSize` ไปที่ `textarea.style.fontSize`

3. **Structure change**: `p-3` → `px-3 pb-3` + drag handle bar
   - ย้าย `p-3` จาก outer div ไปเป็น `px-3 pb-3` div ด้านใน
   - Drag handle bar อยู่นอก `px-3 pb-3` เพื่อให้มีพื้นที่ลากโดยไม่เลื่อน content

4. **Fix: fontSize prop missing**:
   - `InlineEditorProps` interface ไม่มี `fontSize` field แต่ JSX อ้างถึง `fontSize` (จาก `activeSeg?.style.fontSize || fontSize`)
   - Error: `Cannot find name 'fontSize'`
   - แก้: เพิ่ม `fontSize: number` ใน `InlineEditorProps`
   - Destructure เป็น `fallbackFontSize` เพื่อไม่ให้ชนกับตัวแปรอื่น
   - ส่ง `fontSize={fontSize}` จาก `InteractiveCanvasOverlay` → `<InlineSubtitleEditor>`

### Lessons Learned
- **Indent มีผลต่อ TSX parser**: children ที่มี indent เท่ากับ parent ทำให้ TS parser ตีความผิดว่า parent เป็น self-closing — เกิด cascade error ตั้งแต่ `<div>` ที่ return จนถึง `export interface`
- **`x`/`y` reuse**: ตัวแปร `x` และ `y` เดิมถูกใช้ใน `InlineSubtitleEditor` props และใน callback ภายใน (`textarea.selectionStart` ใช้ `pos`) — ควร rename ให้ชัดเจน
- **TypeScript version impact**: TS 5.9.x ไม่มีปัญหาเฉพาะ แต่การใช้ single-file check (`tsc file.tsx`) จะไม่ใช้ tsconfig → ต้องรันแบบ project-wide (`tsc --noEmit`)

---

## 🎨 Drag Handle Bar: สีน้ำเงิน + Visual Polish (2026-07-04)

### ปัญหา
- Drag handle bar เป็นแถบจาง ๆ (`bg-surface/50`) มองไม่ชัด
- ไม่มี visual feedback เมื่อ hover

### ไฟล์ที่เกี่ยวข้อง
- `src/components/studio/interactive-canvas-overlay.tsx`

### การเปลี่ยนแปลง
- เปลี่ยนพื้นหลังเป็น `bg-primary/10` (ฟ้าจาง) → `bg-primary/15` เมื่อ hover
- เปลี่ยนก้อน handle จาก `bg-text-secondary/30` → `bg-primary/50` (สีน้ำเงินเด่น)
- เพิ่ม `transition-colors` และ `py-1` → `py-2` (พื้นที่ลากมากขึ้น)

---

## 🖼️ Fix: Subtitle ไม่แสดงผลบน Canvas (2026-07-04)

### ปัญหา
- การปรับ font, ขนาด, สี, opacity, stroke, shadow ใน popup inline editor **ไม่มีผลกับ text layer บน video** จริง
- สาเหตุ: render loop ใน `InteractiveCanvasOverlay` ไม่ได้เรียก `drawSegments()` เลย — วาดแค่ guideline + drag indicator

### ไฟล์ที่เกี่ยวข้อง
- `src/components/studio/interactive-canvas-overlay.tsx`

### การเปลี่ยนแปลง
- เพิ่มการเรียก `drawSegments()` ใน render loop ก่อนวาด drag indicator
- ใช้ `findActiveSubtitle()` หา subtitle ที่กำลัง active
- ส่ง `segments`, `fontFamily`, `fontSize`, `y_offset`, `position` ไปให้ `drawSegments()`

### หมายเหตุ
- `drawSegments()` ถูก implement ไว้ท้ายไฟล์แล้ว (copy จาก `SubtitleCanvasOverlay`) แต่ไม่เคยถูกเรียกจาก component นี้
- การเปลี่ยนแปลง style ผ่าน `updateSegmentStyle()` → `syncToStore()` → store update → `subtitlesRef` (ผ่าน subscribe) → render loop อ่านผ่าน `findActiveSubtitle()` → เกิดผลบน canvas ทันที

---

## 🧹 Removed: SubtitleCanvasOverlay ซ้อนทับ (2026-07-04)

### ปัญหา
- `SubtitleCanvasOverlay` และ `InteractiveCanvasOverlay` วาด subtitle พร้อมกัน 2 ชั้น
- background box ที่ `SubtitleCanvasOverlay` วาด (bgActive = true เสมอ) ทับใต้ interactive canvas
- การปิด background ใน interactive overlay ไม่มีผล เพราะอีก layer ยังวาด background อยู่

### ไฟล์ที่เกี่ยวข้อง
- `src/app/studio/page.tsx`

### การเปลี่ยนแปลง
- ลบ `<SubtitleCanvasOverlay>` component และ canvas element ที่เกี่ยวข้อง (`canvasOverlayRef`) ออกจาก JSX
- ลบ import `SubtitleCanvasOverlay` และ declaration `canvasOverlayRef`
- `InteractiveCanvasOverlay` ทำหน้าที่วาด subtitle เพียงเจ้าเดียว
- Dead code: `SubtitleCanvasOverlay` ยังคงอยู่ใน codebase (อาจถูกใช้ใน `[id]/page.tsx`)

### ข้อควรระวัง
- ปัจจุบัน `InteractiveCanvasOverlay` วาด subtitle ด้วย `drawSegments()` ซึ่งใช้ข้อมูลจาก `subtitlesRef` (sync ผ่าน subscribe) ไม่มี `displayStyle` → ใช้ default background (bgActive=true, bgOpacity=0.6)
- ถ้าต้องการให้ background ปิดได้ ต้องเพิ่ม `displayStyle` prop ให้ `InteractiveCanvasOverlay` หรือ implement UI สำหรับปรับ display style

---

## 📐 Canvas Sizing & DPR (History)

- `bbbdccf`: ใช้ `video.videoWidth/videoHeight` แทน `getBoundingClientRect` — แก้ปัญหาจอ retina
- `92282d3`: canvas size = `video.getBoundingClientRect()` — จัดตำแหน่ง canvas ตรงวิดีโอ
- `8bd9a2f`: ไม่ set `canvas.style.width/height` — ใช้ Tailwind `w-full h-full` (ล้มเหลว)
- `105421e`: set `canvas.style.width/height` + CSS size — ใช้ได้จริง (fixed)
- `86f9265`: interactive canvas ไม่วาด subtitle ซ้ำ (ซ้อนทับกับ SubtitleCanvasOverlay)
