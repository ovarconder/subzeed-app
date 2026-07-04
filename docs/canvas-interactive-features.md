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

## 📐 Canvas Sizing & DPR (History)

- `bbbdccf`: ใช้ `video.videoWidth/videoHeight` แทน `getBoundingClientRect` — แก้ปัญหาจอ retina
- `92282d3`: canvas size = `video.getBoundingClientRect()` — จัดตำแหน่ง canvas ตรงวิดีโอ
- `8bd9a2f`: ไม่ set `canvas.style.width/height` — ใช้ Tailwind `w-full h-full` (ล้มเหลว)
- `105421e`: set `canvas.style.width/height` + CSS size — ใช้ได้จริง (fixed)
- `86f9265`: interactive canvas ไม่วาด subtitle ซ้ำ (ซ้อนทับกับ SubtitleCanvasOverlay)
