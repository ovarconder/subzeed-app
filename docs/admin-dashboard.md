# 🛠️ Admin Dashboard — SubZeed

> เส้นทาง: `/admin`
> สิทธิ์เข้าถึง: ผู้ใช้ที่มี `tier = 'business_pro'` หรือ `email = 'admin@subzeed.com'`

---

## 1. ภาพรวม (Overview)

Admin Dashboard เป็นหน้าสำหรับจัดการระบบทั้งหมด ประกอบด้วย 4 แท็บหลัก:

| แท็บ | เส้นทาง API | รายละเอียด |
|------|-------------|------------|
| 👥 ผู้ใช้ | `GET /api/admin/users` | ดูผู้ใช้ทั้งหมด, tier, โควตา, สถานะ abuser |
| 🚫 Abuser | `GET /api/admin/users?abusers=true` | กรองเฉพาะคนที่ถูกบล็อก |
| 💰 ธุรกรรม | `GET /api/admin/billing` | ดู billing history ทั้งหมด |
| 🖐️ Fingerprint | `GET /api/admin/fingerprints` | ดูประวัติ fingerprint + สถานะ block |

---

## 2. โครงสร้างไฟล์

```
src/
├── app/
│   └── admin/
│       └── page.tsx              # หน้า Admin Dashboard UI
└── api/
    └── admin/
        ├── users/
        │   └── route.ts          # GET - ดึงข้อมูลผู้ใช้ทั้งหมด
        ├── billing/
        │   └── route.ts          # GET - ดึงประวัติธุรกรรม
        ├── fingerprints/
        │   └── route.ts          # GET - ดึง fingerprint history
        ├── update-tier/
        │   └── route.ts          # POST - อัปเดต Tier ผู้ใช้
        └── unblock/
            └── route.ts          # POST - ปลดล็อก abuser
```

---

## 3. API Reference

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
      "quota_minutes_total": 20,
      "quota_minutes_used": 5.5,
      "is_quota_abuser": false,
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

### 3.4 `POST /api/admin/update-tier`

อัปเดต Tier และโควตาของผู้ใช้

**Request Body:**
```json
{
  "userId": "uuid",
  "tier": "premium"
}
```

**Logic ที่ทำงาน:**
1. ตรวจสอบสิทธิ์ Admin (ต้อง business_pro)
2. ตรวจสอบ `tier` ว่าเป็นค่าที่ถูกต้อง
3. อัปเดต `tier`, `quota_minutes_total`, รีเซ็ต `quota_minutes_used = 0`
4. ตั้งรอบบิลใหม่ (start = now, end = now + 30 วัน)
5. บันทึก `billing_history` ด้วย `action_type = 'subscribe'`

> ⚠️ **ข้อควรระวัง**: การอัปเดต Tier จะรีเซ็ต `quota_minutes_used = 0` ทันที

### 3.5 `POST /api/admin/unblock`

ปลดล็อกผู้ใช้ที่ถูกแปะ `is_quota_abuser = true`

**Request Body:**
```json
{
  "userId": "uuid"
}
```

**Logic ที่ทำงาน:**
1. ตรวจสอบสิทธิ์ Admin
2. ดึงข้อมูลผู้ใช้ปัจจุบัน
3. รีเซ็ต `is_quota_abuser = false`
4. รีเซ็ตโควตาตาม Tier ปัจจุบัน
5. อัปเดต `fingerprint_history` — เปลี่ยน `blocked = false`
6. บันทึก `quota_activity_logs`

---

## 4. UI Components

### ปุ่ม ADMIN ใน Navbar

```tsx
// src/components/layout/navbar.tsx
{profile?.tier === 'business_pro' && (
  <Link href="/admin" className="...">
    ADMIN
  </Link>
)}
```

### Stat Card

```tsx
<StatCard label="ผู้ใช้ทั้งหมด" value={users.length.toString()} color="text-primary" />
```

### ตารางผู้ใช้
- แสดงอีเมล, Tier badge, Quota bar, Abuser status, Billing cycle
- มี select dropdown สำหรับเปลี่ยน Tier
- มีปุ่มปลดล็อกสำหรับ abuser

---

## 5. การทดสอบ

### ทดสอบใน Dev Mode (ไม่ต้องเป็น business_pro)

ถ้าต้องการ bypass สิทธิ์ Admin เพื่อทดสอบ:

```js
// เปิด Console ในเบราว์เซอร์ แล้วรัน:
localStorage.setItem('admin_bypass', 'true');
```

> ⚠️ ใช้สำหรับ Dev เท่านั้น ห้ามใช้ใน Production

### วิธีสร้างผู้ใช้ Admin

1. ไปที่ Supabase Dashboard → Table Editor → `profiles`
2. แก้ไข `tier` ของผู้ใช้ที่ต้องการเป็น `business_pro`
3. รีเฟรชหน้า → จะเห็นปุ่ม ADMIN ที่ Navbar

---

## 6. Security Notes

- API Route ทุกเส้นใช้ **Service Role Key** (bypass RLS)
- มี Auth check ก่อนทุก request — ถ้าไม่ใช่ admin จะคืน `403 Forbidden`
- ใน Production ควรเปลี่ยนจากการ hardcode email `admin@subzeed.com` เป็น role-based system

---

_อัปเดตล่าสุด: รอบการพัฒนา SubZeed Admin + Payment_
