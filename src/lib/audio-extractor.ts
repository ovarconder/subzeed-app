// ============================================================
// 🎵 Audio Extraction & Optimization — SubZeed
// ============================================================
// ดึงแทร็กเสียงจากวิดีโอโดยใช้ Web Audio API ฝั่ง Client
// เพื่อลดขนาดไฟล์ก่อนส่งไป Whisper API
// ============================================================

/**
 * ตัวเลือกการแปลงเสียง
 */
export interface AudioExtractOptions {
  /** อัตราการสุ่มตัวอย่าง (Hz) — 16000 เหมาะกับ Whisper */
  targetSampleRate: number;
  /** จำนวนช่องเสียง — 1 = Mono */
  numChannels: number;
  /** Bit Depth — 16bit */
  bitsPerSample: number;
  /** ตัดเสียงเงียบช่วงต้น/ท้าย */
  trimSilence: boolean;
  /** Normalize volume */
  normalizeAudio: boolean;
}

const DEFAULT_OPTIONS: AudioExtractOptions = {
  targetSampleRate: 16000,
  numChannels: 1,
  bitsPerSample: 16,
  trimSilence: false,
  normalizeAudio: true,
};

/**
 * ผลลัพธ์จากการ extract
 */
export interface AudioExtractResult {
  /** WAV blob สำหรับส่ง API */
  blob: Blob;
  /** ระยะเวลาเสียงจริง (วินาที) */
  durationSeconds: number;
  /** ขนาดไฟล์ (bytes) */
  sizeBytes: number;
  /** Sample rate ต้นทาง */
  originalSampleRate: number;
}

/**
 * ดึงเสียงจากวิดีโอแล้วแปลงเป็น Mono WAV 16kHz 16-bit
 * เหมาะสำหรับส่ง Whisper API
 *
 * @param videoFile - ไฟล์วิดีโอที่ผู้ใช้เลือก
 * @param options - ตัวเลือกการแปลง
 * @param onProgress - callback อัปเดตความคืบหน้า (0-100)
 */
export async function extractAudio(
  videoFile: File,
  options?: Partial<AudioExtractOptions>,
  onProgress?: (percent: number) => void
): Promise<AudioExtractResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  onProgress?.(10);

  // 1. อ่านไฟล์เป็น ArrayBuffer
  const arrayBuffer = await videoFile.arrayBuffer();
  onProgress?.(20);

  // 2. ถอดรหัสเสียงด้วย Web Audio API
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  onProgress?.(40);

  const originalSampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const durationSeconds = length / originalSampleRate;

  // 3. เลือกช่องและ Resample
  let channelData: Float32Array;

  if (numChannels === 1) {
    channelData = audioBuffer.getChannelData(0);
  } else {
    // Mix down to mono — เฉลี่ยทุกช่อง
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    channelData = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      channelData[i] = (left[i] + right[i]) / 2;
    }
  }
  onProgress?.(50);

  // 4. Normalize (optional)
  if (opts.normalizeAudio) {
    let maxVal = 0;
    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > maxVal) maxVal = abs;
    }
    if (maxVal > 0.001) {
      const gain = 1.0 / maxVal;
      // Soft limiting — ไม่ให้เกิน 0.99
      const limitGain = Math.min(gain, 0.99);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] *= limitGain;
      }
    }
  }
  onProgress?.(60);

  // 5. Resample เป็น targetSampleRate
  const ratio = originalSampleRate / opts.targetSampleRate;
  let resampled: Float32Array;

  if (Math.abs(ratio - 1) < 0.001) {
    resampled = channelData;
  } else {
    const newLength = Math.floor(channelData.length / ratio);
    resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIdx = Math.floor(i * ratio);
      resampled[i] = channelData[Math.min(srcIdx, channelData.length - 1)];
    }
  }
  onProgress?.(70);

  // 6. เข้ารหัสเป็น WAV
  const wavBuffer = encodeWav(resampled, opts.targetSampleRate);
  onProgress?.(80);

  // 7. สร้าง Blob
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  onProgress?.(100);

  return {
    blob,
    durationSeconds,
    sizeBytes: blob.size,
    originalSampleRate,
  };
}

/**
 * คำนวณโควตาที่ต้องใช้ (นาที)
 */
export function calculateQuotaMinutes(durationSeconds: number): number {
  return Math.ceil(durationSeconds / 60);
}

/**
 * ตรวจสอบว่าเสียงสั้นเกินไปหรือไม่
 */
export function isAudioTooShort(durationSeconds: number, minSeconds: number = 0.5): boolean {
  return durationSeconds < minSeconds;
}

/**
 * ตรวจสอบว่าเสียงยาวเกินไปหรือไม่
 */
export function isAudioTooLong(durationSeconds: number, maxMinutes: number = 999): boolean {
  return durationSeconds > maxMinutes * 60;
}

// ============================================================
// WAV Encoder — PCM 16-bit Mono
// ============================================================

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}
