# 🎥 Studio — Export Video & Local Storage

> ระบบ Export วิดีโอฝังซับถาวร + จัดการวิดีโอแบบ Local-first

---

## 📦 โครงสร้างไฟล์ที่เกี่ยวข้อง

```
src/
├── lib/
│   ├── video-renderer.ts           ← FFmpeg.wasm — เรนเดอร์วิดีโอฝั่ง Client
│   ├── local-video-storage.ts      ← IndexedDB — เก็บวิดีโอในเครื่อง user
│   └── hooks/
│       └── use-video-storage.ts    ← React Hook สำหรับใช้งานข้างบน
├── components/studio/
│   └── subtitle-settings-bar.tsx   ← แถบตั้งค่าฟอนต์/ขนาด/ตำแหน่ง
└── app/studio/
    ├── page.tsx                    ← หน้าสร้าง project ใหม่
    └── [id]/page.tsx               ← หน้าเปิด project เก่า
```

---

## 1. 🎬 Video Renderer (FFmpeg.wasm)

### แทนที่ MediaRecorder ด้วย FFmpeg.wasm

**เดิม:** ใช้ Canvas `captureStream()` + `MediaRecorder` → ได้แค่ **WebM** เท่านั้น  
**ใหม่:** ใช้ `@ffmpeg/ffmpeg` → รองรับ **MP4 (H.264), WebM (VP9), MOV, GIF**

### Pipeline

```
User Video (Blob/URL)
       │
       ▼
┌──────────────────────────────┐
│  1. Load FFmpeg.wasm (CDN)   │ ← โหลดครั้งแรก ~3.5MB
│     Singleton — แชร์ทั้ง app  │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  2. เขียน Video → Virtual FS │
│     (virtual filesystem      │
│      ใน WASM memory)         │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  3. สร้าง ASS subtitle file  │
│     (Advanced SubStation     │
│      Alpha format)           │
│     รองรับฟอนต์, สี, ขนาด    │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  4. FFmpeg exec              │
│     subtitles=subs.ass filter│
│     + codec args             │
│     = hardsub video          │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  5. อ่าน output → Blob       │
│     → ดาวน์โหลด              │
└──────────────────────────────┘
```

### รองรับ 3 Output Types

| Format | Codec | Extension | ใช้กับ |
|--------|-------|-----------|--------|
| **MP4** | libx264 (H.264) | `.mp4` | ทุกอุปกรณ์, โซเชียลมีเดีย |
| **WebM** | libvpx-vp9 | `.webm` | คุณภาพสูง, ไฟล์เล็ก |
| **MOV** | libx264 | `.mov` | ตัดต่อใน Premiere/Final Cut |
| **GIF** | palettegen+paletteuse | `.gif` | แชร์ใน LINE/Social |

### Quality Presets

| Preset | CRF (H.264) | ความหมาย |
|--------|-------------|----------|
| `best` | 18 | คุณภาพสูงสุด, encode ช้า |
| `high` | 23 | **ค่าเริ่มต้น**, สมดุล |
| `medium` | 28 | ไฟล์เล็ก, คุณภาพกลาง |
| `fast` | 35 | เร็วที่สุด, เหมาะ preview |

### Hardware Acceleration

- **Mac เท่านั้น** — ใช้ `h264_videotoolbox` encoder
- ใช้ bitrate แทน CRF (เพราะ HW encoder ไม่รองรับ CRF)
- เร็วกว่า CPU encoding ~3-5x
- ตรวจจับอัตโนมัติผ่าน `supportsHardwareAccel()`

### การติดตั้ง

```bash
npm install @ffmpeg/ffmpeg@0.12.10 @ffmpeg/util@0.12.1
```

FFmpeg core (~3.5MB) จะถูกดาวน์โหลดจาก CDN เมื่อ export ครั้งแรก

---

## 2. 🗄️ Local Video Storage (IndexedDB)

### ปัญหาเดิม
- `store.videoUrl` = `URL.createObjectURL(file)` → **หายเมื่อ refresh** หรือกลับมาเปิด project เก่า
- `handleSave` ไม่เคยอัปโหลดวิดีโอ → เปิด project เก่าใน `studio/[id]` แล้วไม่มีวิดีโอ

### แนวทาง: Local-first (เหมือน Capcut / DaVinci Resolve)

```
┌────────────────────────────────────────────────────┐
│  🗄️ IndexedDB (เครื่อง User)                       │
│  DB: subzeed-videos                                │
│  ┌──────────────────────────────────────────────┐  │
│  │ video_project_{id} ← ArrayBuffer            │  │
│  │   ├ fileName: "intro.mp4"                   │  │
│  │   ├ mimeType: "video/mp4"                   │  │
│  │   ├ size: 45231872                          │  │
│  │   └ data: [ArrayBuffer]                     │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘

📦 Supabase DB (Server)
   projects: { id, subtitle[], duration_seconds }
   ❌ ไม่เก็บ video_url
```

### ไฟล์ที่สร้าง

| ไฟล์ | หน้าที่ |
|------|--------|
| `local-video-storage.ts` | CRUD IndexedDB โดยตรง (save, load, delete, has, usage) |
| `hooks/use-video-storage.ts` | React Hook: storeVideo, loadVideo, removeVideo |

### Flow การทำงาน

#### สร้าง project ใหม่ (studio/page.tsx)
```
1. User เลือกวิดีโอ
2. handleFileSelect → ตรวจสอบ duration
3. ✅ storeVideo(projectId, file)
   └─ reader.readAsArrayBuffer(file)
   └─ indexedDB.put({ id: `video_${projectId}`, data, ... })
4. URL.createObjectURL(file) → store.setVideoUrl(url)
5. store.setCurrentProject(...)
```

#### เปิด project เก่า (studio/[id]/page.tsx)
```
1. fetch project จาก Supabase
2. ✅ loadVideoLocally(projectId)
   └─ indexedDB.get(`video_${projectId}`)
   └─ new Blob([data]) → URL.createObjectURL(blob)
3. store.setVideoUrl(url)
4. store.setCurrentProject(data)
```

#### ถ้าไม่เจอวิดีโอในเครื่อง
```tsx
{!store.videoUrl && (
  <p className="text-warning/70">
    ⚠️ ไม่พบไฟล์วิดีโอในเครื่อง กรุณาเลือกวิดีโอใหม่
  </p>
)}
```

### ข้อควรระวัง
- IndexedDB quota อยู่ที่ ~50-80% ของพื้นที่ disk
- ถ้า user clear browser cache / เปลี่ยนเครื่อง → video หาย
- ไฟล์ใหญ่ > 500MB อาจช้า ควรมี UI แจ้งสถานะ

---

## 3. 🎛️ Subtitle Settings Bar

แถบตั้งค่าฟอนต์/ขนาดสำหรับแสดง subtitle

```
[Font: Arial ▼] [Size: 20 ▼] [Position: ▬▬▬●▬▬▬]
```

### ฟีเจอร์

| ฟีเจอร์ | Free | Premium+ |
|---------|:----:|:--------:|
| ฟอนต์มาตรฐาน (Arial, Kanit, Itim, Chonburi) | ✅ | ✅ |
| ฟอนต์พรีเมียม (Prompt, Sarabun, Mali, Noto Sans Thai) | 🔒 ล็อก | ✅ |
| ปรับขนาดตัวอักษร (16-32px) | ✅ | ✅ |
| Y-Offset Slider | ✅ | ✅ |
| Animation (Fade, Typewriter, Slide, Highlight) | 🔒 | ✅ |

### Font Tiers

```typescript
const STANDARD_FONTS = ['Arial', 'Kanit', 'Itim', 'Chonburi'];
const PREMIUM_FONTS = ['Prompt', 'Sarabun', 'Mali', 'Noto Sans Thai'];
```

---

## 4. 📄 Export Section UI

ใน sidebar ด้านล่าง subtitle list:

```
┌─────────────────────┐
│ Format: [MP4 (H.264)▼] │
│ คุณภาพ: [สูง ▼]        │
│ [🚀 เร่งด้วย GPU]      │  ← แสดงเฉพาะ Mac
│ [ ⬇️ ดาวน์โหลด (MP4) ]│
└─────────────────────┘
```

สำหรับ GIF:
```
┌─────────────────────┐
│ Format: [GIF ▼]       │
│ ความกว้าง: [480] px   │
│ [ ⬇️ ดาวน์โหลด (GIF) ]│
└─────────────────────┘
```

ระหว่างกำลัง export:
```
┌─────────────────────┐
│ กำลังเรนเดอร์ 67%    │
│ ████████████░░░░░░  │
└─────────────────────┘
```

---

## 5. 🔧 Key Technical Decisions

### ทำไม FFmpeg.wasm แทน MediaRecorder?

| หัวข้อ | MediaRecorder | FFmpeg.wasm |
|--------|:-------------:|:-----------:|
| Output format | WebM เท่านั้น | MP4, WebM, MOV, GIF |
| Audio sync | manual (อาจ drift) | ✅ อัตโนมัติ |
| คุณภาพวิดีโอ | browser กำหนด | ✅ CRF ควบคุมเอง |
| ความเร็ว | real-time (30fps = 30fps) | ✅ เร็วกว่า (encode offscreen) |
| Flash size | ไม่มี | ~3.5MB (ครั้งแรก) |

### ทำไมเก็บวิดีโอใน IndexedDB?

1. **ไม่เสีย bandwidth server** — user อาจอัปโหลดไฟล์ 500MB ถ้าทุกคน upload ก็แพง
2. **เก็บเฉพาะ JSON** — subtitle เล็ก (~10KB) vs ไฟล์วิดีโอ (~100MB+)
3. **ความเป็นส่วนตัว** — วิดีโอไม่ต้องขึ้น server เลย
4. **UX คล้าย Capcut** — เปิด project เก่าแล้วมีวิดีโอ

### ทำไมใช้ ASS แทน SRT?

ASS (Advanced SubStation Alpha) รองรับ:
- ✅ กำหนดฟอนต์เดี่ยว (`Fontname`)
- ✅ กำหนดขนาด (`Fontsize`)
- ✅ สีข้อความ + สีขอบ (`PrimaryColour`, `OutlineColour`)
- ✅ รองรับภาษาไทย (UTF-8)
- ✅ FFmpeg มี `subtitles` filter รองรับ native

SRT กำหนดสไตล์ไม่ได้ → ต้อง draw ด้วย Canvas ทีละ frame ซึ่งช้ากว่า

---

## 6. 🚨 ข้อจำกัดและแนวทางการแก้ไข

### ข้อจำกัดปัจจุบัน

| ปัญหา | สาเหตุ | แนวทางแก้ไข |
|-------|--------|------------|
| Export วิดีโอยาว 10 นาทีใช้เวลา ~2-3 นาที | FFmpeg.wasm ทำงานบน CPU | เปิด HW acceleration, หรือส่งไป server |
| IndexedDB quota ไม่แน่นอน | browser จำกัดพื้นที่ | ตรวจสอบ `getVideoStorageUsage()`, แจ้ง user |
| User clear cache → video หาย | IndexedDB อยู่ใน browser | เพิ่มตัวเลือก "อัปโหลดขึ้น Server" สำหรับ Premium |
| FFmpeg core download ครั้งแรก 3.5MB | ต้อง download จาก CDN | precache ใน `service worker` หรือ background |
| วิดีโอ 4K 60fps → ไฟล์ใหญ่ + ช้า | encode หนัก | resize ก่อนส่งเข้าระบบ export |

### การปรับปรุงในอนาคต

- **Server-side render** — สำหรับ Premium+ ส่งไป render ที่ server (ใช้ Vercel Edge / AWS Lambda)
- **Cloud backup** — อัปโหลดวิดีโอขึ้น Supabase Storage (private bucket) เผื่อเปลี่ยนเครื่อง
- **WebCodecs API** — encode เร็วกว่า MediaRecorder แต่ซับซ้อนกว่า (fallback เป็น MediaRecorder)
- **ProRes output** — สำหรับตัดต่อใน Davinci Resolve (Business tier)
- **Batch export** — export หลาย project พร้อมกัน
- **Video thumbnails** — แสดง thumbnail ใน dashboard

---

## 7. 📝 สรุป Flow การทำงานของ Export

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│  Studio  │ ───► │  เลือก format │ ───► │  เลือกคุณภาพ  │
│  (page)  │      │  MP4/WebM/   │      │  best/high/   │
└──────────┘      │  MOV/GIF     │      │  medium/fast  │
                  └──────────────┘      └──────┬───────┘
                                               ▼
                  ┌───────────────────────────────────────┐
                  │  renderVideoWithSubtitles()            │
                  │  1. Load FFmpeg.wasm                  │
                  │  2. สร้าง ASS subtitle                 │
                  │  3. FFmpeg exec (codec + filters)     │
                  │  4. onProgress() callback             │
                  └──────────────┬────────────────────────┘
                                 ▼
                  ┌───────────────────────────────────────┐
                  │  Blob → downloadVideoBlob()           │
                  │  User ได้ไฟล์ .mp4/.webm/.mov/.gif    │
                  └───────────────────────────────────────┘
```

---

_อัปเดตล่าสุด: กุมภาพันธ์ 2568 — FFmpeg.wasm + IndexedDB_
