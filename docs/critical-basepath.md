# ⚠️ CRITICAL: basePath = "/subzeed" — ห้ามลืมเด็ดขาด!

> **ระดับ: CRITICAL** — ถ้าลืมจะเสียเวลาเป็นวัน
> อัปเดตล่าสุด: หลังจากเสียเวลา Debug ไปหลายวัน

---

## ปัญหา

`next.config.ts` มี `basePath: "/subzeed"` เพราะแอปถูก reverse proxy ไว้ที่
`https://overconda.space/subzeed/*`

**ผล:** ทุกเส้นทางใน production ต้องมี `/subzeed` นำหน้า
- `/api/admin/stats` → **ต้องเรียก** `/subzeed/api/admin/stats`
- `/dashboard` → ต้องเป็น `/subzeed/dashboard`
- ฯลฯ

---

## วิธีแก้ไขที่ถูกต้อง (ห้ามใช้วิธีอื่น)

### ✅ ห้ามใช้ fetch(path) ตรงๆ

```ts
// ❌ แบบนี้ใช้ใน production ไม่ได้
const res = await fetch('/api/admin/users');
```

### ✅ ต้องใช้ `api()` helper จาก `@/lib/api` เสมอ

```ts
// ✅ ใช้ api() helper
import { api } from '@/lib/api';

const res = await fetch(api('/api/admin/users'), {
  headers: { 'x-user-id': user?.id },
});
```

### ✅ `api()` helper (src/lib/api.ts)

```ts
export function api(path: string): string {
  if (typeof window === 'undefined') return path;
  
  // เช็ค __NEXT_DATA__ หรือ location pathname
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length > 0 && parts[0] !== 'api') {
    return `/${parts[0]}${path}`;
  }
  return path;
}
```

`api()` จะอ่าน `window.location.pathname` เพื่อหา basePath แล้วเติมให้อัตโนมัติ
(เช่น /subzeed/api/admin/users)

---

## ไฟล์ที่ต้องระวัง (ติดตามและแก้ไขแล้ว)

| ไฟล์ | สถานะ |
|------|--------|
| `src/app/admin/page.tsx` | ✅ `apiGet()` + `handleUpdateTier()` + `handleUnblock()` ใช้ `api()` |
| `src/app/studio/page.tsx` | ✅ ใช้ `api()` อยู่แล้ว |
| ไฟล์อื่นๆ | ⚠️ ตรวจสอบทุกครั้งที่เพิ่ม fetch ใหม่ |

---

## ข้อควรจำ

1. **ทุกครั้งที่เรียก `fetch` จาก client-side → ใช้ `api()`**
2. `api()` ใช้ได้เฉพาะ browser (มี `window`) — server-side render ไม่ต้องใช้
3. ถ้าเพิ่ม API route ใหม่ อย่าลืมว่า client จะเรียกผ่าน `api('/api/...')`
4. ถ้าเปิด session ใหม่และต้องแก้ admin/fetch/Api → **อ่านไฟล์นี้ก่อน!**

---

_ถ้าไม่ทำตามนี้จะเสียเวลา Debug อีกหลายวัน_
