# 🎵 Audio Extraction — Client-side (Web Audio API)

> ดึงแทร็กเสียงจากวิดีโอฝั่ง Client โดยใช้ Web Audio API
> เพื่อลดแบนด์วิธเซิร์ฟเวอร์ และเร่งความเร็ว Whisper STT

---

## 1. หลักการ (Concept)

ตาม Blueprint ของโปรเจกต์ SubZeed: **Client-side Extraction**

```
❌ Server-side extraction (แพง):
  Video (100MB) → ส่งไป Vercel → FFmpeg extract → WAV → Whisper
  → ค่า bandwidth สูง, Vercel timeout 10s

✅ Client-side extraction (ถูก):
  Video (100MB) → Web Audio API → Mono WAV 16kHz (~3MB) → ส่งไป Whisper
  → Bandwidth เซิร์ฟเวอร์ = 0, ไม่มี timeout
```

---

## 2. Implementation (`src/lib/audio-extractor.ts`)

### ขั้นตอนการทำงาน

```
videoFile (File)
  │
  ├── 1. file.arrayBuffer() → ArrayBuffer
  │
  ├── 2. AudioContext.decodeAudioData() → AudioBuffer
  │
  ├── 3. Mix down to Mono (ถ้ามากกว่า 1 channel)
  │     └── เฉลี่ยทุก channel
  │
  ├── 4. Normalize Volume (optional)
  │     └── หา peak → ปรับ gain ให้ดังสุด
  │
  ├── 5. Resample → 16kHz
  │     └── linear interpolation
  │
  └── 6. Encode → WAV (16-bit PCM Mono)
        └── RIFF header + data
```

### ฟังก์ชันหลัก

```typescript
async function extractAudio(
  videoFile: File,
  options?: Partial<AudioExtractOptions>,
  onProgress?: (percent: number) => void
): Promise<AudioExtractResult>
```

### เปรียบเทียบขนาดไฟล์

| รูปแบบ | ขนาด (ต่อนาที) | คุณภาพ |
|--------|---------------|--------|
| Video ต้นฉบับ (1080p) | ~200-300 MB | full |
| WAV 44.1kHz Stereo 16bit | ~10 MB | CD quality |
| **WAV 16kHz Mono 16bit** | **~1.9 MB** | **พอเพียงสำหรับ Speech** |
| MP3 64kbps Mono | ~0.5 MB | มี loss |

---

## 3. ทำไมต้อง 16kHz Mono?

| Feature | ค่า | เหตุผล |
|---------|-----|--------|
| Sample Rate | 16kHz | Whisper รับ input ที่ 16kHz (human speech range) |
| Channels | Mono (1) | Speech = mono source, ลดขนาดครึ่งนึง |
| Bit Depth | 16-bit | Dynamic range พอสำหรับ Speech |
| Format | WAV | ไม่ต้อง encode lossy (MP3/Opus) |

---

## 4. Web Audio API Pipeline

```typescript
// 1. สร้าง AudioContext
const audioCtx = new AudioContext();

// 2. ถอดรหัส
const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

// 3. เลือกช่อง
const left = audioBuffer.getChannelData(0);
const right = audioBuffer.getChannelData(1);

// 4. Mono mix
const mono = new Float32Array(left.length);
for (let i = 0; i < left.length; i++) {
  mono[i] = (left[i] + right[i]) / 2;
}

// 5. Normalize
let maxVal = 0;
for (let i = 0; i < mono.length; i++) {
  maxVal = Math.max(maxVal, Math.abs(mono[i]));
}
const gain = Math.min(1.0 / maxVal, 0.99);
for (let i = 0; i < mono.length; i++) {
  mono[i] *= gain;
}

// 6. Resample (44100 → 16000)
const ratio = 44100 / 16000; // 2.75625
const newLength = Math.floor(mono.length / ratio);
const resampled = new Float32Array(newLength);
for (let i = 0; i < newLength; i++) {
  resampled[i] = mono[Math.floor(i * ratio)];
}

// 7. Encode WAV → Blob
const wavBuffer = encodeWav(resampled, 16000);
const blob = new Blob([wavBuffer], { type: 'audio/wav' });
```

---

## 5. WAV Encoder

```typescript
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer
```

สร้าง WAV header แบบ PCM 16-bit Mono:

```
Offset  Size  Description
0       4     "RIFF"
4       4     File size - 8
8       4     "WAVE"
12      4     "fmt "
16      4     16 (PCM chunk size)
20      2     1 (PCM format)
22      2     1 (channels)
24      4     sampleRate
28      4     byteRate
32      2     blockAlign
34      2     16 (bitsPerSample)
36      4     "data"
40      4     data size
44      X     PCM data (signed 16-bit)
```

---

## 6. Performance

| ขั้นตอน | เวลาโดยประมาณ | หมายเหตุ |
|---------|---------------|---------|
| decodeAudioData | 0.5-2 วิ | ขึ้นกับขนาดไฟล์ |
| Mix + Normalize | 0.1-0.5 วิ | O(n) |
| Resample | 0.2-1 วิ | Linear interpolation |
| WAV Encode | 0.2-0.5 วิ | O(n) |
| **รวม** | **~1-4 วิ** | สำหรับวิดีโอ 10-30 นาที |

---

## 7. Browser Compatibility

| Browser | Web Audio API | หมายเหตุ |
|---------|---------------|----------|
| Chrome ✅ | Full support | ดีที่สุด |
| Firefox ✅ | Full support | |
| Safari ✅ | Full support | ต้อง user gesture ก่อน |
| Edge ✅ | Full support | |

> ⚠️ Safari: ต้องมี user interaction (click) ก่อนสร้าง AudioContext ครั้งแรก

---

## 8. การใช้ใน Studio

```typescript
// src/app/studio/page.tsx

const handleTranscribe = async () => {
  // 1. Extract audio
  const result = await extractAudio(
    store.videoFile,
    { targetSampleRate: 16000, normalizeAudio: true },
    (progress) => store.setProcessingProgress(progress)
  );

  // 2. ส่ง API
  const formData = new FormData();
  formData.append('audio', result.blob, 'audio.wav');
  formData.append('userId', user.id);

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  // 3. แปลงเป็น subtitles
  const { segments } = await res.json();
  const subtitles = segments.map((seg) => ({
    id: `sub-${uid()}`,
    start: seg.start,
    end: seg.end,
    text: seg.text,
    position: 'bottom',
    y_offset: 90,
  }));

  store.setSubtitles(subtitles);
};
```

---

## 9. ข้อควรระวัง

| ปัญหา | วิธีแก้ |
|-------|--------|
| ไฟล์ WAV ขนาดใหญ่ (เช่น 1 ชม. ≈ 110MB) | แบ่งเป็น chunks หรือจำกัดความยาว |
| Memory leak จาก AudioContext | `audioCtx.close()` เมื่อใช้เสร็จ |
| Safari ไม่ยอม decode | ต้องมี user gesture ก่อนสร้าง context |
| วิดีโอ codec ไม่ support | เฉลย: h264/aac → OK, av1 → อาจไม่ได้ |

---

_อัปเดตล่าสุด: รอบการพัฒนา STT Pipeline_
