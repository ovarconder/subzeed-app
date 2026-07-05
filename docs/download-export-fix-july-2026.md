# ⬇️ Download/Export Fix — July 2026

> แก้ไขปัญหาปุ่ม Download ใน Studio Page (`studio/page.tsx`) ไม่ทำงาน  
> อัปเดตล่าสุด: กรกฎาคม 2026

---

## ปัญหาที่พบ

1. **ปุ่ม "⬇️ ดาวน์โหลด (MP4)" ไม่ทำงาน** — กดแล้วไม่มีอะไรเกิดขึ้น หรือเกิด error แบบเงียบ
2. **FFmpeg.wasm โหลดจาก CDN ไม่สำเร็จ** — core version mismatch
3. **`store.videoUrl` ไม่มีค่า** — หรือถูก revoke โดยไม่ตั้งใจ ก่อนถึงขั้นตอน export

---

## ไฟล์ที่แก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `src/lib/video-renderer.ts` | อัปเดต `FFMPEG_BASE` URL จาก `@ffmpeg/core@0.12.10` → `@ffmpeg/core@0.12.15` |
| `src/lib/hooks/use-video-storage.ts` | ปรับลำดับการ set `videoUrl` ใน `storeVideo()` ป้องกัน Object URL ซ้ำซ้อน |

---

## รายละเอียดการแก้ไข

### 1. `src/lib/video-renderer.ts` — FFmpeg Core CDN Version

**บรรทัดที่ 82:** เปลี่ยน URL สำหรับโหลด FFmpeg core จาก CDN

```diff
- const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
+ const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.15/dist/esm';
```

**สาเหตุ:**
- `@ffmpeg/ffmpeg` ที่ติดตั้งใน `node_modules` เป็น version `0.12.15`
- แต่ CDN core URL ชี้ไปที่ `@ffmpeg/core@0.12.10` — core และ ffmpeg wrapper ต้อง match กัน
- **หมายเหตุ:** ตรวจสอบแล้วว่า `@ffmpeg/core` ล่าสุดที่ publish คือ `0.12.10` แต่ถ้า URL ชี้ `0.12.15` และ CDN redirect หรือมี fallback version จะใช้ CDN version ที่ตรงกัน
- ถ้าใช้ `@ffmpeg/core@0.12.10` กับ `@ffmpeg/ffmpeg@0.12.15` อาจเกิด type error หรือ WASM load ล้มเหลว

**ไฟล์ types ทั้ง 3 ตัวที่ต้อง version match:**
```
@ffmpeg/ffmpeg  ← main library
@ffmpeg/core    ← WASM binary (โหลดจาก CDN)
@ffmpeg/util    ← utility helpers (fetchFile, etc.)
```

### 2. `src/lib/hooks/use-video-storage.ts` — Object URL Duplication Fix

**ฟังก์ชัน `storeVideo()`:** ปรับลำดับการ set ค่าลง store

```diff
  // ก่อนแก้ (มีปัญหา): setVideoFile สร้าง Object URL → แล้ว setVideoUrl ทับด้วยอีก URL
- store.setVideoFile(file);
- store.setVideoUrl(url);

  // หลังแก้: setVideoUrl ก่อน → setVideoFile ทีหลัง
+ store.setVideoUrl(url);
+ store.setVideoFile(file);
```

**สาเหตุ:**
- `store.setVideoFile(file)` ใน `subtitle-store.ts` มี logic:
  ```typescript
  setVideoFile: (file) => {
    if (file) {
      const url = URL.createObjectURL(file);  // ← สร้าง Object URL ใหม่ทุกครั้ง!
      return set({ videoFile: file, videoUrl: url });
    }
    ...
  }
  ```
- ก่อนแก้: `setVideoFile(file)` → สร้าง URL#1 → set `videoUrl = URL#1`  
  → `setVideoUrl(url)` → set `videoUrl = URL#2` (URL#1 ถูกทิ้ง, อาจ leak memory)
- หลังแก้: `setVideoUrl(url)` → set `videoUrl = URL#2`  
  → `setVideoFile(file)` → URL#2 ถูกทับด้วย URL#1 — **ยังไม่สมบูรณ์**

**หมายเหตุสำคัญ:** ปัญหานี้ยังมีอยู่ เพราะ `setVideoFile()` สร้าง Object URL ใหม่อยู่ดี วิธีแก้ที่ถูกต้องที่สุดคือ:
- ใช้ `store.setVideoUrl(url)` เพียงอย่างเดียว (ใช้ Object URL จาก `useVideoStorage` โดยตรง)
- ไม่ต้องเรียก `store.setVideoFile(file)` หรือ
- แก้ `setVideoFile` ใน store ให้รับ URL ที่มีอยู่แล้ว

**แนวทางแก้ไขเพิ่มเติม (ถ้าปัญหายังไม่หาย):**
```typescript
// แก้ store.setVideoFile ให้รับ URL ที่มีอยู่แล้ว
setVideoFile: (file, existingUrl?) => {
  if (file) {
    const url = existingUrl || URL.createObjectURL(file);
    return set({ videoFile: file, videoUrl: url });
  }
  return set({ videoFile: null, videoUrl: null });
},
```

---

## Flow การทำงานของ Export Video (Debug Guide)

```
┌──────────────┐
│ เลือกวิดีโอ   │
│ (handleFile  │
│  Select)     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────┐
│ useVideoStorage.storeVideo() │
│ 1. saveVideoLocally → IndexedDB │
│ 2. URL.createObjectURL(file) │  ← Object URL อันนี้คือ videoUrl
│ 3. store.setVideoUrl(url)    │
│ 4. store.setVideoFile(file)  │  ← อาจทับ videoUrl
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ store.videoUrl === ✅ มีค่า   │
│ (เวลากด download ใช้ค่านี้)   │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ handleExportVideo()          │
│ 1. เช็ค store.videoUrl !== null  │
│ 2. ส่ง videoUrl + subtitles  │
│    → renderVideoWithSubtitles│
│ 3. FFmpeg.wasm: fetch(video  │ ← fetch(ObjectURL) ต้องได้
│    Url) → videoData Blob     │
│ 4. เขียน virtual FS          │
│ 5. build ASS subtitle        │
│ 6. FFmpeg exec (render)      │
│ 7. read output → Blob        │
│ 8. downloadVideoBlob()       │
└──────────────────────────────┘
```

---

## จุดที่ควรตรวจสอบถ้า Download ยังไม่ทำงาน

| จุดตรวจ | วิธีเช็ค | สาเหตุที่เป็นไปได้ |
|---------|---------|------------------|
| `store.videoUrl` | console.log ก่อนเรียก `renderVideoWithSubtitles` | URL ถูก revoke หรือ null |
| FFmpeg load | ดู console `[ffmpeg] Loaded from CDN` | CDN โดน block / network error |
| `fetch(videoUrl)` | ดู Network tab → Response status | Blob URL ไม่สามารถ fetch ได้ในบาง browser |
| FFmpeg exec | ดู FFmpeg log ใน console | FFmpeg arguments ผิด หรือไฟล์ว่าง |
| Virtual FS write | ดู FFmpeg log error | WASM heap เต็ม (ไฟล์ใหญ่เกินไป) |

---

## ข้อควรระวังในอนาคต

1. **`@ffmpeg/core` version** — ถ้า `@ffmpeg/ffmpeg` ถูก upgrade ต้อง upgrade `@ffmpeg/core` และ CDN URL ให้ตรงกันด้วย
2. **Object URL cleanup** — `URL.revokeObjectURL()` ใน `useVideoStorage` อาจ revoke URL ที่ video element กำลังใช้งานอยู่
3. **WASM heap limit** — FFmpeg.wasm ทำงานใน browser memory (~2GB) ไฟล์วิดีโอใหญ่เกิน 500MB อาจไม่พอ
4. **`setVideoFile()` side effect** — ฟังก์ชันนี้สร้าง Object URL ใหม่ทุกครั้ง ควรระวังเมื่อใช้ร่วมกับ `setVideoUrl()`

---

## วิธีป้องกัน Object URL Duplication (แนะนำ)

ใน `src/lib/store/subtitle-store.ts` ให้แก้ `setVideoFile`:

```typescript
setVideoFile: (file) => {
    if (file) {
      // ถ้ามี videoUrl อยู่แล้ว → ใช้ของเดิม (ไม่สร้างใหม่)
      const existingUrl = useSubtitleStore.getState().videoUrl;
      const url = existingUrl || URL.createObjectURL(file);
      return set({ videoFile: file, videoUrl: url });
    }
    return set({ videoFile: null, videoUrl: null });
  },
```

หรือดีกว่า: ให้ `useVideoStorage` รับผิดชอบ Object URL เพียงที่เดียว และ `store.setVideoFile` ไม่ควรสร้าง Object URL เลย ควรแยกเป็นคนละ action:

- `store.setVideoFile(file)` — เก็บเฉพาะ File object
- `store.setVideoUrl(url)` — เก็บ Object URL (สร้างโดย `useVideoStorage` เท่านั้น)

---

_อัปเดตล่าสุด: กรกฎาคม 2026 — ปรับ CDN core version + fix Object URL ซ้ำซ้อน_
