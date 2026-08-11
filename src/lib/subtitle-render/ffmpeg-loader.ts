// ============================================================
// 🎨 Subtitle Render Module — FFmpeg Loader
// ============================================================
// หน้าที่เดียว: คืน instance ของ ffmpeg ที่ init เรียบร้อยแล้ว
//
// - จัดการ corePath ให้ตรงกับ asset ที่ self-host ไว้ + basePath
//   ของ subzeed reverse proxy (/subzeed)
// - cache instance ไว้ ไม่ init ซ้ำทุกครั้งที่ render
// ============================================================

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { api, getBasePath } from '@/lib/api';

// ─── Constants ─────────────────────────────────────────
// ⭐ Self-host: ไฟล์อยู่ใน public/ffmpeg/ → serve ผ่าน basePath (/subzeed/ffmpeg)
// CDN: fallback เมื่อ self-host ไม่มีไฟล์ (ex: dev ที่ยังไม่ copy)
const CORE_CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

// เวลาโหลด core+wasm เกิน 30s → ผิดปกติ (ค้าง)
const LOAD_TIMEOUT_MS = 30_000;

// ─── Singleton State ──────────────────────────────────
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let ffmpegLoadError: Error | null = null;

// ─── Terminate / Reset ────────────────────────────────
/**
 * ยุติ instance ปัจจุบัน + reset สถานะทั้งหมด
 * ใช้ตอนยกเลิก render หรือเวลา instance ค้าง/error
 */
export function terminateFFmpeg(): void {
  if (ffmpegInstance) {
    try { ffmpegInstance.terminate(); } catch { /* ignore */ }
    ffmpegInstance = null;
  }
  ffmpegLoadPromise = null;
  ffmpegLoadError = null;
}

// ─── Path Helpers (basePath-aware) ────────────────────
// core + wasm self-host อยู่ใน basePath/ffmpeg/
function selfHostCoreBase(): string {
  const base = getBasePath();
  return `${base}/ffmpeg`;
}

// ─── fetch with timeout ───────────────────────────────
async function fetchWithTimeout(url: string, label: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Loader หลัก ──────────────────────────────────────
async function loadFFmpegInstance(): Promise<FFmpeg> {
  const instance = new FFmpeg();

  instance.on('log', ({ type, message }) => {
    if (type === 'warn' || type === 'error') console.log('[ffmpeg]', type, message);
  });

  try {
    // ⭐ ลอง self-host ก่อน; ถ้าไม่มีไฟล์ → fallback CDN
    const selfHostBase = selfHostCoreBase();
    console.log('[ffmpeg] Loading core.js + core.wasm from self-host:', selfHostBase);

    let coreURL: string;
    let wasmURL: string;
    try {
      await fetchWithTimeout(`${selfHostBase}/ffmpeg-core.js`, 'self-host core.js', 3_000);
      console.log('[ffmpeg] Self-host OK');
      coreURL = `${selfHostBase}/ffmpeg-core.js`;
      wasmURL = `${selfHostBase}/ffmpeg-core.wasm`;
    } catch {
      console.warn('[ffmpeg] Self-host not available, falling back to CDN');
      coreURL = `${CORE_CDN}/ffmpeg-core.js`;
      wasmURL = `${CORE_CDN}/ffmpeg-core.wasm`;
    }

    const coreBlobURL = await toBlobURL(coreURL, 'text/javascript');
    const wasmBlobURL = await toBlobURL(wasmURL, 'application/wasm');

    // ⭐ Single-thread mode (ไม่มี classWorkerURL)
    // Multi-thread ต้องการ SharedArrayBuffer + COOP/COEP headers
    // ซึ่ง Vercel ไม่ได้ตั้ง → load() ค้าง
    // Single-thread โหลดผ่านเสมอ
    console.log('[ffmpeg] Calling load() (single-thread)...');
    await instance.load({
      coreURL: coreBlobURL,
      wasmURL: wasmBlobURL,
    });

    console.log('[ffmpeg] FFmpeg ready');
    return instance;
  } catch (err) {
    try { instance.terminate(); } catch { /* ignore */ }
    throw err;
  }
}

// ─── Public API ───────────────────────────────────────
/**
 * คืน FFmpeg instance ที่ init แล้ว (cache) — โหลดครั้งเดียว reuse ต่อไป
 * ถ้าโหลดครั้งก่อน fail → throw ซ้ำ (ไม่มี retry ในโมดูลนี้)
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadError) throw ffmpegLoadError;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    try {
      const instance = await loadFFmpegInstance();
      ffmpegInstance = instance;
      return instance;
    } catch (err) {
      ffmpegLoadError = err instanceof Error
        ? new Error(`ไม่สามารถโหลด FFmpeg.wasm: ${err.message}`)
        : new Error('ไม่สามารถโหลด FFmpeg.wasm');
      ffmpegLoadPromise = null;
      throw ffmpegLoadError;
    }
  })();

  return ffmpegLoadPromise;
}

export { api as resolvePath };
export { getBasePath };
