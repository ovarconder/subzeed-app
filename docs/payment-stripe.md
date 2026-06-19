# 💳 Stripe Payment Integration — SubZeed

> ระบบชำระเงินผ่าน Stripe Checkout + Webhook
> รองรับทั้ง Production (Stripe จริง) และ Dev Mode (อัปเดตทันที)

---

## 1. สถาปัตยกรรม (Architecture)

```
User (Browser)
    │
    ├── 1. กด "สมัครแพ็กเกจ" ที่หน้า /pricing
    │   └── POST /api/create-checkout { tier: "premium" }
    │       │
    │       ├── [Dev Mode]  → อัปเดต DB ทันที → redirect /dashboard?checkout=success
    │       └── [Production] → สร้าง Stripe Checkout Session → redirect ไป Stripe
    │
    ├── 2. [Production] ชำระเงินที่ Stripe สำเร็จ
    │   └── Stripe ส่ง Webhook → POST /api/webhooks/stripe
    │       └── verify signature → อัปเดต tier/quota → บันทึก billing history
    │
    └── 3. กลับมาที่ /dashboard?checkout=success
        └── (สามารถ refresh profile เพื่อดู tier ใหม่)
```

### โหมดการทำงาน 2 โหมด

| โหมด | เงื่อนไข | การทำงาน |
|------|---------|----------|
| **Dev Mode** | ไม่มี `STRIPE_SECRET_KEY` | อัปเดต tier ใน DB ทันที ไม่ต้องชำระเงินจริง |
| **Production** | มี `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | สร้าง Stripe Checkout + รอ Webhook ยืนยัน |

---

## 2. Environment Variables

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_xxxxx          # จาก Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_xxxxx        # จาก Stripe Webhooks settings
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx

# Stripe Price IDs (สร้างจาก Stripe Dashboard → Products)
STRIPE_PRICE_BASIC=price_xxxxx
STRIPE_PRICE_PREMIUM=price_xxxxx
STRIPE_PRICE_BUSINESS_STARTER=price_xxxxx
STRIPE_PRICE_BUSINESS_PRO=price_xxxxx
```

---

## 3. Stripe Products & Prices

ต้องสร้าง Products และ Prices ใน Stripe Dashboard ก่อน:
1. Stripe Dashboard → Products → Add Product
2. ตั้งชื่อให้ตรงกับ Tier (Basic, Premium, Business Starter, Business Pro)
3. ตั้ง Price เป็น One-time (mode: payment) — ใช้ **Anniversary Billing** (ต่ออายุเมื่อลูกค้ากดซ้ำ)
4. คัดลอก Price ID (ขึ้นต้นด้วย `price_`) ใส่ใน `.env.local`

---

## 4. API Reference

### 4.1 `POST /api/create-checkout`

สร้าง Stripe Checkout Session เพื่อให้ลูกค้าชำระเงิน

**Request Body:**
```json
{
  "tier": "premium"
}
```

**Response (Production):**
```json
{
  "url": "https://checkout.stripe.com/c/pay_xxxxx"
}
```

**Response (Dev Mode):**
```json
{
  "url": "/dashboard?checkout=success&tier=premium",
  "devMode": true
}
```

**Response (Error):**
```json
{
  "error": "กรุณาเข้าสู่ระบบก่อนสั่งซื้อ"
}
```

**Code Logic:**
```typescript
// src/app/api/create-checkout/route.ts
export async function POST(request: NextRequest) {
  // 1. ตรวจสอบ auth (ต้อง login)
  // 2. ตรวจสอบ tier ว่าถูกต้อง
  // 3. ถ้าไม่มี STRIPE_SECRET_KEY → Dev Mode (อัปเดต DB ทันที)
  // 4. ถ้ามี → สร้าง Stripe Checkout Session
  //    - line_items: priceId (จาก env)
  //    - client_reference_id: userId
  //    - metadata: { tier, userId }
  //    - success_url: /dashboard?checkout=success
  //    - cancel_url: /pricing?checkout=cancelled
  // 5. คืน { url } → redirect ไป Stripe
}
```

### 4.2 `POST /api/webhooks/stripe`

รับ Webhook จาก Stripe เมื่อชำระเงินสำเร็จ

**Events ที่รับ:**
| Event | การทำงาน |
|-------|---------|
| `checkout.session.completed` | ✅ อัปเดต tier + quota + บันทึก billing history |
| `customer.subscription.updated` | 📝 Log (ยังไม่ implement) |
| `customer.subscription.deleted` | 📝 Log (ยังไม่ implement) |
| `checkout.session.expired` | 📝 Log เฉยๆ |

**Code Logic (checkout.session.completed):**
```typescript
// 1. Verify signature (ถ้ามี webhook secret)
// 2. ดึง userId จาก client_reference_id หรือ metadata.userId
// 3. อัปเดต profiles:
//    - tier, quota_minutes_total (ตาม TIER_CONFIGS)
//    - quota_minutes_used = 0 (รีเซ็ต)
//    - billing_cycle_start = now
//    - billing_cycle_end = now + 30 days
// 4. บันทึก billing_history:
//    - action_type: 'subscribe'
//    - previous_tier: tier เก่า
//    - new_tier: tier ใหม่
//    - invoice_number: INV-{timestamp}-{random}
// 5. บันทึก quota_activity_logs
```

**Stripe Dashboard Setup:**
```
Products → Prices → price_xxx

Webhooks → Add endpoint:
  URL: https://[domain]/api/webhooks/stripe
  Events: checkout.session.completed
  Secret: whsec_xxx → ใส่ใน STRIPE_WEBHOOK_SECRET
```

---

## 5. หน้า Pricing (User Interface)

### `src/app/pricing/page.tsx`

| Feature | รายละเอียด |
|---------|-----------|
| แสดงแพ็กเกจทั้ง 5 Tier | Free, Basic, Premium, Business Starter, Business Pro |
| แสดงสถานะปัจจุบัน | Highlight แพ็กเกจที่ใช้อยู่ + badge "ปัจจุบัน" |
| ปุ่มสมัคร | เรียก `POST /api/create-checkout` |
| Dev Mode badge | แจ้งเตือนว่ากำลังใช้โหมดทดสอบ |
| Checkout cancelled | แสดง warning ถ้ากลับจากการยกเลิก Stripe |
| Loading state | แต่ละปุ่มมี loading spinner แยกกัน |

### ตัวอย่างการเรียกใช้

```tsx
const handleSubscribe = async (tier: SubscriptionTier) => {
  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  const data = await res.json();

  if (data.devMode) {
    // Dev Mode — อัปเดตทันที
    await refreshProfile();
    router.push(data.url);
  } else if (data.url) {
    // Production — redirect ไป Stripe
    window.location.href = data.url;
  }
};
```

---

## 6. การทดสอบ

### ทดสอบ Dev Mode (ไม่ต้องใช้เงินจริง)

1. ตั้งค่า `.env.local` โดย **ไม่ต้องใส่** `STRIPE_SECRET_KEY`
2. เปิดหน้า `/pricing`
3. กด "สมัครแพ็กเกจ" → ระบบจะอัปเดต tier ทันที
4. ไป `/dashboard` หรือ `/billing` เพื่อดูผลลัพธ์

### ทดสอบ Production (ใช้ Stripe Test Mode)

1. เปิด Stripe Dashboard → Turn on "Test mode"
2. คัดลอก `sk_test_xxx` และ `whsec_test_xxx`
3. สร้าง Products + Prices ใน Test mode
4. กดสมัคร → ระบบจะ redirect ไปหน้า Stripe Test
5. ใช้บัตรทดสอบ: `4242 4242 4242 4242` / วันหมดอายุในอนาคต / CVC ใดๆ

---

## 7. การ Deploy

### Stripe Webhook สำหรับ Production

1. Deploy ไป Vercel ก่อน
2. ไป Stripe Dashboard → Webhooks → Add endpoint
3. ใส่ URL: `https://your-domain.vercel.app/api/webhooks/stripe`
4. เลือก Events: `checkout.session.completed`
5. คัดลอก Signing secret → ใส่ใน `STRIPE_WEBHOOK_SECRET` ของ Vercel

### Vercel Environment Variables

```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_BASIC=price_live_xxx
STRIPE_PRICE_PREMIUM=price_live_xxx
STRIPE_PRICE_BUSINESS_STARTER=price_live_xxx
STRIPE_PRICE_BUSINESS_PRO=price_live_xxx
```

---

## 8. Security Notes

- Stripe Webhook ใช้ signature verification ป้องกันปลอมแปลง
- ไม่มี API key รั่วไหลไปยัง Client-side
- `createServiceSupabase()` ใช้ Service Role Key — เรียกจาก Server เท่านั้น
- `client_reference_id` และ `metadata.userId` ใช้ยืนยันตัวตนผู้ใช้ใน Webhook

---

_อัปเดตล่าสุด: รอบการพัฒนา SubZeed Admin + Payment_
