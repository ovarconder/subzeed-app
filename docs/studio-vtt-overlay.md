# 🎬 Studio VTT Subtitle Overlay — Lessons Learned

> Subtitle บน video + Canvas watermark **ไม่ดัน layout**

---

## ⚠️ ปัญหาที่ 1: Subtitle ดัน video ลงทุกครั้งที่ถอดความใหม่

### สาเหตุ
1. **Subtitle overlay เป็น `<div>` element + `currentSub` state**
   - ทุกครั้งที่ `timeupdate` → React find matching subtitle → re-render div → CSS layout shift เล็กน้อย
   - สะสมทุกครั้ง → video ค่อยๆ เลื่อนลง
2. **Canvas watermark ใช้ `video.clientWidth/Height`**  
   - ซึ่งเปลี่ยนทุกครั้งที่ layout ขยับ → canvas ขยาย → layout ขยับเพิ่ม → loop

### แก้ (รอบ 1)
- ✅ **ย้าย subtitle + canvas ไปใน container `absolute inset-0`** (ไม่เป็น sibling กับ video)
- ✅ **ใช้ `bottom-[10%]` fixed** แทน `y_offset` dynamic

### ผลลัพธ์
- video ไม่ขยับจาก subtitle แล้ว แต่ **canvas ยังไม่ clearRect** → ภาพซ้อน

---

## ⚠️ ปัญหาที่ 2: Canvas ไม่ clear + ขนาดพองโต

### สาเหตุ
- canvas ปรับขนาดทุก frame ด้วย `video.clientWidth/Height`
- ไม่มี `clearRect()` → ทับของเก่า
- ขนาด canvas พองโต → layout shift

### แก้ (รอบ 2)
- ✅ เพิ่ม `ctx.clearRect(0, 0, canvas.width, canvas.height)` ทุก frame
- ✅ ใช้ `ResizeObserver` + `getBoundingClientRect()` แทน `clientWidth`
- ✅ เปลี่ยน `className="absolute inset-0"` → ใช้ `style` ควบคุม width/height โดยตรง

### ผลลัพธ์
- canvas คงที่, ไม่ซ้อน → **แต่ video ratio ยังเพี้ยนเมื่อกดถอดความซ้ำ**

---

## ⚠️ ปัญหาที่ 3: Video ratio เปลี่ยนทุกครั้งที่กดถอดความใหม่

### สาเหตุ
- `setVttUrl(newBlobUrl)` → **state change** → React re-render `<video>` พร้อม children
- JSX conditional `{vttUrl && <track ... />}` → React create new `<track>` element
- → **video element ถูก mount ใหม่ทั้งหมด** → src หาย → ขนาด 0 → canvas resize → ratio ผิด

### แก้ (รอบ 3 — ปัจจุบัน)
- ✅ เปลี่ยน `vttUrl` state → **useRef** (`vttUrlRef`)
- ✅ inject `<track>` ด้วย **DOM API** (`injectVttTrack`) ไม่ผ่าน JSX
- ✅ ไม่มี conditional children ใน `<video>` → video stable ตลอด

```typescript
// ✅ injectVttTrack — ใช้ DOM API ไม่ให้ React จับ video
function injectVttTrack(video: HTMLVideoElement | null, vttUrl: string) {
  if (!video) return;
  // ลบ track เก่า
  const oldTracks = video.querySelectorAll('track');
  oldTracks.forEach((t) => { if (t.src) URL.revokeObjectURL(t.src); t.remove(); });
  // สร้าง track ใหม่
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.src = vttUrl;
  track.srcLang = 'th';
  track.label = 'ไทย';
  track.default = true;
  video.appendChild(track);
}
```

---

## 📌 โครงสร้างปัจจุบัน (correct)

```tsx
<div className="relative w-full h-full flex items-center justify-center">
  <video ref={videoRef} src={store.videoUrl} controls className="max-w-full max-h-full" />
  {/* ✅ ไม่มี children ใน JSX — track inject via ref */}
</div>
```

- **video** — sibling เดียวใน flex container
- **watermark canvas** — จัดการใน `useEffect` แยก 
- **subtitle track** — inject ด้วย `injectVttTrack()` → **ไม่ re-render video**
- **processing overlay** — `absolute inset-0` (ไม่กระทบ video)

---

## 🔧 Key Takeaways

| ปัญหา | Root Cause | Fix |
|-------|-----------|-----|
| video เลื่อนลงเรื่อยๆ | subtitle div sibling + re-render | ย้ายไป container แยก + WebVTT |
| canvas ภาพซ้อน | ไม่ clearRect() | `ctx.clearRect()` ก่อนทุก frame |
| canvas ขนาดพองโต | clientWidth เปลี่ยนทุก re-render | `ResizeObserver` + `getBoundingClientRect` |
| video ratio เปลี่ยน | state change → re-mount video | `useRef` + DOM API inject track |

**Golden Rule:**  
> อย่าใช้ state/JSX conditional ใน children ของ `<video>` — ใช้ DOM API แทนถ้าทำได้

_อัปเดตล่าสุด: ครั้งที่ 3 — DOM API inject track_
