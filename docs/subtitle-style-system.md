# 🎨 Subtitle Style System — Multi-Segment, Canvas Overlay, ASS Export

> **อัปเดตล่าสุด:** ระหว่าง Session ที่เพิ่มระบบ หลายสีในบรรทัดเดียว
> **ไฟล์ที่เกี่ยวข้องทั้งหมดใน Session นี้**

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

**ไฟล์:** `src/lib/video-renderer.ts`

### ASS Override Codes ที่ใช้

| Effect | ASS Code | Canvas Equivalent |
|--------|----------|-------------------|
| Fill color | `{\c&HBBGGRR&}` | `fillStyle` |
| Opacity | `{\alpha&HFF&}` | `globalAlpha` |
| Bold | `{\b1}` | `fontWeight: 'bold'` |
| Italic | `{\i1}` | `fontStyle: 'italic'` |
| Stroke width | `{\bordN}` | `lineWidth` |
| Stroke color | `{\3c&HBBGGRR&}` | `strokeStyle` |
| Stroke alpha | `{\3a&HFF&}` | `globalAlpha` (stroke) |
| Shadow dist | `{\shadN}` | `shadowOffsetY` |
| Shadow color | `{\4c&HBBGGRR&}` | `shadowColor` |
| Shadow alpha | `{\4a&HFF&}` | `globalAlpha` (shadow) |

### Color Conversion

ASS ใช้ **BGR little-endian** format: `&HBBGGRR&`
- Input: `#RRGGBB` (CSS hex)
- Output: `&HBBGGRR&`

### ฟังก์ชันหลัก

- `buildAss()` — สร้าง ASS string จาก subtitles + segments
- `segmentToAss()` — แปลง TextSegment → ASS override tags
- `hexToAssColor()` — แปลง hex → ASS BGR
- `escapeAssText()` — escape `{`, `}`, `|`, `\n`

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

## ไฟล์ที่แก้ไขทั้งหมดใน Session นี้

| ไฟล์ | สถานะ |
|------|--------|
| `src/lib/types.ts` | ✅ แก้ไข — เพิ่ม types + helpers |
| `src/lib/video-renderer.ts` | ✅ แก้ไข — ASS builder รองรับ segments |
| `src/lib/store/subtitle-store.ts` | ✅ ไม่ต้องแก้ — `Partial<SubtitleEntry>` รองรับ segments อัตโนมัติ |
| `src/components/studio/subtitle-canvas-overlay.tsx` | 🆕 สร้างใหม่ |
| `src/components/studio/segment-style-editor.tsx` | 🆕 สร้างใหม่ |
| `src/components/studio/subtitle-item.tsx` | ✅ แก้ไข — แสดง segments |
| `src/app/studio/[id]/page.tsx` | ✅ แก้ไข — Integrate canvas + style editor |
| `src/app/studio/page.tsx` | ✅ แก้ไข — TypeScript fix (segments required) |
| `src/app/api/transcribe-and-save/route.ts` | ✅ แก้ไข — TypeScript fix (segments required) |
| `docs/npm-setup.md` | 🆕 สร้างใหม่ |
| `docs/subtitle-style-system.md` | 🆕 สร้างใหม่ (ไฟล์นี้) |

---

## Known Issues / TODOs

- [ ] Watermark ใน FFmpeg export — ต้องเพิ่ม `drawtext` filter หรือ ASS overlay
- [ ] Canvas overlay ไม่แสดงเมื่อ video ไม่ได้ focus (ต้องกด play ก่อน)
- [ ] Segment style editor ไม่มี undo/redo
- [ ] Animation (fade in/out) — ยังไม่มีใน ASS
- [ ] Font loading — ต้องโหลด Google Fonts ก่อน canvas render
