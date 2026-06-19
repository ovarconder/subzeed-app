# 📄 Invoice PDF Generator — SubZeed

> ระบบสร้างใบเสร็จรับเงิน / ใบกำกับภาษีแบบ PDF
> ทำงานฝั่ง Client (Browser) เพื่อลดค่าใช้จ่ายเซิร์ฟเวอร์

---

## 1. สถาปัตยกรรม (Architecture)

```
Client (Browser)
    │
    ├── วิธีที่ 1: Client-side PDF (Primary)
    │   ├── fetch /api/invoice/[id] → profile + billing data
    │   └── jspdf สร้าง PDF → downloadInvoice() → บันทึกไฟล์
    │
    └── วิธีที่ 2: Server-side HTML → Print to PDF (Fallback)
        └── window.open(/api/invoice/[id]/download)
            └── HTML invoice + window.print() → Save as PDF
```

### ทำไมต้อง Client-side?

- สอดคล้องกับนโยบาย **Client-side Rendering** ของโปรเจกต์
- **ประหยัดค่าเซิร์ฟเวอร์** — ไม่ต้องใช้ CPU/time สำหรับ gen PDF
- ใช้งานได้ทันที ไม่ต้องรอ Serverless function warm-up

---

## 2. โครงสร้างไฟล์

```
src/
├── lib/
│   └── invoice.ts                    # ไลบรารี gen PDF (jspdf)
└── app/
    └── api/
        └── invoice/
            ├── [id]/
            │   ├── route.ts          # GET - ดึงข้อมูล billing + profile
            │   └── download/
            │       └── route.ts      # GET - Server fallback (HTML → print to PDF)
```

---

## 3. Library ที่ใช้

| Library | เวอร์ชัน | ใช้ทำอะไร |
|---------|---------|-----------|
| `jspdf` | ^2.5.2 | สร้าง PDF Document ฝั่ง Browser |
| `jspdf-autotable` | ^3.8.4 | สร้างตารางสวยงามใน PDF |

```bash
npm install jspdf jspdf-autotable
```

---

## 4. API Reference

### 4.1 `GET /api/invoice/[id]`

ดึงข้อมูลสำหรับสร้าง PDF (Client-side)

**Response:**
```json
{
  "profile": {
    "email": "user@example.com",
    "phone_number": "0812345678",
    "tier": "premium",
    "quota_minutes_total": 300,
    "quota_minutes_used": 120,
    "billing_cycle_start": "2025-01-01T00:00:00Z",
    "billing_cycle_end": "2025-01-31T00:00:00Z"
  },
  "billing": {
    "id": "uuid",
    "action_type": "subscribe",
    "previous_tier": "free",
    "new_tier": "premium",
    "amount_thb": 169,
    "invoice_number": "INV-1712345678-ABCD",
    "created_at": "2025-01-15T10:30:00Z"
  },
  "companyInfo": {
    "name": "บริษัท ซับซี๊ด จำกัด",
    "address": "เลขที่ 123/45 ...",
    "taxId": "0123456789012",
    "phone": "02-123-4567",
    "email": "billing@subzeed.com"
  }
}
```

### 4.2 `GET /api/invoice/[id]/download`

Server fallback — คืน HTML Invoice สวยงาม ให้ Browser print-to-PDF

---

## 5. Invoice PDF Generator (`src/lib/invoice.ts`)

### ฟังก์ชันหลัก

```typescript
/**
 * สร้าง PDF ใบเสร็จรับเงิน
 * @param profile - ข้อมูลผู้ใช้ (เจ้าของบิล)
 * @param billing - ข้อมูล billing history
 * @param hasVat - ถ้า true → แสดง VAT 7% (ใบกำกับภาษี)
 * @returns Blob ของ PDF
 */
async function generateReceiptPDF(
  profile: Profile,
  billing: BillingHistory,
  hasVat: boolean = false
): Promise<Blob>

/**
 * ดาวน์โหลด PDF อัตโนมัติ
 */
function downloadInvoice(blob: Blob, filename: string): void
```

### ตัวอย่างการเรียกใช้

```typescript
import { generateReceiptPDF, downloadInvoice } from '@/lib/invoice';

// Client-side
const pdfBlob = await generateReceiptPDF(profile, billing, false);
downloadInvoice(pdfBlob, 'SubZeed_Receipt_INV-xxxxx');
```

### โครงสร้าง PDF ที่สร้าง

```
┌─────────────────────────────────────┐
│            SubZeed                   │
│         ใบเสร็จรับเงิน               │
│                                     │
│  เลขที่: INV-xxx    วันที่: 15 ม.ค. 68 │
│                                     │
│  ─── ผู้ออกใบเสร็จ ───              │
│  บริษัท ซับซี๊ด จำกัด                │
│  เลขผู้เสียภาษี: 0123456789012       │
│  ที่อยู่...                           │
│                                     │
│  ─── ผู้ซื้อ / ลูกค้า ───            │
│  อีเมล: user@example.com            │
│                                     │
│  ┌──────┬──────────┬──────┬─────┐   │
│  │รายการ│รายละเอียด │จำนวน │บาท  │   │
│  ├──────┼──────────┼──────┼─────┤   │
│  │สมัคร │free→prem │1     │169  │   │
│  └──────┴──────────┴──────┴─────┘   │
│                                     │
│  รวมทั้งสิ้น: 169.00 บาท            │
│                                     │
│  * เอกสารนี้ยังไม่ใช่ใบกำกับภาษี     │
│                                     │
│     ขอบคุณที่ใช้บริการ SubZeed!     │
└─────────────────────────────────────┘
```

---

## 6. การตั้งค่าบริษัท

แก้ไขใน `src/lib/invoice.ts`:

```typescript
const COMPANY = {
  name: 'บริษัท ซับซี๊ด จำกัด',
  address: 'เลขที่ 123/45 ถนนสุขุมวิท ...',
  taxId: '0123456789012',
  phone: '02-123-4567',
  email: 'billing@subzeed.com',
};

const COMPANY_VAT = {
  ...COMPANY,
  vatRate: 0.07, // VAT 7%
};
```

### ช่วงยังไม่จด VAT
- ใช้ `generateReceiptPDF(profile, billing, false)`
- แสดงข้อความ "เอกสารนี้ยังไม่ใช่ใบกำกับภาษีเต็มรูปแบบ"

### ช่วงจด VAT แล้ว
- ใช้ `generateReceiptPDF(profile, billing, true)`
- แสดง "ใบเสร็จรับเงิน / ใบกำกับภาษี"
- คำนวณ VAT 7% ในตาราง
- แสดงข้อความ "ตามมาตรา 86/4 แห่งประมวลรัษฎากร"

---

## 7. หน้า Billing (User Interface)

### `src/app/billing/page.tsx`

| Feature | รายละเอียด |
|---------|-----------|
| แสดงแพ็กเกจปัจจุบัน | ชื่อ + Tier badge + ราคา + รอบบิล |
| ปุ่มจัดการบิล | ลิงก์ไป Stripe Customer Portal |
| ประวัติธุรกรรม | แต่ละรายการแสดง Action + Tier + จำนวนเงิน |
| ปุ่มดาวน์โหลดใบเสร็จ | สร้าง PDF ด้วย jspdf → บันทึกอัตโนมัติ |
| Fallback | ถ้า jspdf ล้ม → เปิดหน้า HTML Invoice |
| หมายเหตุ VAT | แสดงสถานะ VAT ปัจจุบัน |
| Business Pro badge | แสดง "✅ ดาวน์โหลดใบกำกับภาษีได้" |

---

## 8. Admin Invoice

Admin สามารถดาวน์โหลดใบเสร็จของทุกรายการได้จากหน้า Admin Dashboard

```tsx
// ในตาราง billing ของ Admin
<a
  href={`/api/invoice/${b.id}/download`}
  target="_blank"
  rel="noopener noreferrer"
>
  📄 ใบเสร็จ
</a>
```

---

## 9. การทดสอบ

### ทดสอบ Client-side PDF

1. ไปที่ `/billing`
2. ถ้ามีประวัติธุรกรรม → กดปุ่ม "📄 ใบเสร็จ"
3. ระบบจะสร้าง PDF และดาวน์โหลดให้อัตโนมัติ

### ทดสอบ Fallback (HTML → Print)

1. เปิด `/api/invoice/[id]/download` โดยตรง
2. จะเห็น HTML Invoice ที่จัดรูปแบบสวยงาม
3. กดปุ่ม "🖨️ พิมพ์ / บันทึกเป็น PDF" → เลือก "Save as PDF"

---

## 10. Limitation & ข้อควรระวัง

| ปัญหา | สาเหตุ | วิธีแก้ |
|-------|--------|--------|
| ฟอนต์ไทยใน PDF | jspdf ใช้ Helvetica ซึ่งไม่มีหัว | ใช้ HTML fallback แทน (server route) |
| PDF ขนาดใหญ่ | ถ้ามีข้อมูลเยอะ | จำกัด max records ต่อ PDF |
| User ไม่ได้ login | API เช็ค auth | แสดง error toast |

> **อนาคต**: ถ้าต้องการฟอนต์ไทยใน PDF จริงๆ ให้เพิ่ม custom font เข้า jspdf:
> ```typescript
> doc.addFileToVFS('Kanit.ttf', kanitBase64);
> doc.addFont('Kanit.ttf', 'Kanit', 'normal');
> doc.setFont('Kanit');
> ```

---

_อัปเดตล่าสุด: รอบการพัฒนา SubZeed Admin + Payment_
