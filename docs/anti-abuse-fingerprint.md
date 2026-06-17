# 🛡️ SubZeed Anti-Abuse System: Browser Fingerprint Protection

## ปัญหา

ผู้ใช้สามารถเปลี่ยน Email มาสมัครใช้โควตาฟรี (15-20 นาที/เดือน) ซ้ำๆ โดยใช้ Browser เดิม ทำให้ระบบเสียรายได้จากแพ็กเกจ Basic-Premium

## วิธีการป้องกัน

ใช้ **Browser Fingerprinting** (`@fingerprintjs/fingerprintjs`) เพื่อระบุอุปกรณ์ที่เคยใช้โควตาฟรีไปแล้ว พร้อมระบบตรวจสอบทั้งฝั่ง Client และ Server

---

## สถาปัตยกรรม

```
Client (Browser)                              Server (Vercel / Supabase)
┌─────────────────────┐                     ┌─────────────────────────────┐
│                     │   POST /check       │  API Route:                │
│  useFingerprint()   │ ──────────────────► │  /api/fingerprint/check    │
│  (FingerprintJS)    │                     │                             │
│                     │ ◄────────────────── │ ตรวจสอบ fingerprint        │
│  ถ้า isAbuser=true  │   { isAbuser,       │ กับ Supabase DB            │
│  → ปิดปุ่มสมัคร     │     message }       │  ถ้าเคยมี → block           │
│                     │                     │                             │
│  ถ้า isAbuser=false │   POST /register    │  /api/fingerprint/register  │
│  → สมัครได้         │ ──────────────────► │  บันทึก fingerprint ใหม่     │
└─────────────────────┘                     └─────────────────────────────┘
                                                    │
                                                    ▼
                                           ┌────────────────┐
                                           │  Supabase DB   │
                                           │ ・profiles      │
                                           │ ・fingerprint   │
                                           │   _history     │
                                           └────────────────┘
```

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|------|--------|
| `supabase/migration_fingerprint.sql` | SQL Migration: เพิ่ม column + ตาราง history + RLS + trigger |
| `src/hooks/useFingerprint.ts` | React Hook สำหรับดึง Browser Fingerprint |
| `src/app/api/fingerprint/check/route.ts` | API ตรวจสอบ fingerprint ว่าซ้ำหรือไม่ |
| `src/app/api/fingerprint/register/route.ts` | API บันทึก fingerprint หลังสมัครสำเร็จ |
| `src/app/(auth)/signup/page.tsx` | Signup form ที่ integrate การตรวจสอบ |

---

## ขั้นตอนการทำงาน

### 1. Client-side: ดึง Browser Fingerprint

```ts
// hooks/useFingerprint.ts
import FingerprintJS from '@fingerprintjs/fingerprintjs';

const fp = await FingerprintJS.load();
const result = await fp.get();
const visitorId = result.visitorId; // เช่น "a1b2c3d4e5f6..."
```

### 2. สมัครสมาชิก — ตรวจสอบก่อน

```ts
// signup/page.tsx (ขั้นตอนก่อน submit)
const res = await fetch('/api/fingerprint/check', {
  method: 'POST',
  body: JSON.stringify({ fingerprint: visitorId, email }),
});
const data = await res.json();

if (data.isAbuser) {
  // ❌ ปิดการสมัคร + แสดง warning
  return;
}
// ✅ สมัครได้ปกติ
```

### 3. หลังสมัครสำเร็จ — บันทึก fingerprint

```ts
await fetch('/api/fingerprint/register', {
  method: 'POST',
  body: JSON.stringify({ fingerprint: visitorId, email, userId }),
});
```

### 4. Server-side: SQL Function ตรวจสอบ

```sql
SELECT * FROM check_fingerprint_abuse('a1b2c3...', 'uuid', 'email@example.com');
-- ถ้าเคยมี history → is_abuser = TRUE, quota โดน set เป็น 0 ทันที
```

---

## Database Schema (Migration)

```sql
-- profiles เพิ่ม 2 columns
ALTER TABLE profiles ADD COLUMN browser_fingerprint TEXT;
ALTER TABLE profiles ADD COLUMN is_quota_abuser BOOLEAN DEFAULT FALSE;

-- ตารางใหม่สำหรับ audit log
CREATE TABLE fingerprint_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id),
    email TEXT NOT NULL,
    action TEXT NOT NULL,        -- 'signup' | 'quota_claim'
    ip_address TEXT,
    blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ค่าใช้จ่าย

| รายการ | ค่าใช้จ่าย |
|--------|-----------|
| `@fingerprintjs/fingerprintjs` (Community) | **ฟรี** — ไม่จำกัด request |
| Supabase Storage | **0 บาท** (แค่ TEXT column ไม่กี่ byte) |
| API Route บน Vercel | **0 บาท** (Serverless Function, ใช้งานน้อย) |
| การโหลด JS Library | ~15 KB gzip (โหลดแค่ครั้งเดียว) |

---

## แนวทางต่อยอดในอนาคต

1. **Rate Limiting** — จำกัดจำนวนการเรียก `/api/fingerprint/check` ต่อ IP
2. **Admin Dashboard** — หน้าแอดมินดูรายชื่อ abuser พร้อมตัวปลดล็อก
3. **Email + IP Cooldown** — ถ้าเจอ abuser → block email domain + IP
4. **Stripe Integration** — ถ้าเคยจ่ายเงินมาก่อน → bypass fingerprint check
5. **Supabase Edge Function** — ย้าย logic การตรวจสอบไป Edge Function เพื่อ latency ต่ำ

---

## การ Deploy

1. รัน `supabase/migration_fingerprint.sql` ใน Supabase SQL Editor
2. ติดตั้ง FingerprintJS: `npm install @fingerprintjs/fingerprintjs`
3. ตั้งค่า `SUPABASE_SERVICE_ROLE_KEY` ใน Vercel Environment Variables
4. Deploy ผ่าน Vercel ปกติ

---

## ทดสอบ

```
1. เปิด Browser → สมัคร Free → ✅ สำเร็จ
2. logout → สมัครใหม่ด้วย Email อื่น → ❌ โดนบล็อก
3. เปลี่ยน Browser (Chrome → Safari) → สมัครใหม่ → ✅ สำเร็จ
4. เปิด Incognito → สมัครใหม่ → ❌ โดนบล็อก (Fingerprint เหมือนเดิม)
```
