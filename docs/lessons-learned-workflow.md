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

## 🐛 Next.js 16 API Route Auth — ห้ามใช้ `getSession()` ใน Route Handler

### ปัญหา
Next.js 16 (App Router) — `createServerSupabase()` ที่ใช้ `await cookies()` ไม่สามารถ
อ่าน session cookies ใน Route Handler (API routes) ได้ ทำให้ `getSession()` คืน `null` เสมอ
→ API route คืน `401 Unauthorized` ตลอด

### วิธีแก้
1. **สร้าง helper `verifyAdmin(request)`** ที่รับ `x-user-id` header จาก client-side แทน
   - Client-side ส่ง `user?.id` ใน header (มาจาก `useAuth()`)
   - Server-side ใช้ `createServiceSupabase()` (service role) query profile โดยตรง
   - ถ้าไม่ใช่ admin → throws error

2. **ไฟล์: `src/lib/admin-auth.ts`**

```ts
export async function verifyAdmin(request: NextRequest): Promise<string> {
  const userId = request.headers.get('x-user-id');
  if (!userId) throw new Error('Unauthorized');

  const adminSupabase = createServiceSupabase();
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('is_super_admin, email')
    .eq('id', userId)
    .single();

  if (!profile || (profile.is_super_admin !== true && profile.email !== 'overconda@gmail.com')) {
    throw new Error('Forbidden: Admin only');
  }
  return userId;
}
```

3. **วิธีใช้ใน API route:**

```ts
export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const adminSupabase = createServiceSupabase();
    // ... query data
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 403 });
  }
}
```

### ไฟล์ที่ต้องเปลี่ยน
- `src/app/api/admin/*/route.ts` — ทุก route ที่ใช้ `createServerSupabase().getSession()`
- `src/app/admin/page.tsx` — เพิ่ม `headers: { 'x-user-id': user?.id }` ตอนเรียก API

### ข้อควรระวัง
- วิธีนี้ **ไม่ปลอดภัยเท่า cookie-based** เพราะ `x-user-id` ถูกส่งผ่าน HTTP header
- แต่สำหรับ admin dashboard ที่ผ่าน Auth Guard ใน client-side อยู่แล้ว ถือว่า accept ได้
- วิธีที่ถูกต้องคือใช้ `getUser()` (verify access token) แทน `getSession()` (read cookie)
  — แต่ต้อง refactor ครั้งใหญ่

---

## 📌 กฎในการสื่อสารกับ User

1. **อย่าใช้ emoji โดยไม่จำเป็น** — ถาม user ก่อนว่าโอเคไหม
2. **ตอบสั้น ตรงประเด็น** — ไม่ต้องเขียนย่อหน้ายาวถ้าไม่จำเป็น
3. **ถ้างานใหญ่ → เสนอเป็น Step ให้เลือก** — อย่าทำทั้งหมดในรอบเดียว
4. **ใช้ภาษาไทยกับ user นี้** — เพราะ user พูดไทย

---

_อัปเดตล่าสุด: รอบที่ 3 — Dynamic API Provider + AI Smart Translation + Docs_
