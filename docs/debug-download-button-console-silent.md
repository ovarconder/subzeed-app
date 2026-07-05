# 🔍 Debug: ปุ่มดาวน์โหลดเงียบ (Console + Network ไม่มีอะไร)

> อัปเดต: กรกฎาคม 2026

---

## สถานะ

กดปุ่ม "⬇️ ดาวน์โหลด (MP4)" → ไม่เกิดอะไรขึ้น  
- ❌ ไม่มี log ใน Console  
- ❌ ไม่มี Network Request  
- ❌ ไม่มี Toast แจ้งเตือน  
- ❌ ไม่มี Error ใน DevTools  

---

## สาเหตุที่เป็นไปได้

### 1. `isExporting` state ค้างเป็น `true`
- ถ้าเคยกด export แล้ว browser refresh หรือ component unmount ก่อนที่ export จะเสร็จ
- `isExporting` ยังเป็น `true` หลังจาก re-mount
- ทำให้ UI แสดง Progress Bar แทนปุ่ม → ผู้ใช้กดไม่ได้

**วิธีเช็ค:** เปิด DevTools → Elements → หา `<div>` ที่มีข้อความ "กำลังเรนเดอร์วิดีโอ 0%"

**วิธีแก้:** เพิ่ม `useEffect` reset state ตอน mount:
```typescript
useEffect(() => {
  setIsExporting(false);
  setExportProgress(0);
}, []);
```

### 2. `store.subtitles.length === 0`
- ถ้า transcribe ไม่สำเร็จ หรือ store ถูก reset
- ปุ่ม export อยู่ใน branch `store.subtitles.length > 0` → ถ้าไม่มี subtitle, ปุ่มจะไม่ mount

**วิธีเช็ค:** ดูที่ Sidebar ว่ามี subtitle list แสดงอยู่หรือไม่

**วิธีแก้:** transcribe ให้สำเร็จก่อน

### 3. React Error ใน component tree ก่อนหน้าปุ่ม
- Error ใน `InteractiveCanvasOverlay`, `SubtitleItem`, หรือ component อื่น
- React Error Boundary อาจทำให้ทั้ง subtree ที่อยู่ถัดไปหยุดทำงาน
- ปุ่ม export อยู่ใน Fragment (`<>...</>`) หลังจาก `store.subtitles.map(...)` → ถ้า `map` throws error, export div จะไม่ถูก mount

**จุดเสี่ยงใน InteractiveCanvasOverlay:**
```typescript
// interactive-canvas-overlay.tsx บรรทัด ~415
const parentRect = canvas.offsetParent!.getBoundingClientRect();
```
`offsetParent` อาจเป็น `null` ถ้า canvas ถูกซ่อน → TypeError

### 4. `handleExportVideo` function ไม่ถูกสร้าง
- เป็นไปได้ยาก เพราะ React จะสร้าง function ใหม่ทุก render  
- แต่ถ้า Component ไม่ re-render (เพราะ state ไม่อัปเดต) function เดิมก็ยังใช้ได้

### 5. `<Button>` component ปิดกั้น event
- `loading` prop ถ้าเป็น `true` → button มี `disabled`  
- `disabled` prop ถ้าเป็น `true` → button มีคลาส `cursor-not-allowed`  

---

## ขั้นตอน Debug ที่ทำไปแล้ว

### ✅ ครั้งที่ 1 (ก่อน commit `5b0db5c`)

**สิ่งที่ทำ:**
1. เปลี่ยน CDN core URL จาก `0.12.10` → `0.12.15`
2. ปรับลำดับ `store.setVideoUrl()` ก่อน `store.setVideoFile()` ใน `useVideoStorage`

**ผลลัพธ์:** ยังไม่หาย — กดปุ่มแล้วเงียบเหมือนเดิม

### ✅ ครั้งที่ 2 (commit นี้)

**สิ่งที่ทำ:**
- เพิ่ม `console.log('[Export] handleExportVideo CLICKED', ...)` ที่ต้น `handleExportVideo`

**ที่ต้องเช็คต่อ (หลังจาก deploy หรือ dev):**
1. เปิด Console → กดปุ่ม download → มี log "handleExportVideo CLICKED" หรือไม่?
   - ถ้า **มี**: แสดงว่า `handleExportVideo` ถูกเรียก → ปัญหาอยู่ในฟังก์ชัน (FFmpeg, fetch, etc.)
   - ถ้า **ไม่มี**: ปุ่มไม่ถูก mount หรือ event handler ไม่ถูก bind → กลับไปเช็คข้อ 1-4 ข้างบน
2. ถ้ามี log → เช็คค่าที่ log ออกมา:
   - `hasVideoUrl` = true/false?
   - `subtitleCount` > 0?
   - `isExporting` = false?

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|------|--------|
| `src/app/studio/page.tsx` | หน้า Studio หลัก — มี `handleExportVideo` และปุ่ม download |
| `src/lib/hooks/use-video-storage.ts` | จัดการ Object URL + IndexedDB |
| `src/lib/video-renderer.ts` | FFmpeg.wasm render + download helper |
| `src/components/ui/button.tsx` | Button component — `disabled`, `loading` |
| `src/components/studio/interactive-canvas-overlay.tsx` | Canvas overlay — อาจ throw error (บรรทัด `offsetParent!`) |

---

## วิธีแก้ด่วน (Temporary Fix)

ถ้าต้องการ bypass เพื่อให้ download ทำงานทันที (ไม่ใช้ FFmpeg):

```typescript
// สร้าง blob จาก videoUrl โดยตรง (ไม่ใช้ FFmpeg)
const handleExportVideoDirect = async () => {
  if (!store.videoUrl) return;
  const resp = await fetch(store.videoUrl);
  const blob = await resp.blob();
  downloadVideoBlob(blob, 'original-video.mp4');
};
```

หรือตรวจสอบว่า Error Boundary ครอบ component หรือไม่

---

_อัปเดตล่าสุด: กรกฎาคม 2026_
