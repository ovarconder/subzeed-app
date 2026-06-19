# 🧠 Lessons Learned: Workflow Rules for SubZeed Development

> **ข้อกำหนดในการทำงานทุก Session** — อ่านก่อนเริ่มทำงานทุกครั้ง

---

## ⚠️ ปัญหาที่พบ: "ทำงานนานเกินไป" (Latency Trap)

### สาเหตุ
1. ** Batch requests มากเกินไป ** — การเรียก tools ทีละหลายๆ ตัวพร้อมกัน ทำให้ระบบช้าลงโดยไม่จำเป็น
2. ** รอ Async Task นาน ** — เช่น `npm install`, `brew install`, หรือการรันคำสั่งที่ใช้เวลานาน โดยไม่เช็คก่อนว่าจำเป็นไหม
3. ** ไม่ได้ดูสถานะปัจจุบันก่อนเริ่ม ** — เข้าไปดูว่าโปรเจกต์มีอะไรอยู่แล้วบ้าง ไม่งั้นจะสร้างซ้ำซ้อน
4. ** สร้างไฟล์ทีละไฟล์นานเกินไป ** — การใช้ `create_new_file` ทีละไฟล์ในการสร้างโครงสร้างใหญ่ อาจควบรวมหรือใช้ edit แทน

### วิธีป้องกัน (ต้องทำทุกครั้ง)
- ✅ **ตรวจสอบว่าโค้ด/ดีพเพนเดนซีที่มีอยู่แล้วคืออะไร** ก่อนเริ่ม — ใช้ `ls`, `read_file`
- ✅ **ใช้ `create_new_file` สำหรับไฟล์ใหม่ที่ไม่เคยมี** — แต่รวมหลายไฟล์ในรอบเดียวถ้าเป็นไปได้
- ✅ **ไม่รันคำสั่งที่ต้องติดตั้งโดยไม่ถาม user ก่อน**
- ✅ **ใช้ `edit_existing_file` หรือ `single_find_and_replace`** สำหรับแก้ไขไฟล์ที่มีอยู่
- ✅ **เมื่อรู้สึกว่านาน → หยุด → ดูว่าติดขัดอะไร → แก้ไข → ดำเนินการต่อ**

---

## 📋 Checklist ก่อนเริ่ม Session ใหม่

- [ ] อ่าน `docs/subzeed-blueprint.md` — ทำความเข้าใจ Big Picture
- [ ] อ่าน `docs/anti-abuse-fingerprint.md` — ทำความเข้าใจระบบ Anti-Abuse
- [ ] อ่าน `docs/lessons-learned-workflow.md` — บทเรียน (ไฟล์นี้)
- [ ] เรียก `ls` ดูโครงสร้างไฟล์ที่มีอยู่แล้ว
- [ ] ตรวจสอบว่า `node_modules` และ `.env.local` มีอยู่หรือไม่
- [ ] ตรวจสอบว่า Supabase schema รันไปยัง belum

---

## 🧩 สถานะปัจจุบันของแต่ละระบบ

| Component | Status | หมายเหตุ |
|-----------|--------|----------|
| Next.js App Router | ✅ Setup แล้ว | `src/app/` |
| Tailwind v4 | ✅ Setup แล้ว | `globals.css` |
| Supabase Client/Server | ✅ Setup แล้ว | `src/lib/supabase/` |
| Zustand Store | ✅ Setup แล้ว | `src/lib/store/` |
| Auth (Login/Signup) | ✅ พร้อม | Fingerprint protection integrated |
| Dashboard | ✅ พร้อม | แสดง quota bar + projects grid |
| Studio (Video Editor) | ✅ พร้อม | Drag-drop video + subtitle overlay |
| Billing History | ✅ พร้อม | `src/app/billing/` |
| Client Review | ✅ พร้อม | `src/app/review/[token]/` |
| Stripe Payment | ✅ พร้อม | Checkout + Webhook + Dev Mode — `docs/payment-stripe.md` |
| Whisper API | ✅ พร้อม | `src/app/api/transcribe/` |
| Gemini API | ✅ พร้อม | `src/app/api/gemini-vocab/` |
| Fingerprint Anti-Abuse | ✅ พร้อม | Migration + Routes + Hook |
| SQL Schema | ✅ พร้อม | `supabase/` |
| Admin Dashboard | ✅ พร้อม | 4 tabs + 5 API routes — `docs/admin-dashboard.md` |
| Invoice PDF Gen | ✅ พร้อม | Client-side jspdf + Server fallback HTML — `docs/invoice-pdf.md` |
| **FingerprintJS Library** | ⏳ **ยังไม่ติดตั้ง** | ต้อง `npm install @fingerprintjs/fingerprintjs` |
| **Env Config (.env.local)** | ⏳ **ยังไม่มี** | ดู `docs/env-config.md` |
| **Watermark on Free** | ✅ พร้อม | Canvas overlay บนวิดีโอ |
| **Text Animation (Premium)** | ✅ พร้อม | typewriter · slide · highlight |
| **Audio Extraction** | ✅ พร้อม | `src/lib/audio-extractor.ts` — Client-side WAV 16kHz |
| **Thai STT Pipeline** | ✅ พร้อม | `transcribe` + `transcribe-and-save` — Quota check + หักอัตโนมัติ |
| **SRT/VTT Export** | ✅ พร้อม | Export JSON → SRT |
| **Vercel Deploy Config** | ✅ พร้อม | `vercel.json` + `docs/env-config.md` |

---

## 🔧 คำสั่งที่ใช้บ่อย

```bash
# Dev
npm run dev

# Build
npm run build

# Install deps
npm install @fingerprintjs/fingerprintjs

# Deploy to Vercel
vercel --prod
```

---

## 📌 กฎในการสื่อสารกับ User

1. **อย่าใช้ emoji โดยไม่จำเป็น** — ถาม user ก่อนว่าโอเคไหม
2. **ตอบสั้น ตรงประเด็น** — ไม่ต้องเขียนย่อหน้ายาวถ้าไม่จำเป็น
3. **ถ้างานใหญ่ → เสนอเป็น Step ให้เลือก** — อย่าทำทั้งหมดในรอบเดียว
4. **ใช้ภาษาไทยกับ user นี้** — เพราะ user พูดไทย

---

_อัปเดตล่าสุด: รอบที่ 2 — STT Pipeline + Watermark + Text Animation + Deploy Config_
