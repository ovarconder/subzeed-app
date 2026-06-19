# 🎤 Thai STT Pipeline — SubZeed

> ระบบถอดความเสียงภาษาไทยด้วย OpenAI Whisper
> Audio Extraction ฝั่ง Client + Whisper API ฝั่ง Server

---

## 1. สถาปัตยกรรม (Architecture)

```
Client (Browser)
  │
  ├── 1. เลือกวิดีโอ / ลากวาง
  │
  ├── 2. extractAudio(videoFile)
  │     ├── Web Audio API → decodeAudioData
  │     ├── Mix down to Mono
  │     ├── Normalize volume
  │     ├── Resample → 16kHz
  │     └── Encode → WAV (16-bit PCM)
  │
  ├── 3. POST /api/transcribe
  │     └── (หรือ POST /api/transcribe-and-save)
  │
  ├── 4. Whisper API (OpenAI)
  │     ├── language: 'th' (ไทย)
  │     ├── model: 'whisper-1'
  │     ├── response_format: 'verbose_json' (segments พร้อม timestamp)
  │     └── temperature: 0.0
  │
  ├── 5. [Optional] POST /api/gemini-vocab
  │     └── แก้คำผิด / รักษาคำแบรนด์ (Premium up)
  │
  ├── 6. หัก Quota (service role)
  │
  └── 7. บันทึก Project + Quota Log
```

### โหมดการทำงาน 2 แบบ

| API Route | การทำงาน |
|-----------|---------|
| `POST /api/transcribe` | ถอดความอย่างเดียว → คืน segments (client จัดการ save เอง) |
| `POST /api/transcribe-and-save` | ถอดความ + หัก quota + AI Vocab + save project (all-in-one) |

---

## 2. ไฟล์สำคัญ

```
src/
├── lib/
│   ├── audio-extractor.ts        # ไลบรารี extract เสียงฝั่ง Client
│   └── types.ts                  # TypeScript interfaces
├── app/
│   └── api/
│       ├── transcribe/
│       │   └── route.ts          # API ถอดความ (transcribe-only)
│       ├── transcribe-and-save/
│       │   └── route.ts          # API all-in-one
│       └── gemini-vocab/
│           └── route.ts          # AI Vocabulary (แก้คำผิด)
├── app/
│   └── studio/
│       └── page.tsx              # หน้า Studio ที่ใช้ STT
└── supabase/
    └── 002_add_is_abuser_to_profiles.sql  # Migration
```

---

## 3. Audio Extraction (`src/lib/audio-extractor.ts`)

### ฟังก์ชันหลัก

```typescript
async function extractAudio(
  videoFile: File,
  options?: Partial<AudioExtractOptions>,
  onProgress?: (percent: number) => void
): Promise<AudioExtractResult>
```

### ตัวเลือก (AudioExtractOptions)

| Option | Default | คำอธิบาย |
|--------|---------|----------|
| `targetSampleRate` | `16000` | อัตราสุ่มตัวอย่าง (Hz) — 16kHz พอสำหรับ Whisper |
| `numChannels` | `1` | Mono — ลดขนาดไฟล์ |
| `bitsPerSample` | `16` | 16-bit PCM |
| `trimSilence` | `false` | ตัดเสียงเงียบ (ยังไม่ implement) |
| `normalizeAudio` | `true` | ปรับระดับเสียงอัตโนมัติ |

### ผลลัพธ์ (AudioExtractResult)

```typescript
{
  blob: Blob,               // WAV blob → ส่ง API
  durationSeconds: number,  // ระยะเวลา (วิ)
  sizeBytes: number,        // ขนาดไฟล์ (bytes)
  originalSampleRate: number // Sample rate ต้นทาง
}
```

### คำนวณโควตา

```typescript
calculateQuotaMinutes(durationSeconds: number): number
// ปัดขึ้น 1 นาที → 75 วิ = 2 นาที
```

---

## 4. API Routes

### 4.1 `POST /api/transcribe`

**Request (FormData):**
| Field | Type | Required | Default |
|-------|------|----------|---------|
| `audio` | Blob (WAV) | ✅ | — |
| `userId` | string | ✅ | — |
| `language` | string | ❌ | `'th'` |
| `projectTitle` | string | ❌ | — |

**Response (200):**
```json
{
  "segments": [
    { "start": 0.0, "end": 2.5, "text": "สวัสดีครับ", "id": 0 }
  ],
  "text": "สวัสดีครับ วันนี้เราจะมาพูดถึง...",
  "duration": 120.5,
  "durationMinutes": 3,
  "quotaUsed": 3,
  "quotaLeft": 297
}
```

**Error Responses:**
| Status | ความหมาย |
|--------|----------|
| `401` | ไม่ได้ล็อกอิน |
| `402` | Quota ไม่พอ (Payment Required) |
| `403` | บัญชีถูกระงับ (abuser) |
| `502` | Whisper API ล้มเหลว |

### 4.2 `POST /api/transcribe-and-save`

**Request (FormData):**
| Field | Type | Required | Default |
|-------|------|----------|---------|
| `audio` | Blob (WAV) | ✅ | — |
| `userId` | string | ✅ | — |
| `projectTitle` | string | ❌ | `'วิดีโอไม่มีชื่อ'` |
| `enableAiVocab` | string ('true'/'false') | ❌ | `'false'` |
| `brandTerms` | string (JSON array) | ❌ | `'[]'` |

**สิ่งที่ทำอัตโนมัติ:**
1. เช็ค Auth + Quota + Abuser
2. เรียก Whisper API (ไทย)
3. แปลงเป็น SubtitleEntry[]
4. [Optional] ถ้า Premium+ → เรียก Gemini Vocab
5. หัก Quota ใน DB
6. Save โปรเจกต์ใหม่ในตาราง projects
7. บันทึก quota_activity_logs

**Response (200):**
```json
{
  "projectId": "uuid",
  "segments": [...],
  "text": "...",
  "subtitles": [
    { "id": "sub-abc123", "start": 0.0, "end": 2.5, "text": "สวัสดีครับ", "position": "bottom", "y_offset": 90 }
  ],
  "duration": 120.5,
  "durationMinutes": 3,
  "quotaUsed": 3,
  "quotaLeft": 297,
  "aiVocabApplied": true
}
```

---

## 5. ภาษาไทยกับ Whisper

### ปัจจัยที่ทำให้ Whisper ถอดภาษาไทยได้ดี

| ปัจจัย | คำอธิบาย |
|--------|---------|
| `language: 'th'` | บังคับภาษาไทย — ลดสับสนกับภาษาใกล้เคียง |
| `temperature: 0.0` | deterministic output — ค่าเท่าเดิมทุกครั้ง |
| Audio 16kHz Mono | คุณภาพพอเพียงสำหรับคำพูด (speech) |
| Normalize volume | ระดับเสียงสม่ำเสมอ — ลด clipping/noise |

### ข้อจำกัด

| ปัญหา | สาเหตุ | แนวทางแก้ไข |
|-------|--------|------------|
| คำทับศัพท์ | Whisper ไม่รู้แบรนด์ไทย | ใช้ Gemini Vocab แก้ทีหลัง |
| เสียงแวดล้อม | Whisper อาจเพี้ยน | สั่งให้ผู้ใช้บันทึกในที่เงียบ |
| คำสแลง/ชื่อเฉพาะ | Whisper ตีความผิด | ผู้ใช้แก้ไขใน Studio ด้วยตนเอง |

---

## 6. การใช้ใน Studio

### flow ปัจจุบัน (ใน `src/app/studio/page.tsx`)

```
1. ผู้ใช้ลากวิดีโอ → handleFileSelect → ตรวจความยาว
2. กด 🎤 ถอดความด้วย AI → handleTranscribe()
   ├── extractAudio() → WAV Blob
   ├── POST /api/transcribe → segments
   └── แปลง → SubtitleEntry[] → อัปเดต store
3. ผู้ใช้แก้ไขซับไตเติลใน sidebar
4. กด 💾 บันทึก → save project ลง Supabase
```

### Enhanced Flow (โดยใช้ transcribe-and-save)

```
1. ผู้ใช้ลากวิดีโอ → ตรวจความยาว + quota
2. กด 🎤 ถอดความ → handleTranscribeEnhanced()
   ├── extractAudio() → WAV Blob
   ├── POST /api/transcribe-and-save
   │   ├── Whisper → segments
   │   ├── [Premium+] Gemini Vocab
   │   ├── หัก quota อัตโนมัติ
   │   └── save project อัตโนมัติ
   └── redirect ไป /studio/[projectId]
```

---

## 7. Quota Management

### ขั้นตอนการหักโควตา

```typescript
// 1. คำนวณนาที
const usedMinutes = Math.ceil(durationSeconds / 60);

// 2. อัปเดต profiles
await supabase
  .from('profiles')
  .update({ quota_minutes_used: newUsed })
  .eq('id', userId);

// 3. บันทึก log
await supabase.from('quota_activity_logs').insert({
  user_id: userId,
  log_type: 'stt_transcription',
  minutes_changed: -usedMinutes,
  description: `ถอดความภาษาไทย...`,
});
```

---

## 8. การทดสอบ

### ทดสอบ STT

1. เปิดหน้า `/studio`
2. ลากวิดีโอภาษาไทย (ความยาว < 15 นาที)
3. กด 🎤 ถอดความด้วย AI
4. รอสักครู่ → ระบบจะแสดงซับไตเติลใน sidebar
5. กด ▶️ ดูตัวอย่าง

### ทดสอบ Dev Mode

ถ้าไม่มี `OPENAI_API_KEY`:
- Whisper API จะคืน error → ระบบแสดง "Transcription failed"
- ควรจำลองข้อมูลปลอมเพื่อทดสอบ UI

---

## 9. Logging & Debug

```
[transcribe] Whisper API error: {error}     → เช็ค API key หรือ network
[transcribe] Quota update error: {error}    → เช็ค DB connection
[transcribe-and-save] Gemini vocab error... → non-fatal, ข้ามไป
[transcribe-and-save] Save project error... → เช็ค schema/RLS
```

---

_อัปเดตล่าสุด: รอบการพัฒนา STT Pipeline_
