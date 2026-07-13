# 🎥 FFmpeg.wasm Renderer — Milestone: Render ผ่าน (Single-thread, Self-host)

> **วันที่:** July 2026  
> **Commit:** `8d9e951`  
> **สถานะ:** ✅ Render วิดีโอออกมาได้ (แต่ subtitle ยังไม่ burn-in)

---

## สรุป

หลังจาก debug มาหลายวัน ปัญหาคือ `instance.load()` ค้าง — สาเหตุคือ:

1. **CDN ต่างประเทศ** — jsDelivr / unpkg ใช้ไม่ได้หรือช้าสำหรับ WASM 31MB
2. **`classWorkerURL`** — internal worker ของ `@ffmpeg/ffmpeg` มีปัญหาใน Vercel proxy environment (fetch Blob URL อีกครั้งไม่ผ่าน)
3. **ไฟล์ไม่ตรง basePath** — ตอนแรกไฟล์ถูก deploy ที่ root แต่ app อยู่ที่ `/subzeed/`

---

## สถาปัตยกรรมที่ทำงานได้

### 1. Self-host WASM

ไฟล์ 2 ตัวถูก deploy ไว้ที่ `public/ffmpeg/` → serve ที่ `/subzeed/ffmpeg/`:

| ไฟล์ | ขนาด | Path |
|------|------|------|
| `ffmpeg-core.js` | ~109 KB | `/subzeed/ffmpeg/ffmpeg-core.js` |
| `ffmpeg-core.wasm` | ~31 MB | `/subzeed/ffmpeg/ffmpeg-core.wasm` |

> `worker.js` ของ `@ffmpeg/ffmpeg` ไม่จำเป็น (ไม่ใช้ `classWorkerURL`)

### 2. Single-thread mode

`instance.load()` รับแค่ `coreURL` + `wasmURL` — **ไม่ส่ง `classWorkerURL`**

```ts
await instance.load({
  coreURL: coreBlobURL,   // → Blob URL of ffmpeg-core.js
  wasmURL: wasmBlobURL,   // → Blob URL of ffmpeg-core.wasm
  // ไม่มี classWorkerURL → single-thread mode
});
```

ข้อดี: ไม่ต้องสร้าง Web Worker, internal fetch WASM ครั้งเดียว ไม่มี两层 proxy

### 3. Fallback logic

```ts
// ลอง self-host ก่อน
const selfHostBase = '/subzeed/ffmpeg';

try {
  // HEAD test 3s → ถ้าไม่ถึง fallback CDN
  await fetchWithTimeout(`${selfHostBase}/ffmpeg-core.js`, ..., 3_000);
  coreURL = `${selfHostBase}/ffmpeg-core.js`;
  wasmURL = `${selfHostBase}/ffmpeg-core.wasm`;
} catch {
  // fallback → jsDelivr
  coreURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js';
  wasmURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm';
}
```

### 4. Timeout และ Cancel (ป้องกันค้าง)

3 กลไก:

| กลไก | รายละเอียด |
|------|-----------|
| `awaitCancelable()` | wrapper promise ที่ reject ทันทีเมื่อ signal abort หรือ timeout |
| `loadGeneration` | กัน stale load — ถ้ายกเลิกแล้ว instance เก่าโหลดเสร็จทีหลัง จะถูก discard |
| `execWithAbort()` | terminate FFmpeg instance เมื่อ abort ระหว่าง exec |

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|------|--------|
| `src/lib/video-renderer.ts` | Renderer หลัก (renderVideoWithSubtitles, getFFmpeg, awaitCancelable, execWithAbort) |
| `src/app/studio/page.tsx` | เรียก renderer + UI progress bar + handleCancelExport |
| `public/ffmpeg/ffmpeg-core.js` | ffmpeg-core (self-host) |
| `public/ffmpeg/ffmpeg-core.wasm` | ffmpeg-core WASM 31MB (self-host) |

---

## ปัญหาที่ได้รับการแก้ไขแล้ว (July 2026)

1. **Subtitle ไม่ burn-in (แก้ไขแล้ว - July 2026)**
   * **ปัญหา:** วิดีโอผลลัพธ์ที่ได้จากการส่งออกไม่มีซับไตเติลแสดงผลเลย
   * **สาเหตุ:** 
     1. `libass` ในสภาพแวดล้อมแซนด์บ็อกซ์ของ FFmpeg.wasm ไม่มีฟอนต์ระบบติดตั้งอยู่ตั้งแต่แรก และโค้ดเดิมจะดาวน์โหลด/เขียนฟอนต์ `Noto Sans Thai` ลง VFS เฉพาะเมื่อผู้ใช้เลือกใช้ Noto Sans Thai เท่านั้น ทำให้หากผู้ใช้เลือกฟอนต์อื่น (เช่น Arial, Kanit) จะไม่มีฟอนต์ใดเขียนลง VFS เลย
     2. ไม่มีการระบุพารามิเตอร์ `fontsdir` ให้กับ `subtitles` filter ทำให้อิมเมจของ `libass` หาฟอนต์ในโฟลเดอร์ `/fonts` ไม่เจอ
     3. ใน `segmentToAss` ไม่มีการระบุ override tags สำหรับ Font Name (`\\fnNoto Sans Thai`)
   * **การแก้ไข:**
     1. บังคับให้ดาวน์โหลดและเขียนฟอนต์ภาษาไทย Noto Sans Thai ลงโฟลเดอร์ `/fonts/NotoSansThai-Regular.ttf` ใน VFS ทุกครั้งที่มีการส่งออกเพื่อทำหน้าที่เป็น Fallback Font กลาง
     2. อัปเดตพารามิเตอร์ของ `subtitles` filter ใน `renderVideo` และ `renderGif` ให้เป็น `subtitles=subs.ass:fontsdir=/fonts` เสมอ เพื่อบังคับให้ค้นหาฟอนต์ในโฟลเดอร์เสมือน
     3. ใส่ `\\fnNoto Sans Thai` เข้าใน Segment tags ของ ASS เสมอเพื่อให้แน่ใจว่าระบบจะแสดงผลฟอนต์ภาษาไทยนี้ได้อย่างถูกต้อง

## ปัญหาที่เหลือ (ต้องแก้ต่อ)

1. **Progress bar ที่ 2%** — `onProgress(2)` หลังจาก `getFFmpeg()` แต่ UI อาจไม่ refresh
2. **Error handling** — error toast แสดง "FFmpeg.wasm ไม่สำเร็จ" ไม่ถูกต้องเมื่อเป็น subtitle error
3. **Retry logic** — ใน page.tsx retry 3 ครั้ง ทุกครั้งจะ `terminateFFmpeg()` + `getFFmpeg()` ใหม่

---

## วิธีเช็คว่า Render เริ่มทำงาน

เปิด DevTools Console แล้วดู log:

```
[render] Step 1/7: getFFmpeg (โหลด core+wasm)...
[ffmpeg] Loading core.js + core.wasm from self-host: /subzeed/ffmpeg
[ffmpeg] Self-host OK
[ffmpeg] All 3 assets fetched, calling ffmpeg.load() (single-thread)...
[ffmpeg] FFmpeg ready          ← ถ้าขึ้นนี้แปลว่า load สำเร็จ
[render] Step 2/7: encoding...
[render] Step 3/7 done
```

---

## เวอร์ชันที่ใช้

| package | เวอร์ชัน |
|---------|---------|
| `@ffmpeg/ffmpeg` | `0.12.10` |
| `@ffmpeg/core` | `0.12.10` |
| `@ffmpeg/util` | ล่าสุด |
