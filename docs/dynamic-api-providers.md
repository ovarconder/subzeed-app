# 🎛️ Dynamic API Provider System

> ระบบตั้งค่า API Provider (STT/LCC จาก Admin Dashboard
> อัปเดตล่าสุด: มีนาคม 2025

---

## สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [ไฟล์ที่เกี่ยวข้อง](#2-ไฟล์ที่เกี่ยวข้อง)
3. [Database Schema](#3-database-schema)
4. [API Routes](#4-api-routes)
5. [Backend SDK](#5-backend-sdk)
6. [Frontend Component](#6-frontend-component)
7. [Provider ที่รองรับ](#7-provider-ที่รองรับ)
8. [Security](#8-security)

---

## 1. ภาพรวม

ระบบนี้ให้ Admin สามารถเปลี่ยน Provider ของ AI ต่าง ๆ ได้จากหน้า Admin Dashboard โดยไม่ต้องแก้โค้ดหรือ Environment Variable:

- **STT (Speech-to-Text):** OpenAI Whisper, Groq Whisper
- **LLM (AI Smart Engine):** OpenAI GPT, Google Gemini, Groq Llama

API Keys ถูกเข้ารหัสด้วย `pgp_sym_encrypt` ของ PostgreSQL ก่อนบันทึกลง DB

---

## 2. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | คำอธิบาย |
|---|---|
| `supabase/005_api_config.sql` | Migration script: สร้างตาราง `api_providers` + ฟังก์ชัน encrypt/decrypt |
| `src/lib/api-providers.ts` | Backend SDK: `transcribeAudio()`, `processAISmart()`, `getAllProviderInfos()` |
| `src/app/api/admin/api-config/route.ts` | API Route: GET (list), PUT (update), POST (test connection) |
| `src/components/admin/ApiConfig.tsx` | UI Component สำหรับ Admin Dashboard |
| `src/lib/types.ts` | Types: `ApiProvider`, `ApiProviderInfo`, `ApiProviderPayload` + `STT_PROVIDER_OPTIONS`, `LLM_PROVIDER_OPTIONS` |
| `src/app/admin/page.tsx` | Admin Dashboard — เพิ่ม tab "ตั้งค่า API" |

---

## 3. Database Schema

### ตาราง `api_providers`

```sql
CREATE TABLE api_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_type TEXT NOT NULL CHECK (service_type IN ('stt', 'llm')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_encrypted TEXT,
  is_active BOOLEAN DEFAULT false NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(service_type, provider)
);
```

### ฟังก์ชัน

| ฟังก์ชัน | คำอธิบาย |
|---|---|
| `encrypt_api_key(plain_key TEXT)` | เข้ารหัส API Key ด้วย `pgp_sym_encrypt` |
| `decrypt_api_key(encrypted_key TEXT)` | ถอดรหัส API Key |
| `activate_api_provider(p_service_type, p_provider)` | เปิด provider นั้น ปิดตัวอื่นใน service_type เดียวกัน |
| `initialize_default_api_providers()` | เพิ่ม provider เริ่มต้น (OpenAI + Groq STT, OpenAI + Gemini + Groq LLM) |

### Default Providers

เมื่อรัน `initialize_default_api_providers()`:

**STT:**
- OpenAI Whisper (`whisper-1`) — inactive
- Groq Whisper (`whisper-large-v3`) — **active** (default)

**LLM:**
- OpenAI GPT-4o-mini — inactive
- Google Gemini 1.5 Flash — inactive
- Groq Llama 3.1 — **active** (default)

---

## 4. API Routes

### `GET /api/admin/api-config`

ดึงข้อมูล API Provider ทั้งหมด (sanitized, ไม่มี Key)

**Response:**
```json
{
  "providers": [
    {
      "service_type": "stt",
      "provider": "openai",
      "model": "whisper-1",
      "is_active": false,
      "label": "OpenAI Whisper",
      "has_key": true,
      "updated_at": "2025-03-21T10:30:00Z"
    }
  ],
  "activeConfig": {
    "stt": { ... },
    "llm": { ... }
  }
}
```

### `PUT /api/admin/api-config`

อัปเดต/เปิดใช้งาน API Provider

**Body:**
```json
{
  "service_type": "stt",
  "provider": "groq",
  "model": "whisper-large-v3",
  "api_key": "gsk_xxxxx",
  "is_active": true
}
```

**หมายเหตุ:**
- ถ้า `api_key` เว้นว่าง → ไม่เปลี่ยน Key เดิม
- ถ้า `is_active === true` → เรียก `activate_api_provider()` ปิดตัวอื่น

### `POST /api/admin/api-config`

ทดสอบการเชื่อมต่อ API (Test Connection)

**Body:**
```json
{
  "service_type": "stt",
  "provider": "groq",
  "api_key": "gsk_xxxxx",
  "model": "whisper-large-v3"
}
```

**Response:**
```json
{
  "success": true,
  "message": "✅ เชื่อมต่อ groq สำเร็จ"
}
```

---

## 5. Backend SDK

### `transcribeAudio(audioBuffer, language)`

ฟังก์ชันถอดเสียงพูดเป็นข้อความ — ดึง Config จาก DB แล้วเลือก Provider อัตโนมัติ

```typescript
import { transcribeAudio } from '@/lib/api-providers';

const result = await transcribeAudio(audioBuffer, 'th');
// result.provider = 'groq' | 'openai'
// result.model = model ที่ตั้งค่าไว้
```

### `processAISmart(prompt, systemPrompt?, options?)`

ฟังก์ชันส่งข้อความไป LLM — เลือก Provider ตาม Config

```typescript
import { processAISmart } from '@/lib/api-providers';

const result = await processAISmart(
  'ข้อความที่จะส่ง',
  'System prompt...',
  { temperature: 0.2, maxTokens: 2048 }
);
```

### `getAllProviderInfos()`

ฟังก์ชันดึงข้อมูล Provider ทั้งหมด (ไม่มี Key) — ใช้ใน API Route

---

## 6. Frontend Component

`ApiConfig.tsx` ประกอบด้วย 3 ส่วน:

1. **🎤 STT Config** — Dropdown เลือก Provider → Dropdown เลือก Model → Input API Key
2. **🧠 LLM Config** — Dropdown เลือก Provider → Dropdown เลือก Model → Input API Key
3. **📊 ตารางสถานะ Provider ทั้งหมด** — แสดง Active/Inactive, มี Key หรือไม่

UI Pattern:
- ปุ่ม 💾 บันทึกค่า (แยก STT/LLM)
- ปุ่ม 🔌 ทดสอบการเชื่อมต่อ
- Security Notes box ด้านล่าง

---

## 7. Provider ที่รองรับ

### STT Providers

| Provider | รหัส | Models |
|---|---|---|
| OpenAI Whisper | `openai` | `whisper-1` |
| Groq Whisper | `groq` | `whisper-large-v3`, `whisper-large-v3-turbo` |

### LLM Providers

| Provider | รหัส | Models |
|---|---|---|
| OpenAI | `openai` | `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo` |
| Google Gemini | `gemini` | `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash` |
| Groq | `groq` | `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, `qwen/qwen3-32b`, `mixtral-8x7b-32768` |

---

## 8. Security

| มาตรการ | รายละเอียด |
|---|---|
| **Encryption** | API Keys ถูกเข้ารหัสด้วย `pgp_sym_encrypt` (pgcrypto) ก่อนบันทึก |
| **Decryption** | ใช้ `decrypt_api_key` RPC — เฉพาะ Service Role เท่านั้น |
| **Sanitized Response** | API Route ไม่ส่ง Key กลับ Client — ส่งแค่ `has_key: boolean` |
| **Admin Guard** | ทุก Route เช็ค `is_super_admin` หรือ `overconda@gmail.com` |
| **Fallback** | ถ้า RPC ไม่สำเร็จ → Fallback ใช้ Environment Variable (OPENAI_API_KEY) |
| **Production** | แนะนำให้ใช้ Supabase Vault (pgsodium) สำหรับ Production จริง |

### การเพิ่ม Provider ใหม่

1. เพิ่ม Type ใน `src/lib/types.ts` (ถ้ายังไม่มี)
2. เพิ่ม Options ใน `STT_PROVIDER_OPTIONS` / `LLM_PROVIDER_OPTIONS`
3. เพิ่ม Logic ใน `src/lib/api-providers.ts` (switch case)
4. รัน migration เพิ่ม record ใน `api_providers`
