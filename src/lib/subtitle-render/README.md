# 🎨 Subtitle Render Module

โมดูลฝังซับไตเติล (burn subtitle) เข้าตัววิดีโอ ผ่าน **ffmpeg.wasm + libass** (ASS format)
สร้างมาเพื่อแทน `src/lib/video-renderer.ts` ตัวเก่า (ถูกลบทิ้งแล้ว เพราะ libass ไม่ได้ font ถูกต้อง)

> ✅ ตัวหนังสือภาษาไทย/ต่างชาติมา **ถูกต้อง** — เพราะใช้ `FONT_REGISTRY` ที่ชี้ไปไฟล์จริง
> และฝังเฉพาะฟอนต์ที่ job ใช้เท่านั้น (เร็ว ไม่โหลดทุกฟอนต์)

---

## 📁 โครงสร้างโมดูล

```
src/lib/subtitle-render/
├── index.ts                 ← 🚪 Public API (import จากภายนอกผ่านจุดเดียว)
├── types.ts                 ← Type & interface ทั้งหมด
├── font-registry.ts         ← รายชื่อฟอนต์ + ตรวจสอบ/รวบรวมไฟล์เข้า VFS
├── ass-builder.ts           ← สร้าง .ass string จาก style + cues
├── ffmpeg-command.ts        ← สร้าง command line สำหรับ ffmpeg (video/gif)
├── ffmpeg-loader.ts         ← โหลด/cache instance FFmpeg (+ terminate/reset)
├── render-pipeline.ts       ← Orchestrator: เรียงลำดับการทำงานทั้งหมด
├── adapter-studio.ts        ← แปลง data ของ UI เก่า (studio) → RenderJobConfig
├── export-helpers.ts        ← presets export + hardware check + download blob
└── README.md                ← ไฟล์นี้
```

---

## 🚪 วิธีเรียกใช้งาน (index.ts)

ทุกหน้าควร import ผ่าน `@/lib/subtitle-render` (ไม่ควรเข้าถึงไฟล์ย่อยตรง ๆ ยกเว้นจำเป็น)

```ts
import {
  renderSubtitleVideo,      // render หลัก
  buildRenderConfig,        // adapter: สร้าง config จาก data UI เก่า
  EXPORT_FORMATS,
  QUALITY_PRESETS,
  supportsHardwareAccel,
  downloadVideoBlob,
  terminateFFmpeg,          // ยกเลิก/รีเซ็ต ffmpeg instance
} from '@/lib/subtitle-render';
import type { RenderFormat, QualityPreset } from '@/lib/subtitle-render';
```

---

## 🧭 2 ทางใช้งานหลัก

### ทางที่ 1: UI ใหม่ (ใช้ `RenderJobConfig` ตรง ๆ)

สร้าง `RenderJobConfig` แล้วเรียก `renderSubtitleVideo`.

```ts
const config: RenderJobConfig = {
  videoSource: videoFile,            // Blob หรือ URL string
  cues: [
    {
      start: 0, end: 3, text: 'สวัสดีครับ',
      position: 'bottom',            // bottom | top | middle
      y_offset: 80,                  // % ของความสูงจอ
      segments: [                    // หลาย segment ต่อบรรทัด (หลายสี/ฟอนต์)
        { text: 'สวัสดี', style: { color: '#FFFFFF', fontWeight: 'bold' } },
        { text: 'ครับ',   style: { color: '#FFD700' } },
      ],
    },
  ],
  style: {
    fontFamily: 'Kanit',
    fontSize: 24,
    position: 'bottom',
    y_offset: 80,
    defaultSegmentStyle: {           // fallback เมื่อ segment ใดไม่ตั้ง
      color: '#FFFFFF', opacity: 1,
      strokeActive: false, shadowActive: false,
      fontWeight: 'normal',
      // ... field ครบตาม SubtitleSegmentStyle
    },
  },
  output: {
    format: 'mp4', quality: 'high', fps: 30,
    useHardwareAccel: false, gifMaxWidth: 480, gifFrameSkip: 0,
  },
};

const blob = await renderSubtitleVideo(
  config,
  (e) => console.log(e.percent, e.message), // progress
  abortSignal,                              // ตัวเลือก: ยกเลิกได้
);
downloadVideoBlob(blob, 'out.mp4');
```

### ทางที่ 2: UI เก่า (studio — ใช้ `SubtitleEntry[]`)

UI `/app/studio` เก็บ data เป็น `SubtitleEntry[]` (มี `segments`/`displayStyle`/`y_offset`)
ใช้ **adapter** `buildRenderConfig` เทียบ enter:

```ts
const config = buildRenderConfig(
  store.videoUrl,          // Blob | string
  store.subtitles,         // SubtitleEntry[]
  {
    fontFamily, fontSize, y_offset: 80, format,
    quality, useHardwareAccel, gifMaxWidth, fps,
  },
);

const blob = await renderSubtitleVideo(config, (e) => setProgress(e.percent), signal);
```

> adapter map `SubtitleEntry → SubtitleCue` ครบ: `segments`, `position`, `y_offset`,
> `displayStyle`(box per line). study: `src/lib/subtitle-render/adapter-studio.ts`

---

## ⚙️ รองรับ feature (ครบตามที่ UI ตั้งได้)

| Feature | ผ่าน UI เดิม | ผ่าน config ตรง ๆ |
|---|---|---|
| หลาย segment ต่อบรรทัด | ✅ `segments[]` | ✅ `cues[].segments[]` |
| สี / opacity | ✅ | ✅ `segment.style.color/opacity` |
| หนา / เอียง (fontWeight) | ✅ | ✅ |
| ฟอนต์/ขนาด ต่อ segment | ✅ | ✅ `style.fontFamily/fontSize` |
| Stroke (ขอบ) | ✅ | ✅ `strokeActive/strokeColor/strokeWidth` |
| Text shadow | ✅ | ✅ `shadowActive/color/offset/blur` |
| ตำแหน่ง (bottom/top/middle) | ✅ ต่อเส้น | ✅ `cue.position` |
| Y-offset (สูง-ต่ำ) | ✅ ต่อเส้น | ✅ `cue.y_offset` |
| Box/background ต่อเส้น | ✅ `displayStyle` | ✅ `cue.displayStyle` |
| ยกเลิก (AbortController) | ✅ | ✅ ส่ง `signal` ตัวที่ 3 |

---

## 🧪 วิธี debug / ทดสอบ

### 1. หน้า debug (`/render-test`)
หน้า sprint test เดิมใช้ renderer ตรง ๆ — burn ซับ 1 บรรทัดไปกับวิดีโอสั้น แล้วโหลดภาพต้นทาง/ผลลัพธ์ออกมาเช็คตัวหนังสือ.

### 2. print .ass string ดูตาเปล่า
`ass-builder` เป็น **pure function** — เทสต์ได้โดย print string แล้วเทียบกับตัวอย่าง ASS ที่ถูกต้อง:

```ts
import { buildAss } from '@/lib/subtitle-render/ass-builder';
const ass = buildAss(style, cues);
console.log(ass);
```

### 3. loopback spike 5 ขั้นตอน (ประวัติ)
pipeline นี้ผ่าน spike 5 ขั้นแล้ว:
1. load ffmpeg.wasm (self-host + CDN fallback)
2. เขียน input video ลง VFS
3. สร้าง .ass + ฝังฟอนต์ + fontsdir=/fonts
4. exec ffmpeg ใส่ libass (`ass` filter)
5. อ่าน output → Blob

---

## 🔤 เรื่องฟอนต์สำคัญ

- ฟอนต์ที่ใช้ได้ต้องอยู่ใน `FONT_REGISTRY` เท่านั้น (ดู `font-registry.ts`)
- ฟอนต์ที่**ไม่มี**ใน registry → `validateFonts` จะ reject พร้อม error ("ฟอนต์ไม่พร้อม")
- ฟอนต์ภาษาไทยทั้งหมด self-host ที่ `public/fonts/*.ttf`
- ⚠️ ห้ามใช้ `Arial` / `Arimo` เป็นค่า font — ห้ามมีไฟล์ใน registry แล้ว (ถูกเอาออก)
  เพราะ libass หาไฟล์ไม่เจอ → ไม่มีตัวอักษรขึ้น (ปัญหาเดิมของ video-renderer เก่า)

---

## 🛑 ยกเลิก / timeout

- ส่ง `AbortSignal` เป็นพารามิเตอร์ ตัวที่ 3 ของ `renderSubtitleVideo`
- ถ้าถูก abort ระหว่าง exec → เรียก `terminateFFmpeg()` (reset instance global) แล้ว throw `new Error('ABORTED')`
- ผู้เรียกควรจับ `err.message === 'ABORTED'` เพื่อไม่ให้ไปแสดงเป็น error แท้
- หลัง abort ครั้งต่อไปจะ load ffmpeg ใหม่ (singleton ถูกรีเซ็ต)

---

## 🧩 การแมปกับ UI เก่า (Adapters)

- **`SubtitleCue`** ← `SubtitleEntry` (id/time ไม่เอาไป render แต่ถ่ายทอดช่วงเวลา/segments/position/y_offset/displayStyle)
- **`SubtitleSegmentStyle`** ← `TextSegmentStyle` (map 1:1 — ตั้งชื่อ field ตรงกัน)
- **`SubtitleBoxStyle`** ← `SubtitleDisplayStyle` (box + background + boxShadow map ครบ)

ถ้า UI เปลี่ยน field ใหม่ → อัปเดตที่ `adapter-studio.ts` เท่านั้น ไม่ต้องแตะ pipeline.

---

## 📌 หมายเหตุ implementation

- `fps`/`quality`/`gifMaxWidth`/`gifFrameSkip` ส่งผ่าน `output` ของ config
- `useHardwareAccel` มีใน config แต่ ffmpeg.wasm browser ไม่มี hw dec/enc จริง → `supportsHardwareAccel()` คืน `false` เสมอ
- `[V4+ Styles]` สร้าง style rows ต่อตำแหน่ง; cue ที่มี box/position/ย่อหน้านอกเหนือ global → สร้าง style row เฉพาะ (ชื่อ `d{index}_{pos}`) เพื่อแสดงผลตามที่ตั้งไว้ per line
