# 🛠️ Admin Dashboard — SubZeed

> เส้นทาง: `/admin`
> สิทธิ์เข้าถึง: ผู้ใช้ที่มี `is_super_admin = true` หรือ `email = 'overconda@gmail.com'`

---

## 1. ภาพรวม (Overview)

Admin Dashboard เป็นหน้าสำหรับจัดการระบบทั้งหมด ประกอบด้วย 7 แท็บหลัก:

| แท็บ | เส้นทาง API | รายละเอียด |
|------|-------------|------------|
| 👥 ผู้ใช้ | `GET /api/admin/users` | ดูผู้ใช้ทั้งหมด, tier, โควตา, สถานะ abuser |
| 🚫 Abuser | `GET /api/admin/users?abusers=true` | กรองเฉพาะคนที่ถูกแปะ `is_quota_abuser` |
| 💰 ธุรกรรม | `GET /api/admin/billing` | ดู billing history ทั้งหมด |
| 🖐️ Fingerprint | `GET /api/admin/fingerprints` | ดูประวัติ fingerprint + สถานะ block |
| 📊 รายงาน | `<Reports />` | Component Reports |
| ⚙️ ตั้งค่าเว็บ | `<SiteSettings />` | Site Config |
| 🎛️ ตั้งค่า API | `<ApiConfig />` | Dynamic API Provider Config |

---

## 2. โครงสร้างไฟล์

```
src/
├── app/
│   └── admin/
│       └── page.tsx              # หน้า Admin Dashboard UI (client component)
│   └── api/
│       └── admin/
│           ├── users/
│           │   └── route.ts          # GET — ดึงข้อมูลผู้ใช้ทั้งหมด
│           │   └── update-tier/
│           │       └── route.ts      # POST — อัปเดต Tier ผู้ใช้
│           │   └── unblock/
│           │       └── route.ts      # POST — ปลดล็อก abuser
│           ├── billing/
│           │   └── route.ts          # GET — ดึงประวัติธุรกรรม
│           ├── fingerprints/
│           │   └── route.ts          # GET — ดึง fingerprint history
│           └── api-config/
│               └── route.ts          # GET / PUT — ตั้งค่า API Provider
└── components/
    └── admin/
        ├── UsersTable.tsx
        ├── BillingTable.tsx
        ├── FingerprintsTable.tsx
        ├── SiteSettings.tsx
        ├── ApiConfig.tsx
        └── Reports.tsx
```

---

## 3. API Reference

> ⚠️ **Auth Pattern**: Admin API routes ทั้งหมดใช้ `verifyAdmin(request)` helper แทน
> `createServerSupabase().getSession()` เพราะ Next.js 16 Route Handler ไม่สามารถ
> อ่าน cookies จาก `next/headers` ได้โดยตรง ดู `src/lib/admin-auth.ts`
>
> **Client-side** ส่ง `x-user-id` header ไปทุก request (มาจาก `user?.id` ของ Auth Provider)

### 3.1 `GET /api/admin/users`

ดึงรายชื่อผู้ใช้ทั้งหมด (ใช้ Service Role bypass RLS)

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `abusers` | `boolean` | ถ้า `true` กรองเฉพาะคนที่ `is_quota_abuser = true` |

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "tier": "free",
      "is_super_admin": false,
      "is_quota_abuser": false,
      "quota_minutes_total": 20,
      "quota_minutes_used": 5.5,
      "billing_cycle_start": "2025-01-01T00:00:00Z",
      "billing_cycle_end": "2025-01-31T00:00:00Z"
    }
  ]
}
```

### 3.2 `GET /api/admin/billing`

ดึงประวัติธุรกรรม 100 รายการล่าสุด

**Response:**
```json
{
  "history": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action_type": "subscribe",
      "previous_tier": "free",
      "new_tier": "premium",
      "amount_thb": 169,
      "invoice_number": "INV-1712345678-ABCD",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### 3.3 `GET /api/admin/fingerprints`

ดึงประวัติ Browser Fingerprint 200 รายการล่าสุด

**Response:**
```json
{
  "records": [
    {
      "id": "uuid",
      "fingerprint": "abc123...",
      "user_id": "uuid",
      "email": "user@example.com",
      "action": "signup",
      "ip_address": "203.0.113.1",
      "blocked": false,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### 3.4 `POST /api/admin/users/update-tier`

อัปเดต Tier และโควตาของผู้ใช้ (ใช้ Service Role)

**Request Body:**
```json
{
  "userId": "uuid",
  "tier": "premium"
}
```

**Logic ที่ทำงาน:**
1. ตรวจสอบสิทธิ์ Admin (`is_super_admin` หรือ `email === 'overconda@gmail.com'`)
2. ตรวจสอบ `tier` ว่าเป็นค่าที่ถูกต้อง (`free`, `basic`, `premium`, `business_starter`, `business_pro`)
3. อัปเดต `tier`, `quota_minutes_total` (ตาม tier map)
4. ตั้ง `updated_at = now()`

### 3.5 `POST /api/admin/users/unblock`

ปลดล็อกผู้ใช้ที่ถูกแปะ `is_quota_abuser = true`

**Request Body:**
```json
{
  "userId": "uuid"
}
```

**Logic ที่ทำงาน:**
1. ตรวจสอบสิทธิ์ Admin
2. อัปเดต `is_quota_abuser = false`

---

## 4. UI Components

### Stat Cards (3 ใบ)

```tsx
<StatCard label="ผู้ใช้งานทั้งหมด" value={`${stats.totalUsers} คน`} color="text-primary" />
<StatCard label="ออนไลน์วันนี้" value={`${stats.activeToday} คน`} color="text-success" />
<StatCard label="รายได้รวม (ประมาณ)" value={`฿${stats.totalRevenue?.toLocaleString()}`} color="text-warning" />
```

ดึงจาก RPC `get_admin_stats` (fallback: query profiles โดยตรง)

### ตารางผู้ใช้
- แสดงอีเมล, Tier badge, Quota bar, Abuser status, Billing cycle
- มี select dropdown สำหรับเปลี่ยน Tier
- มีปุ่มปลดล็อกสำหรับ abuser

---

## 5. Lessons Learned

### ปัญหาที่แก้แล้ว

1. **Stats เป็น 0 ตลอด** — RPC `get_admin_stats` ไม่มีใน DB → migration 006 + สร้าง API route `/api/admin/stats` query ตรง
2. **ดูข้อมูลคนอื่นไม่ได้** — ใช้ client-side Supabase (anon key + RLS) → เปลี่ยนเป็น API route (service role)
3. **`is_blocked` filter** — field นี้ไม่มีใน profiles → ใช้ `is_quota_abuser` แทน
4. **`is_super_admin` ไม่ถูก set** — migration 006: `UPDATE profiles SET is_super_admin = TRUE WHERE email = 'overconda@gmail.com'`
5. **Fingerprint tab error** — reference `user_fingerprints` (ไม่มี) → แก้ migration เป็น `fingerprint_history`
6. **fetchData ใช้ undefined function** — `fetchFromApi` ไม่มีอยู่ → เปลี่ยนเป็น `apiGet`
7. **Update/Unblock ใช้ client-side** → RLS บล็อก → เปลี่ยนเป็น API route `POST /api/admin/users/update-tier` และ `POST /api/admin/users/unblock`
8. **Stats แสดง undefined** — RPC `get_admin_stats` ยังไม่มี → เปลี่ยนใช้ API route `/api/admin/stats`
9. **getSession() ใน API Route ไม่ทำงาน (Next.js 16)** — `createServerSupabase().getSession()` ได้ session เป็น null เสมอ → เปลี่ยนเป็น `verifyAdmin(request)` helper ที่รับ `x-user-id` header จาก client-side

### กฎสำคัญ
- ✅ **ห้ามใช้ client-side Supabase ใน admin pages** — ใช้ API route + service role เสมอ
- ✅ **เพิ่ม `is_super_admin` ใน DB ก่อน** — admin guard ใช้ field นี้ ไม่ใช่ hardcode email
- ✅ **field `is_quota_abuser`** ต้องมีใน `Profile` type (DB + `src/lib/types.ts`)

---

## 6. การตั้งค่า Admin คนแรก

1. รัน `supabase/006_admin_stats_and_fields.sql` ใน Supabase SQL Editor
2. หรือรันด้วยมือ:
```sql
UPDATE profiles SET is_super_admin = TRUE WHERE email = 'อีเมลคุณ';
```
3. รีเฟรชหน้า Admin → stats จะแสดงค่าจริง

---

## 7. Security Notes

- API Route ทุกเส้นใช้ **Service Role Key** (bypass RLS)
- มี Auth check ก่อนทุก request — ตรวจสอบ `is_super_admin` + email fallback
- ไม่มี `admin_bypass` localStorage (เอาออกแล้ว)

---

_อัปเดตล่าสุด: Migration 006 — แก้ bugs admin dashboard ครั้งใหญ่_
