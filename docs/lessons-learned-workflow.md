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
- [ ] อ่าน `docs/dynamic-api-providers.md` — ระบบ Dynamic API Config
- [ ] อ่าน `docs/ai-smart-translation.md` — ระบบ AI แปลภาษา
- [ ] อ่าน `docs/lessons-learned-workflow.md` — บทเรียน (ไฟล์นี้)
- [ ] เรียก `ls` ดูโครงสร้างไฟล์ที่มีอยู่แล้ว
- [ ] ตรวจสอบว่า `node_modules` และ `.env.local` มีอยู่หรือไม่
- [ ] ตรวจสอบว่า `nvm` พร้อมใช้ (ถ้าใช้ Terminal VSCode ต้องรัน `nvm use` ก่อน)
- [ ] ตรวจสอบว่า Supabase schema รันไปถึงไหนแล้ว

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
| Gemini API | ✅ พร้อม | `src/app/api/gemini-vocab/` — รองรับทั้ง Vocab + Translation |
| Fingerprint Anti-Abuse | ✅ พร้อม | Migration + Routes + Hook |
| SQL Schema | ✅ พร้อม | `supabase/` — 5 migration files |
| Admin Dashboard | ✅ พร้อม | 5 tabs + User/Abuser/Billing/Fingerprint/Settings/API Config + Reports — `docs/admin-dashboard.md` |
| Invoice PDF Gen | ✅ พร้อม | Client-side jspdf + Server fallback HTML — `docs/invoice-pdf.md` |
| **FingerprintJS Library** | ⏳ **ยังไม่ติดตั้ง** | ต้อง `npm install @fingerprintjs/fingerprintjs` |
| **Env Config (.env.local)** | ⏳ **ยังไม่มี** | ดู `docs/env-config.md` |
| **Watermark on Free** | ✅ พร้อม | Canvas overlay บนวิดีโอ |
| **Text Animation (Premium)** | ✅ พร้อม | typewriter · slide · highlight |
| **Audio Extraction** | ✅ พร้อม | `src/lib/audio-extractor.ts` — Client-side WAV 16kHz |
| **Thai STT Pipeline** | ✅ พร้อม | `transcribe` + `transcribe-and-save` — Quota check + หักอัตโนมัติ |
| **SRT/VTT Export** | ✅ พร้อม | Export JSON → SRT |
| **Vercel Deploy Config** | ✅ พร้อม | `vercel.json` + `docs/env-config.md` |
| **Dynamic API Provider** | ✅ พร้อม | `docs/dynamic-api-providers.md` — Admin เปลี่ยน Provider/Key ได้ผ่าน UI |
| **AI Smart Translation** | ✅ พร้อม | `docs/ai-smart-translation.md` — แปลซับเป็น 10 ภาษาผ่าน Gemini |
| **Studio VTT Overlay** | ✅ Stable | `docs/studio-vtt-overlay.md` — WebVTT native track + DOM API inject |
| **Session Tracking** | 📋 Planned | `docs/session-tracking.md` — ระบบเซฟ draft + Alert session expired |

---

## 🔧 คำสั่งที่ใช้บ่อย

```bash
# ใช้ nvm ก่อนทุกครั้ง (VSCode ต้องรันก่อน)
nvm use

# Dev
npm run dev

# Build (ถ้า nvm ยังไม่โหลด ให้รัน nvm use ก่อน)
npm run build

# Install deps
npm install

# Deploy to Vercel
npx vercel --prod
```

---

## ⚡ ข้อควรรู้สำหรับ VSCode Terminal

VSCode Terminal เวอร์ชั่นล่าสุด **ไม่สามารถใช้ npm โดยตรง** ต้องรัน `nvm use` ก่อนทุกครั้งที่เปิด Terminal ใหม่:

```bash
# ตอนเปิด Terminal ครั้งแรก
nvm use
# → Now using node v20.x.x

# แล้วค่อยใช้ npm
npm run dev
```

---

## 📌 กฎในการสื่อสารกับ User

1. **อย่าใช้ emoji โดยไม่จำเป็น** — ถาม user ก่อนว่าโอเคไหม
2. **ตอบสั้น ตรงประเด็น** — ไม่ต้องเขียนย่อหน้ายาวถ้าไม่จำเป็น
3. **ถ้างานใหญ่ → เสนอเป็น Step ให้เลือก** — อย่าทำทั้งหมดในรอบเดียว
4. **ใช้ภาษาไทยกับ user นี้** — เพราะ user พูดไทย

---

_อัปเดตล่าสุด: รอบที่ 3 — Dynamic API Provider + AI Smart Translation + Docs_
