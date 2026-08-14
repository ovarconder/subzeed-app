# 🎨 Subtitle Style System — Multi-Segment, Canvas Overlay, ASS Export

> **อัปเดตล่าสุด:** Session แก้ไข ASS Export ให้ตรง design (font/effect/box)
> **ไฟล์ที่เกี่ยวข้องทั้งหมดใน Session นี้**
> - หมายเหตุ: pipeline ย้ายจาก `src/lib/video-renderer.ts` → `src/lib/subtitle-render/` แล้ว

---

## สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [Type System](#2-type-system)
3. [Canvas Overlay (Preview)](#3-canvas-overlay-preview)
4. [Segment Style Editor (UI)](#4-segment-style-editor-ui)
5. [Subtitle Item (Sidebar)](#5-subtitle-item-sidebar)
6. [FFmpeg ASS Export](#6-ffmpeg-ass-export)
7. [Studio Page Integration](#7-studio-page-integration)
8. [Watermark](#8-watermark)

---

## 1. ภาพรวม

ระบบ subtitle รองรับ **หลายสี หลายสไตล์ในบรรทัดเดียว** ผ่าน `TextSegment[]`
แต่ละ segment มี style ของตัวเอง (stroke, shadow, fill, font-weight)

### Flow การทำงาน

```
Transcription → SubtitleEntry.segments (1 segment plain)
                         ↓
              SegmentStyleEditor (UI) → แก้ไข segments
                         ↓
              Canvas Overlay (Preview) → WYSIWYG แบบ real-time
                         ↓
              buildAss() → ASS override codes → FFmpeg → hardsub
```

---

## 2. Type System

**ไฟล์:** `src/lib/types.ts`

### `TextSegmentStyle` — สไตล์ของ segment ย่อย

```typescript
interface TextSegmentStyle {
  color: string;          // hex fill
  opacity: number;        // 0-1
  strokeColor: string;    // hex stroke
  strokeWidth: number;    // px
  strokeOpacity: number;  // 0-1
  shadowColor: string;
  shadowOpacity: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  shadowAngle: number;    // 0-360
  fontWeight: FontWeight; // 'normal' | 'bold' | 'italic' | 'bold-italic'
}
```

### `TextSegment` — หนึ่งส่วนของข้อความ

```typescript
interface TextSegment {
  id: string;
  text: string;
  style: TextSegmentStyle;
}
```

### `SubtitleEntry` (ขยาย)

```typescript
interface SubtitleEntry {
  id: string;
  start: number;
  end: number;
  text: string;              // plain text fallback
  segments: TextSegment[];   // NEW: multi-style support
  position: 'bottom' | 'top' | 'middle';
  y_offset: number;
}
```

### Helper Functions

- `DEFAULT_SEGMENT_STYLE` — ค่าเริ่มต้น (white fill, black stroke 2px, soft shadow)
- `textToSegments(id, text)` — สร้าง 1 segment จาก plain text
- `segmentsToText(segments)` — รวม segments → plain text

---

## 3. Canvas Overlay (Preview)

**ไฟล์:** `src/components/studio/subtitle-canvas-overlay.tsx`

### ทำไมต้อง Canvas แทน CSS?

CSS overlay (`<span>` + styling) ไม่สามารถ render ได้ตรงกับ FFmpeg ASS export
Canvas ช่วยให้ WYSIWYG — เห็นแบบเดียวกับตอนดาวน์โหลด

### รายละเอียด

- **Props:** `videoRef`, `canvasRef`, `fontFamily`, `fontSize`, `tier`
- **Render loop:** `requestAnimationFrame` + `ResizeObserver`
- **DPR handling:** ใช้ `setTransform(dpr, ...)` เพื่อวาดด้วย CSS px
- **Background:** semi-transparent black box พร้อม border radius
- **Text rendering:** shadow → stroke → fill (เรียงตามลำดับเพื่อให้เห็น effect ถูกต้อง)
- **Watermark:** แสดงเฉพาะ Free tier
- **Position:** คำนวณจาก `y_offset` (0-100%) + position (`bottom`/`top`/`middle`)

---

## 4. Segment Style Editor (UI)

**ไฟล์:** `src/components/studio/segment-style-editor.tsx`

### UI Components

| Section | Controls |
|---------|----------|
| Segment Selector | Tab buttons (แสดงตัวอย่างข้อความสั้น) + ปุ่ม "+ เพิ่ม" |
| ข้อความ | Text input สำหรับ segment ที่เลือก |
| Font Weight | ปุ่ม toggle: ปกติ / B / I / BI |
| Fill | Color picker + hex input + Opacity slider |
| Stroke (ขอบ) | `<details>` dropdown: color, width (0-8px), opacity |
| Shadow (เงา) | `<details>` dropdown: color, opacity, offset X/Y, blur, angle |
| ลบ segment | ปุ่มแดง (ซ่อนถ้ามี segment เดียว) |

### Props

```typescript
interface SegmentStyleEditorProps {
  segments: TextSegment[];
  onChange: (segments: TextSegment[]) => void;
}
```

---

## 5. Subtitle Item (Sidebar)

**ไฟล์:** `src/components/studio/subtitle-item.tsx`

### การเปลี่ยนแปลง

- แสดง segments แต่ละอันด้วย `color`, `opacity`, `fontWeight`, `fontStyle`, `textShadow`
- เมื่อแก้ไขข้อความ (inline edit) → สร้าง segments ใหม่ด้วย `textToSegments()`
- แสดงไอคอน 🎨 และ "N ส่วน" ถ้ามีหลาย segments

---

## 6. FFmpeg ASS Export

**ไฟล์:** `src/lib/subtitle-render/` (เดิม `src/lib/video-renderer.ts` ถูก refactor เป็นโฟลเดอร์นี้)
**Pipeline:** `buildRenderConfig()` → `buildAss()` → `ffmpeg-command.ts` → ฝัง `drawtext` hardsub

### Box / Background

> **เทคนิคกล่องมุมโค้ง (blur-outline):** ASS ไม่มีกล่อง rect มุมโค้ง auto-fit โดยตรง
> เราจึงวาดกล่องด้วย "text layer ซ้ำ" (layer 0 หลัง text) ที่ใช้ `\bord{หนา}` + `\blur{R}`
> + `\1c{boxcolor}` → glyph blur จนเป็น**กล่องทึบมุมโค้ง** fit ตามความยาวข้อความอัตโนมัติ
> (พิสูจน์ด้วยการ render จริงผ่าน ffmpeg + libass แล้ว)
>
> แต่ละบรรทัดที่มีกล่อง = **2 events**:
> - `Layer 0` = กล่องทึบโค้ง (text ซ้ำ, เป็นสีกล่อง + bord/blur)
> - `Layer 1` = ตัวอักษรปกติ (segment colour/stroke/shadow)

| Effect | วิธี render ใน ASS | สถานะ |
|--------|-------------------|-------|
| กล่องพื้นหลัง (bgActive + bgOpacity + bgColor) | layer0 กล่อง `\1c{boxcolor}` (alpha จาก bgOpacity) | ✅ มีมุมโค้งจริง |
| Padding X (paddingX) | `\bord` (ความหนากล่อง = max(paddingX, paddingY)) | ⚠️ เป็�nค่าคร่าว ๆ |
| Padding Y (paddingY) | `\bord` (ความหนากล่องร่วมกับ paddingX) | ⚠️ ค่าคร่าว ๆ |
| Border radius (borderRadius) | `\blur{R}` (ทำให้มุมมน) | ✅ ปรับมุมโค้งได้ |
| Box shadow ของกล่อง (boxShadow) | — | ⚠️ **ไม่มีใน ASS** (ASS มีแค่ text shadow) |

### ASS Override Codes ที่ใช้ (per-segment)

| Effect | ASS Code | Canvas Equivalent |
|--------|----------|-------------------|
| Fill color | `{\c&HBBGGRR&}` | `fillStyle` |
| Opacity | ฝังใน `\c` ผ่าน `&HAABBGGRR&` (alpha) | `globalAlpha` |
| Font family | `{\fnFamily}` (ผ่าน `resolveFamilyName`) | `fontFamily` |
| Font size | `{\fsN}` (เฉพาะเมื่อต่างจาก global) | `fontSize` |
| Bold | `{\b1}` | `fontWeight: 'bold'` |
| Italic | `{\i1}` | `fontStyle: 'italic'` |
| Stroke width | `{\bordN}` | `lineWidth` |
| Stroke color | `{\3c&HBBGGRR&}` | `strokeStyle` |
| Shadow dist | `{\shadN}` (ใช้ offsetY, fallback offsetX) | `shadowOffsetY` |
| Shadow color | `{\4c&HBBGGRR&}` | `shadowColor` |

### ⚠️ ข้อจำกัดของ ASS format (เอกสาร — ทำตาม design ได้ไม่ครบ 100%)

ASS / libass มีข้อจำกัดที่ canvas ในเบราว์เซอร์ไม่เจอ ทำให้บาง effect ที่ design ตั้งไว้ไม่สามารถ
render ให้เท่ากันเป๊ะได้:

1. **Box shadow ของกล่อง** — ASS มีแค่ "text shadow" (`\shad`) ไม่มีเงาของกล่องพื้นหลัง
   → กล่องจะไม่มี drop shadow (ทำไม่ได้ใน ASS)
2. **Padding X/Y แยกกัน** — กล่องมุมโค้งใช้ `\bord` เป็นค่าความหนารอบทุกด้าน
   → paddingX กับ paddingY จึงเป็นค่าเดียวกัน (ไม่แยกกันได้อิสระดัง canvas)
3. **Border radius = `\blur`** — มุมโค้งทำได้จริง แต่เป็น "มนกลม" (soft) ตาม blur
   ไม่ใช่ rect มุมโค้งคมเรียบเป๊ะแบบ vector (ใกล้เคียง แต่ไม่เท่ากัน)
4. **Text shadow แบบ 2 มิติ + blur + angle** — ASS `\shad` รองรับแค่ระยะแนวเดียว (ตัวเลขเดียว)
   render มาจึงได้เงาแนวเดียว ไม่ใช่เงารวม X+Y พร้อม blur/angle เหมือน canvas

**จุดนี้เป็นข้อจำกัดของ format ASS เอง ไม่ใช่บั๊กของโค้ด** — ส่วน font, สี, stroke, กล่องพื้นหลัง
**มุมโค้ง (ตอนนี้ทำได้จริงผ่าน blur-outline)**, ตำแหน่ง, y_offset วาดถูกต้องแล้ว

### Detection/Logic สำคัญ (ที่แก้ให้ตรงตาม design)

- **กล่องเริ่มต้น:** `buildRenderConfig` ตั้ง `style.box = DEFAULT_DISPLAY_STYLE` → ทุกบรรทัด
  ที่ไม่มี `displayStyle` ตนเองจะได้กล่องตามดีไซน์ (ตรงกับ canvas)
- **Margin inherit:** Dialogue ใช้ `-1` สำหรับ MarginL/R/V → ตำแหน่ง/offset inherit จาก Style line
- **กล่องมุมโค้ง 2-layer:** กล่องเป็น `layer 0` (text ซ้ำ × `\bord`/`\blur`/`\1c`) บนหลัง `layer 1`
  ตัวอักษร → fit ความยาวข้อความอัตโนมัติ (ไม่ต้องรู้ text width ล่วงหน้า)
- **Stroke/shadow กับกล่อง:** ตั้งอิสระต่อกัน (กล่องไม่ตัด stroke/shadow ของตัวอักษร) ตรงกับ canvas
- **y_offset ต่อเส้น:** per-line style คำนวณ `marginV` ตาม `cue.y_offset` (ไม่ใช่ global)
- **Font:** ใช้ `resolveFamilyName()` กันบั๊กที่ `value ≠ family` (libass fallback เงียบ)

### Color Conversion

ASS ใช้ **BGR little-endian** format: `&HBBGGRR&` (+ alpha `&HAABBGGRR&`)
- Input: `#RRGGBB` (CSS hex)
- Output: `&HBBGGRR&`

### ฟังก์ชันหลัก

- `buildAss()` — สร้าง ASS string จาก style + cues
- `buildSegmentText()` — แปลง segments → ASS override tags
- `buildDialogue()` — สร้าง Dialogue line (margin `-1` inherit)
- `hexToAss()` / `colorWithOpacityToAss()` — แปลง hex → ASS BGR + alpha
- `escapeAssText()` — escape `{`, `}`, `|`, `\n`
- Test: `node scripts/run-ts-test.cjs scripts/ass-builder-test.ts`

---

## 7. Studio Page Integration

**ไฟล์:** `src/app/studio/[id]/page.tsx`

### Components ที่เพิ่ม

```tsx
<canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
<SubtitleCanvasOverlay videoRef={videoRef} canvasRef={canvasRef} ... />
<SegmentStyleEditor segments={...} onChange={...} />
```

### UI Changes

- ปุ่ม "🎨 Style" ใน sidebar header (toggle `showStyleEditor`)
- Style Editor panel แสดงเมื่อเลือก subtitle + กดปุ่ม Style
- `SegmentStyleEditor` อยู่เหนือรายการ subtitle

### Time Sync

```tsx
video.addEventListener('timeupdate', () => store.setCurrentTime(video.currentTime))
```

---

## 8. Watermark

| Tier | Canvas Overlay | FFmpeg Export |
|------|---------------|---------------|
| Free | ✅ "Generated by SubZeed" มุมขวาล่าง | ❌ ยังไม่ implemented |
| Paid | ❌ | ❌ |

Canvas watermark ใช้:
- `globalAlpha: 0.7`
- font: `bold 14px Arial`
- shadow: black 1px offset
- ตำแหน่ง: `actualW - 12, actualH - 12` (bottom-right)

---

## ไฟล์ที่เกี่ยวข้อง (สถานะปัจจุบัน)

| ไฟล์ | สถานะ |
|------|--------|
| `src/lib/types.ts` | ✅ แก้ไข — types + helpers |
| `src/lib/subtitle-render/ass-builder.ts` | ✅ แก้ไข — box/padding/margin/font/shadow ให้ตรง design |
| `src/lib/subtitle-render/adapter-studio.ts` | ✅ แก้ไข — ตั้ง `style.box = DEFAULT_DISPLAY_STYLE` |
| `src/lib/subtitle-render/font-registry.ts` | ✅ ใช้ `resolveFamilyName` ในทุกจุดตั้งชื่อฟอนต์ |
| `src/lib/subtitle-render/types.ts` | ✅ types |
| `scripts/ass-builder-test.ts` | ✅ แก้ไข — เพิ่ม verify design (box/padding/y_offset/shadow) |
| `scripts/run-ts-test.cjs` | 🆕 runner สำหรับรัน test .ts |
| `src/components/studio/subtitle-canvas-overlay.tsx` | ✅ canvas preview (design reference) |
| `src/components/studio/segment-style-editor.tsx` | ✅ UI |
| `src/components/studio/subtitle-item.tsx` | ✅ ใช้ segments |
| `src/app/studio/[id]/page.tsx` | ✅ Integrate canvas + style editor |
| `docs/subtitle-style-system.md` | ✅ อัปเดต (ไฟล์นี้) |

---

## Known Issues / TODOs

- ⚠️ **ASS ข้อจำกัด (document แล้ว ใน section 6):** box shadow กล่อง, padding X/Y ไม่แยก,
  border radius เป็น blur แบบมน (ไม่ใช่ rect โค้งคม), text shadow 2 มิติ + blur/angle
- ⚠️ **กล่องมุมโค้ง** ทำได้จริงแล้วผ่านเทคนิค blur-outline (layer 0 กล่อง) แต่ paddingX/Y รวมเป็นค่าเดียว
- [ ] Watermark ใน FFmpeg export — ต้องเพิ่ม `drawtext` filter หรือ ASS overlay
- [ ] Canvas overlay ไม่แสดงเมื่อ video ไม่ได้ focus (ต้องกด play ก่อน)
- [ ] Segment style editor ไม่มี undo/redo
- [ ] Animation (fade in/out) — ยังไม่มีใน ASS
- [ ] Font loading — ต้องโหลด Google Fonts ก่อน canvas render (render ใช้ self-host ใน public/fonts)
