# 🔐 Environment Variables — SubZeed

> วิธีตั้งค่า `.env.local` สำหรับรัน SubZeed
> คัดลอกค่าจากตรงนี้ไปใส่ไฟล์ `.env.local` ที่ root ของโปรเจกต์

---

## 1. ไฟล์ที่ต้องสร้าง

```
subzeed/
  ├── .env.local          # ค่าจริง (ไม่ commit)
  ├── .env.example        # template (commit ได้)
  └── docs/env-config.md  # เอกสารนี้
```

---

## 2. ตัวอย่าง .env.local

```bash
# ============================================================
# SubZeed — Environment Variables
# ============================================================

# ─── Supabase ──────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# ─── OpenAI (Whisper STT) ─────────────────────────────
OPENAI_API_KEY=sk-proj-xxxxx

# ─── Gemini (AI Vocabulary) ───────────────────────────
GEMINI_API_KEY=AIzaSyxxxxx

# ─── Stripe ───────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx

# Stripe Price IDs
STRIPE_PRICE_BASIC=price_xxxxx
STRIPE_PRICE_PREMIUM=price_xxxxx
STRIPE_PRICE_BUSINESS_STARTER=price_xxxxx
STRIPE_PRICE_BUSINESS_PRO=price_xxxxx

# ─── Site URL ─────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 3. วิธีได้ค่าแต่ละตัว

### Supabase

1. ไปที่ [supabase.com](https://supabase.com) → Project Settings → API
2. `NEXT_PUBLIC_SUPABASE_URL` = **Project URL** (เช่น `https://abc123.supabase.co`)
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` = **anon public key**
4. `SUPABASE_SERVICE_ROLE_KEY` = **service_role key** (ห้าม leak ไป client)

### OpenAI (Whisper)

1. ไปที่ [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. สร้าง Key → `OPENAI_API_KEY`

### Gemini (AI Vocabulary)

1. ไปที่ [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. สร้าง Key → `GEMINI_API_KEY`

### Stripe

1. ไปที่ [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. `STRIPE_SECRET_KEY` = **Secret key** (ขึ้นต้นด้วย `sk_`)
3. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = **Publishable key** (ขึ้นต้นด้วย `pk_`)
4. `STRIPE_WEBHOOK_SECRET` → Stripe Dashboard → Webhooks → Add endpoint → Signing secret
5. Price IDs → Stripe Dashboard → Products → Create product → Copy `price_xxx`

---

## 4. Stripe Price IDs

สร้าง Products และ Prices ใน Stripe Dashboard ก่อน:

```
Basic:          89.-/เดือน   →  price_basic_xxx
Premium:       169.-/เดือน   →  price_premium_xxx
Business Starter: 899.-/เดือน →  price_business_starter_xxx
Business Pro:  1,299.-/เดือน  →  price_business_pro_xxx
```

---

## 5. Vercel Deploy (Production)

ไปที่ Vercel Dashboard → Project → Settings → Environment Variables
ใส่ค่าชุดเดียวกัน **เปลี่ยนเฉพาะ**:
- `NEXT_PUBLIC_SITE_URL` → `https://subzeed.vercel.app` (หรือ domain จริง)
- Stripe keys → ใช้ `sk_live_` และ `whsec_live_`
- Stripe Price IDs → ใช้ `price_live_`

---

## 6. Dev Mode (ทดสอบโดยไม่ต้องมี Stripe)

ถ้า **ไม่ใส่** `STRIPE_SECRET_KEY`:
- ระบบจะทำงานใน Dev Mode
- กดซื้อแพ็กเกจ → อัปเดต DB ทันที (ไม่ต้องชำระเงินจริง)
- Stripe Webhook ไม่ทำงาน

---

## 7. ตรวจสอบว่า .env.local ถูกต้อง

```bash
# ดูว่ามี key ครบไหม
grep -E "^(NEXT_PUBLIC_SUPABASE_URL|OPENAI_API_KEY)" .env.local

# ถ้าต้องการเช็คทุกตัว
grep -E "^[A-Z_]+=" .env.local
```

---

_อัปเดตล่าสุด: รอบการพัฒนา STT Pipeline + Deploy Config_
