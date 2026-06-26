# 🌐 AI Smart Translation

> ระบบแปลภาษาซับไตเติลอัตโนมัติผ่าน Gemini API
> อัปเดตล่าสุด: มีนาคม 2025

---

## ภาพรวม

AI Smart Translation เป็นฟีเจอร์สำหรับแปลซับไตเติลภาษาไทยเป็นภาษาต่าง ๆ หลังจากถอดความเสร็จ โดยทำงานเป็นขั้นตอนต่อจาก AI Vocabulary (ตรวจคำศัพท์)

**เฉพาะ Premium, Business Starter, Business Pro** สามารถใช้งานได้ (`aiVocabulary === true` ใน Tier Config)

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | คำอธิบาย |
|---|---|
| `src/app/studio/page.tsx` | UI: Checkbox "AI แปล" + Dropdown เลือกภาษา |
| `src/app/api/transcribe-and-save/route.ts` | Step 6: เรียก Gemini เพื่อแปล |
| `src/app/api/gemini-vocab/route.ts` | รองรับ `translationMode: true` สำหรับ Prompt แปลภาษา |

---

## ภาษาเป้าหมายที่รองรับ (10 ภาษา)

| รหัส | ภาษา | Flag |
|---|---|---|
| `en` | อังกฤษ | 🇬🇧 |
| `zh` | จีน | 🇨🇳 |
| `ja` | ญี่ปุ่น | 🇯🇵 |
| `ko` | เกาหลี | 🇰🇷 |
| `vi` | เวียดนาม | 🇻🇳 |
| `ms` | มาเลย์ | 🇲🇾 |
| `fr` | ฝรั่งเศส | 🇫🇷 |
| `de` | เยอรมัน | 🇩🇪 |
| `es` | สเปน | 🇪🇸 |
| `ar` | อาหรับ | 🇸🇦 |

---

## ข้อมูลทางเทคนิค

### ขั้นตอนการทำงาน

1. ผู้ใช้เลือกวิดีโอ + ติ๊ก **"AI แปล"** + เลือกภาษาเป้าหมาย
2. กด **🎤 ถอดความด้วย AI**
3. Frontend ส่ง `enableAiSmart=true` + `aiSmartLanguage='en'` ไปยัง `/api/transcribe-and-save`
4. หลัง Whisper ถอดความเสร็จ → เรียก `/api/gemini-vocab` ในโหมด `translationMode: true`
5. Gemini ได้รับ Prompt แปลภาษา — ส่งกลับเป็น JSON array
6. ระบบแทนที่ `subtitle[].text` ด้วยข้อความที่แปลแล้ว
7. Response ส่งกลับ `aiSmartApplied: true` + `aiSmartLanguage: 'en'`

### Prompt ที่ใช้

```
คุณคือนักแปลภาษามืออาชีพ
กรุณาแปลข้อความซับไตเติลภาษาไทยด้านล่างเป็นภาษา{langName}:

กฎการแปล:
- แปลให้เป็นภาษาธรรมชาติที่เข้าใจง่าย
- รักษาคำเฉพาะ/ชื่อเฉพาะ/ชื่อแบรนด์ไว้
- รักษาความหมายเดิมให้ครบถ้วน

ตอบกลับเป็น JSON array:
[ { "id": "sub-xxx", "original": "...", "translated": "..." } ]

ข้อความซับไตเติล:
[{ "id": "sub-xxx", "text": "..." }]
```

### Gemini Config (โหมดแปล)

```json
{
  "temperature": 0.3,
  "maxOutputTokens": 4096
}
```

---

## UI Logic

| Tier | Checkbox | สถานะ |
|---|---|---|
| **Free** | 🔒 Disabled | `cursor-not-allowed`, opacity 40% |
| **Basic** | 🔒 Disabled | `cursor-not-allowed`, opacity 40% |
| **Premium** | ✅ Enabled | ปกติ |
| **Business Starter** | ✅ Enabled | ปกติ |
| **Business Pro** | ✅ Enabled | ปกติ |

### Toolbar UI

```
[🎤 ถอดความด้วย AI] [AI Vocab ☐] [___________] [AI แปล ☐] [🇬🇧 อังกฤษ ▼]
```

- **AI Vocab**: ตรวจคำศัพท์ + Brand Terms
- **AI แปล**: แปลภาษา (แสดง Dropdown เลือกภาษาเมื่อติ๊ก)
- ทั้งสองอัน Locked 🔒 สำหรับ Free/Basic

---

## หมายเหตุ

- การแปลเกิดขึ้นหลังจาก AI Vocabulary (ถ้าเปิดทั้งคู่ ตรวจคำศัพท์ก่อน → แปลทีหลัง)
- ถ้าเกิด error ขั้นตอนแปล → ไม่ล้มเหลวทั้งกระบวนการ ข้ามไป แจ้งใน log
- Toast แจ้งผล: `ถอดความสำเร็จ! 24 รายการ + AI แปล(อังกฤษ)`
