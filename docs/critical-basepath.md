# ✅ อัปเดต — basePath ไม่ใช้แล้ว (เป็นเว็บตัวเอง)

> **สถานะ: ไม่ใช้ basePath แล้ว**
> เดิมแอปถูก reverse proxy ที่ `https://overconda.space/subzeed/*`
> ทำให้ต้องมี `basePath: "/subzeed"` เพราะเกาะอยู่กับเว็บอื่น
>
> ตอนนี้แอปเป็นเว็บของตัวเองที่ root (`https://www.subzeed.com/`)
> จึง **ไม่จำเป็นต้องใช้ basePath อีกต่อไป**

---

## สาเหตุของ bug ที่เจอ (สำคัญ)

`src/lib/api.ts` เดิมใช้ `getBasePath()` ที่ **เดา basePath จาก pathname**:

```js
const parts = window.location.pathname.split('/').filter(Boolean);
if (parts.length > 0 && parts[0] !== 'api') {
  return `/${parts[0]}`;   // ← เดาผิด!
}
```

เมื่อผู้ใช้อยู่หน้า `/studio`, `/admin` ฯลฯ → มันเดาว่า `parts[0] = 'studio'`
เป็น basePath → `api('/api/...')` กลายเป็น **`/studio/api/...`** ❌ → 404

ตัวอย่างที่เกิดจริง:
```
POST https://www.subzeed.com/studio/api/transcribe-and-save 404 (Not Found)
```
แทนที่จะเป็น `https://www.subzeed.com/api/transcribe-and-save`

---

## สิ่งที่แก้แล้ว (ถูกต้องในปัจจุบัน)

### `src/lib/api.ts` — ไม่เดา basePath จาก pathname แล้ว

```ts
export function getBasePath(): string {
  // ใช้ basePath เฉพาะที่กำหนด explicit ผ่าน runtimeConfig เท่านั้น
  // ⚠️ ห้ามเดาจาก pathname — หน้า /studio, /admin ฯลฯ ไม่ใช่ basePath
  if (typeof window === 'undefined') return '';
  try {
    const nextData = (window as any).__NEXT_DATA__;
    if (nextData?.runtimeConfig?.basePath) {
      return nextData.runtimeConfig.basePath as string;
    }
  } catch {}
  return '';
}
```

### `next.config.ts` — `basePath` ถูก comment ทิ้ง

```ts
//basePath: "/subzeed", // เดิมสำหรับ reverse proxy เก่า — ไม่ใช้แล้ว
```

---

## ข้อควรจำ (ปัจจุบัน)

1. ✅ เว็บอยู่ที่ root — **อย่า** เดา basePath จาก pathname อีก
2. ✅ ใช้ `api()` helper ต่อไป (สะอาด ถ้า runtimeConfig ตั้ง basePath จริงค่อยอ่าน)
3. ⚠️ ถ้าในอนาคต mount ที่ subpath จริง ๆ ค่อยเอา basePath กลับมา
   และต้อง configure ผ่าน runtimeConfig อย่างถูกต้อง (ไม่ใช่เดา)
4. ⚠️ อย่าแก้ `getBasePath()` ให้เดาจาก `window.location.pathname` อีกเด็ดขาด
   (เดาผิดทุกครั้งเมื่ออยู่หน้า subfolder → ปัญหา 404 เดิมซ้ำ)
5. ✅ `api('/api/...')` เรียกจากหน้าไหนก็ถูก — ฟังก์ชันต้อง return path ตรงเสมอ

---

_อัปเดต ณ วันที่มีการลบ basePath ออกจากการใช้งาน (เป็นเว็บของตัวเองแล้ว)_
