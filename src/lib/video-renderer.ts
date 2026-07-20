// ============================================================
// 🎥 Video Renderer — SubZeed
// ============================================================
// ใช้ @ffmpeg/ffmpeg v0.12.x wrapper API (ไม่ใช้ @ffmpeg/core ตรงๆ)
// Asset ทั้งหมดโหลดจาก CDN (unpkg) → Blob URL → ส่งให้ ffmpeg.load()
// core + wasm + worker ของ @ffmpeg/ffmpeg เอง (classWorkerURL)
// เพื่อเลี่ยง Web Worker path resolution issue ใน Next.js + basePath
// ============================================================
//
// 🔒 STABLE CORE — แก้ไขด้วยความระมัดระวัง
// ส่วน getFFmpeg() / awaitCancelable() / execWithAbort() คือ core ที่ทำให้
// progress bar ไม่ค้าง และปุ่มยกเลิกทำงานได้จริง ถ้าจะแก้ตรงนี้ ให้ทดสอบ
// 3 เคสก่อน merge เสมอ: (1) โหลดสำเร็จปกติ (2) ตัดเน็ตระหว่างโหลด → ต้องเด้ง error ภายใน 30s
// ไม่ใช่ค้างตลอดไป (3) กดยกเลิกระหว่าง render → ต้องเด้ง toast "ยกเลิกการเรนเดอร์แล้ว" ทันที
// ============================================================

import { api } from '@/lib/api';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { SubtitleEntry, TextSegment } from './types';
import { ALL_FONTS } from './types';

// ─── Font Constants ────────────────────────────────────
const FONT_VFS_DIR = '/fonts';

// ─── Types ──────────────────────────────────────────────
export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'gif';
export type QualityPreset = 'best' | 'high' | 'medium' | 'fast';

export interface RenderOptions {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  strokeColor: string;
  position: 'bottom' | 'top' | 'middle';
  y_offset: number;
  format: ExportFormat;
  fps: number;
  quality: QualityPreset;
  useHardwareAccel: boolean;
  gifMaxWidth: number;
  gifFrameSkip: number;
  trimStart?: number;
  trimEnd?: number;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  fontFamily: 'Arimo',
  fontSize: 36,
  fontColor: 'white',
  strokeColor: 'black',
  position: 'bottom',
  y_offset: 10,
  format: 'mp4',
  fps: 30,
  quality: 'high',
  useHardwareAccel: false,
  gifMaxWidth: 480,
  gifFrameSkip: 1,
};

// ─── Quality → CRF mapping ─────────────────────────────
const CRF_MAP: Record<QualityPreset, number> = { best: 18, high: 23, medium: 28, fast: 35 };
const VP9_CRF_MAP: Record<QualityPreset, number> = { best: 25, high: 30, medium: 35, fast: 40 };

// ─── CDN Base URLs (ปักหมุดเวอร์ชันตายตัว) ────────────
// ⭐ Fallback สำหรับตอน self-host ไม่มี (ex: local dev)
const CORE_CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

// ─── Timeouts ───────────────────────────────────────────
const FFMPEG_LOAD_TIMEOUT_MS = 30_000; // โหลด core+wasm จาก CDN เกิน 30s ถือว่าค้าง
const VIDEO_FETCH_TIMEOUT_MS = 60_000; // ดึงไฟล์วิดีโอต้นทางเกิน 60s ถือว่าค้าง

// ─── fetchWithTimeout — fetch แบบมี timeout ⭐ ──────────
// fetch() native ไม่มี timeout → ต้องใช้ AbortSignal.timeout() เอา
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

// ─── awaitCancelable — ทำให้ promise ใดๆ ยกเลิกได้จริงและมี timeout ⭐ ─
// จุดสำคัญ: promise เดิม (เช่น ffmpeg.load()) อาจยังทำงานต่อเบื้องหลังได้
// แต่ตัวนี้จะ "หยุดรอ" ทันทีเมื่อ abort/timeout โดยไม่ต้องพึ่ง promise เดิม
function awaitCancelable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number,
  timeoutLabel?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      if (timer) clearTimeout(timer);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('ABORTED'));
    };

    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    if (timeoutMs) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(timeoutLabel || `หมดเวลา (${Math.round(timeoutMs / 1000)}s)`));
      }, timeoutMs);
    }

    promise.then(
      (v) => { if (settled) return; settled = true; cleanup(); resolve(v); },
      (e) => { if (settled) return; settled = true; cleanup(); reject(e); },
    );
  });
}

// ─── FFmpeg Singleton ──────────────────────────────────
let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let ffmpegLoadError: string | null = null;
let loadGeneration = 0; // ⭐ กัน stale load มา assign ทับหลังยกเลิกไปแล้ว

export function terminateFFmpeg() {
  loadGeneration++; // ทำให้ load รอบเก่า (ถ้ายังทำงานอยู่เบื้องหลัง) รู้ตัวว่าโดนยกเลิก
  if (ffmpeg) { try { ffmpeg.terminate(); } catch {} ffmpeg = null; }
  ffmpegLoadPromise = null;
  ffmpegLoadError = null;
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (ffmpegLoadError) throw new Error(`FFmpeg โหลดไม่สำเร็จ (ก่อนหน้า): ${ffmpegLoadError}`);
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  const myGeneration = loadGeneration;
  ffmpegLoadPromise = (async () => {
    const instance = new FFmpeg();
    instance.on('log', ({ type, message }) => {
      if (type === 'warn' || type === 'error') console.log('[ffmpeg]', type, message);
    });
    try {
      // ⭐ Self-host: ไฟล์ใน public/ffmpeg/ → serve ที่ /subzeed/ffmpeg/
      const selfHostBase = '/subzeed/ffmpeg';

      console.log('[ffmpeg] Loading core.js + core.wasm from self-host:', selfHostBase);

      // ลอง self-host ก่อน; ถ้าไม่มีไฟล์ → fallback CDN
      let coreURL: string, wasmURL: string;
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

      console.log('[ffmpeg] All 3 assets fetched, calling ffmpeg.load() (single-thread)...');
      await instance.load({
        coreURL: coreBlobURL,
        wasmURL: wasmBlobURL,
      });

      // ถ้าระหว่างโหลด มีการยกเลิก/reset (terminateFFmpeg ถูกเรียก) ไปแล้ว
      // ห้าม assign instance นี้เป็นตัวหลัก — ปิดทิ้งเงียบๆ แทน
      if (myGeneration !== loadGeneration) {
        console.log('[ffmpeg] Load finished after cancel — discarding stale instance');
        try { instance.terminate(); } catch {}
        throw new Error('ABORTED');
      }

      ffmpeg = instance;
      console.log('[ffmpeg] FFmpeg ready');
      return instance;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (myGeneration === loadGeneration && message !== 'ABORTED') {
        ffmpegLoadError = message;
        console.error('[ffmpeg] Load failed:', ffmpegLoadError);
      }
      throw message === 'ABORTED' ? err : new Error(`ไม่สามารถโหลด FFmpeg.wasm: ${message}`);
    }
  })();
  return ffmpegLoadPromise;
}

// ─── execWithAbort — wrapper กัน ff.exec() ค้าง ⭐ ─────
async function execWithAbort(ff: FFmpeg, args: string[], signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('ABORTED');
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      try { ff.terminate(); } catch {}
      ffmpeg = null; ffmpegLoadPromise = null; ffmpegLoadError = null;
      reject(new Error('ABORTED'));
    };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    ff.exec(args)
      .then(() => resolve())
      .catch((err) => {
        const msg = err?.message || '';
        if (msg === 'ABORTED' || signal?.aborted) reject(new Error('ABORTED'));
        else reject(err);
      })
      .finally(() => { signal?.removeEventListener('abort', onAbort); });
  });
}

// ─── Main Render ───────────────────────────────────────
export async function renderVideoWithSubtitles(
  videoBlobOrUrl: Blob | string,
  subtitles: SubtitleEntry[],
  options?: Partial<RenderOptions>,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const ext = extOf(opts.format);
  const assName = 'subs.ass';
  if (signal?.aborted) throw new Error('ABORTED');
  const onAbort = () => { terminateFFmpeg(); };
  if (signal) {
    if (signal.aborted) throw new Error('ABORTED');
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const checkAborted = () => { if (signal?.aborted) throw new Error('ABORTED'); };

  try {
    onProgress?.(2);
    console.log('[render] Step 1/7: getFFmpeg (โหลด core+wasm)...');
    // ⭐ จุดที่เคยค้าง: เดิม await getFFmpeg() เฉยๆ ไม่มี timeout/abort
    // ตอนนี้ผูกกับ signal + timeout 30s แล้ว ถ้าโหลดค้างจริงจะ throw ออกมาแทนที่จะแขวนตลอดไป
    const ff = await awaitCancelable(
      getFFmpeg(),
      signal,
      FFMPEG_LOAD_TIMEOUT_MS,
      'โหลด FFmpeg.wasm ไม่สำเร็จภายใน 30 วินาที — เช็คอินเทอร์เน็ต หรือ AdBlock/Firewall ที่อาจบล็อก CDN',
    );
    checkAborted();
    console.log('[render] Step 1/7 done');
    onProgress?.(5);

    let videoData: Blob;
    if (typeof videoBlobOrUrl === 'string') {
      console.log('[render] Step 2/7: fetching source video...');
      const resp = await awaitCancelable(
        fetch(videoBlobOrUrl, { signal }),
        signal,
        VIDEO_FETCH_TIMEOUT_MS,
        'โหลดไฟล์วิดีโอต้นทางไม่สำเร็จภายใน 60 วินาที',
      );
      if (!resp.ok) throw new Error(`โหลดวิดีโอไม่สำเร็จ (HTTP ${resp.status})`);
      videoData = await resp.blob();
    } else {
      videoData = videoBlobOrUrl;
    }
    if (videoData.size === 0) throw new Error('ไฟล์วิดีโอว่างเปล่า');
    checkAborted();
    console.log('[render] Step 2/7 done, size:', videoData.size);
    onProgress?.(8);

    // ─── Pre-emptive Font Loading ───────────────────
    // โหลดฟอนต์ทั้งหมดใน ALL_FONTS เขียนลง VFS ล่วงหน้า
    // เพื่อให้ libass หาฟอนต์เจอเสมอ ไม่ว่าจะเลือกฟอนต์ไหนก็ตาม
    try {
      // ⭐ createDir จะ throw ถ้าโฟลเดอร์มีอยู่แล้ว (เกิดขึ้นแน่นอนตั้งแต่ export รอบ 2
      // เพราะ ffmpeg instance เป็น singleton ไม่ถูกสร้างใหม่) — ต้อง catch แยกไม่ให้ throw
      // หลุดไปโดนรวบด้วย catch ใหญ่ด้านล่าง ซึ่งจะทำให้ fontPromises ทั้งก้อนไม่ถูกรันเลย
      try {
        await ff.createDir(FONT_VFS_DIR);
      } catch {
        // โฟลเดอร์มีอยู่แล้ว ไม่ใช่ปัญหา ไปต่อได้เลย
      }
      console.log('[render] Pre-loading all available fonts into VFS...');
      const fontPromises = ALL_FONTS.filter(font => font.url).map(async (font) => {
        try {
          const fontFileName = font.url.split('/').pop()!;
          const vfsPath = `${FONT_VFS_DIR}/${fontFileName}`;
          // ไม่ต้องเช็คว่ามีไฟล์อยู่แล้วหรือไม่ writeFile จะเขียนทับไปเลย
          const fontPath = font.url.startsWith('http') ? font.url : api(font.url);
          await ff.writeFile(vfsPath, await fetchFile(fontPath));
          console.log(`[render]  - Font '${font.label}' loaded from ${fontPath} into ${vfsPath}`);
        } catch (e) {
          console.warn(`[render]  - Failed to load font '${font.label}':`, e);
        }
      });
      await Promise.all(fontPromises);
      console.log('[render] All fonts pre-loaded.');
    } catch (fontError) {
      console.error('[render] Critical error during font pre-loading.', fontError);
      // อาจจะ throw error ที่นี่เพื่อให้ render หยุดทำงานไปเลยก็ได้
    }
    checkAborted();

    const ass = buildAss(subtitles, opts);
    console.log('[render] ASS built, length:', ass.length, 'first 200 chars:', ass.slice(0, 200));

    const inName = `input.${ext === 'gif' ? 'mp4' : ext}`;
    const outName = `output.${ext}`;
    await ff.writeFile(inName, await fetchFile(videoData));
    await ff.writeFile(assName, new TextEncoder().encode(ass));
    checkAborted();
    onProgress?.(12);

    ff.on('progress', ({ progress: pct }) => {
      const mapped = Math.min(12 + Math.round(pct * 83), 95);
      onProgress?.(mapped);
    });

    console.log('[render] Step 3/7: encoding...');
    if (opts.format === 'gif') {
      await renderGif(ff, inName, outName, opts, signal);
    } else {
      await renderVideo(ff, inName, outName, opts, signal);
    }
    checkAborted();
    console.log('[render] Step 3/7 done');

    onProgress?.(97);
    const readResult = await ff.readFile(outName);
    let dataBuffer: ArrayBuffer;
    if (readResult instanceof Uint8Array) {
      dataBuffer = readResult.buffer.slice(0) as ArrayBuffer;
    } else if (typeof readResult === 'string') {
      dataBuffer = new TextEncoder().encode(readResult).buffer as ArrayBuffer;
    } else {
      throw new Error('ไม่สามารถอ่านผลลัพธ์จาก FFmpeg ได้');
    }
    await Promise.allSettled([
      ff.deleteFile(inName).catch(() => {}),
      ff.deleteFile(outName).catch(() => {}),
      ff.deleteFile(assName).catch(() => {}),
    ]);
    if (dataBuffer.byteLength === 0) throw new Error('FFmpeg สร้างไฟล์ว่างเปล่า');
    onProgress?.(99);
    const blob = new Blob([dataBuffer], { type: mimeOf(opts.format) });
    onProgress?.(100);
    return blob;
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg === 'ABORTED' || signal?.aborted) { onProgress?.(0); throw new Error('ABORTED'); }
    onProgress?.(0); throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

// ─── FFmpeg Commands ───────────────────────────────────
async function renderVideo(ff: FFmpeg, inName: string, outName: string, opts: RenderOptions, signal?: AbortSignal) {
  const args: string[] = [];
  if (opts.trimStart !== undefined && opts.trimStart > 0) args.push('-ss', String(opts.trimStart));
  if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) args.push('-to', String(opts.trimEnd));
  args.push('-i', inName);

  // ⭐ 'FontFile' ไม่ใช่ field ที่ libass รู้จักใน force_style (ไม่อยู่ใน V4+ Style spec)
  // ต้องใช้ option `fontsdir` ของ subtitles filter แทน เพื่อบอกว่าฟอนต์ที่เขียนไว้ใน VFS
  // (ตอน pre-load ด้านบน) อยู่ที่ไหน — ถ้าไม่มีบรรทัดนี้ libass จะหาฟอนต์ไม่เจอเลยสักตัว
  // เพราะ core build ของ ffmpeg.wasm ไม่มี fontconfig/ระบบฟอนต์ให้พึ่งพา
  args.push('-vf', `subtitles=subs.ass:fontsdir=${FONT_VFS_DIR}`);
  args.push(...codecArgs(opts.format, opts.quality, opts.useHardwareAccel), '-c:a', 'copy', '-movflags', '+faststart', '-y', outName);
  await execWithAbort(ff, args, signal);
}

async function renderGif(ff: FFmpeg, inName: string, outName: string, opts: RenderOptions, signal?: AbortSignal) {
  const paletteName = 'palette.png';
  const fps = Math.max(5, Math.round(opts.fps / (opts.gifFrameSkip + 1)));
  const scale = `scale=${opts.gifMaxWidth}:-1:flags=lanczos`;
  const trimFilter = (opts.trimStart !== undefined || opts.trimEnd !== undefined)
    ? `trim=${opts.trimStart ?? 0}:${opts.trimEnd ?? 9999},setpts=PTS-STARTPTS,` : '';
  // ⭐ ใช้ fontsdir แทน force_style FontFile (ดูเหตุผลใน renderVideo ด้านบน)
  const subF = `subtitles=subs.ass:fontsdir=${FONT_VFS_DIR}`;
  try {
    const pa: string[] = [];
    if (opts.trimStart !== undefined && opts.trimStart > 0) pa.push('-ss', String(opts.trimStart));
    if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) pa.push('-to', String(opts.trimEnd));
    pa.push('-i', inName, '-vf', `${trimFilter}${scale},${subF},palettegen=stats_mode=diff`, '-y', paletteName);
    await execWithAbort(ff, pa, signal);

    const ga: string[] = [];
    if (opts.trimStart !== undefined && opts.trimStart > 0) ga.push('-ss', String(opts.trimStart));
    if (opts.trimEnd !== undefined && opts.trimEnd > (opts.trimStart ?? 0)) ga.push('-to', String(opts.trimEnd));
    ga.push('-i', inName, '-i', paletteName);
    ga.push('-lavfi', `${trimFilter}${scale},${subF} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`);
    ga.push('-r', String(fps), '-y', outName);
    await execWithAbort(ff, ga, signal);
  } finally {
    await ff.deleteFile(paletteName).catch(() => {});
  }
}

// ─── Codec Helpers ─────────────────────────────────────
function codecArgs(format: ExportFormat, quality: QualityPreset, hwAccel: boolean): string[] {
  if (format === 'gif') return [];
  const crf = format === 'webm' ? VP9_CRF_MAP[quality] : CRF_MAP[quality];
  const baseH264 = ['-c:v', hwAccel ? 'h264_videotoolbox' : 'libx264', '-preset', quality === 'best' ? 'slow' : quality === 'fast' ? 'veryfast' : 'ultrafast'];
  if (hwAccel) baseH264.push('-b:v', String(bitrateForQuality(quality)));
  else baseH264.push('-crf', String(crf));
  baseH264.push('-pix_fmt', 'yuv420p');
  if (format === 'webm') return ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-cpu-used', quality === 'fast' ? '4' : '2'];
  return baseH264;
}

function bitrateForQuality(quality: QualityPreset): number {
  switch (quality) { case 'best': return 8000; case 'high': return 5000; case 'medium': return 3000; case 'fast': return 1500; }
}

function extOf(format: ExportFormat): string {
  switch (format) { case 'mp4': return 'mp4'; case 'webm': return 'webm'; case 'mov': return 'mov'; case 'gif': return 'gif'; }
}

function mimeOf(format: ExportFormat): string {
  switch (format) { case 'mp4': return 'video/mp4'; case 'webm': return 'video/webm'; case 'mov': return 'video/quicktime'; case 'gif': return 'image/gif'; }
}

// ─── ASS Builder ───────────────────────────────────────
function buildAss(subs: SubtitleEntry[], opts: RenderOptions): string {
  const l: string[] = [];
  l.push('[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 360', 'ScaledBorderAndShadow: yes', '');
  l.push('[V4+ Styles]');
  l.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');
  
  const fontName = opts.fontFamily;

  // DEBUG: Force top-left alignment (7) and zero margins
  l.push(`Style: bottom,${fontName},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,7,0,0,0,1`);
  l.push(`Style: top,${fontName},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,7,0,0,0,1`);
  l.push(`Style: middle,${fontName},${opts.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,7,0,0,0,1`);
  l.push('', '[Events]');
  l.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
  subs.forEach((s) => {
    if (s.segments && s.segments.length > 0) {
      const assText = s.segments.map((seg) => segmentToAss(seg, opts.fontFamily, opts.fontSize)).join('');
      const pos = s.position || 'bottom';
      // DEBUG: Force top-left position by setting MarginV to 0 (style handles alignment)
      const marginV = 0;
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},${pos},,0,0,${marginV},,${assText}`);
    } else {
      const pos = s.position || 'bottom';
      // DEBUG: Force top-left position by setting MarginV to 0 (style handles alignment)
      const marginV = 0;
      l.push(`Dialogue: 0,${fmt(s.start)},${fmt(s.end)},${pos},,0,0,${marginV},,${s.text.replace(/\n/g, '\\N')}`);
    }
  });
  return l.join('\n');
}

function segmentToAss(seg: TextSegment, fallbackFontFamily: string, fallbackFontSize: number): string {
  const st = seg.style;
  const tags: string[] = [];
  
  const segFont = st.fontFamily || fallbackFontFamily;
  tags.push(`\fn${segFont}`);

  const segSize = st.fontSize || fallbackFontSize;
  if (segSize !== fallbackFontSize) tags.push(`\fs${segSize}`);
  tags.push(`\c${hexToAssColor(st.color)}`);
  // DEBUG: Remove alpha override to rely on style's PrimaryColour alpha.
  // tags.push(`\alpha&H${Math.round((1 - st.opacity) * 255).toString(16).padStart(2, '0').toUpperCase()}&`);
  const isBold = st.fontWeight === 'bold' || st.fontWeight === 'bold-italic';
  const isItalic = st.fontWeight === 'italic' || st.fontWeight === 'bold-italic';
  tags.push(`\b${isBold ? '1' : '0'}`, `\i${isItalic ? '1' : '0'}`);
  const isStrokeActive = st.strokeActive !== undefined ? st.strokeActive : true;
  if (isStrokeActive && st.strokeWidth > 0 && st.strokeOpacity > 0) {
    tags.push(`\bord${st.strokeWidth}`, `\3c${hexToAssColor(st.strokeColor)}`);
    tags.push(`\3a&H${Math.round((1 - st.strokeOpacity) * 255).toString(16).padStart(2, '0').toUpperCase()}&`);
  } else tags.push('\bord0');
  const isShadowActive = st.shadowActive !== undefined ? st.shadowActive : true;
  if (isShadowActive && st.shadowOpacity > 0 && (st.shadowBlur > 0 || st.shadowOffsetX !== 0 || st.shadowOffsetY !== 0)) {
    const shadowDist = Math.max(1, Math.abs(st.shadowOffsetY));
    tags.push(`\shad${shadowDist}`, `\4c${hexToAssColor(st.shadowColor)}`);
    tags.push(`\4a&H${Math.round((1 - st.shadowOpacity) * 255).toString(16).padStart(2, '0').toUpperCase()}&`);
  } else tags.push('\shad0');
  return `{${tags.join('')}}${escapeAssText(seg.text)}`;
}

function hexToAssColor(hex: string): string {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  return `&H${c.substring(4, 6)}${c.substring(2, 4)}${c.substring(0, 2)}&`;
}

function escapeAssText(text: string): string {
  return text.replace(/\n/g, '\N').replace(/\{/g, '\{').replace(/\}/g, '\}').replace(/\|/g, '\|');
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(1, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(Math.round((s % 1) * 100)).padStart(2, '0')}`;
}

// ─── Helpers ───────────────────────────────────────────
export function downloadVideoBlob(blob: Blob, filename: string = 'subzeed-video.mp4') {
  const key = `download_count_${filename}`;
  let count = 0;
  try { count = parseInt(localStorage.getItem(key) || '0', 10); } catch {}
  let finalName = filename;
  if (count > 0) {
    const dotIdx = filename.lastIndexOf('.');
    finalName = dotIdx > 0 ? `${filename.substring(0, dotIdx)} (${count})${filename.substring(dotIdx)}` : `${filename} (${count})`;
  }
  try { localStorage.setItem(key, String(count + 1)); } catch {}
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = finalName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function supportsHardwareAccel(): boolean { return false; }

export const EXPORT_FORMATS = [
  { value: 'mp4' as ExportFormat, label: 'MP4 (H.264)', mime: 'video/mp4' },
  { value: 'webm' as ExportFormat, label: 'WebM (VP9)', mime: 'video/webm' },
  { value: 'mov' as ExportFormat, label: 'MOV (H.264)', mime: 'video/quicktime' },
  { value: 'gif' as ExportFormat, label: 'GIF', mime: 'image/gif' },
];

export const QUALITY_PRESETS = [
  { value: 'best' as QualityPreset, label: 'ดีที่สุด', desc: 'CRF 18, ช้าที่สุด' },
  { value: 'high' as QualityPreset, label: 'สูง', desc: 'CRF 23, สมดุล' },
  { value: 'medium' as QualityPreset, label: 'ปานกลาง', desc: 'CRF 28, ไฟล์เล็ก' },
  { value: 'fast' as QualityPreset, label: 'เร็ว', desc: 'CRF 35, เหมาะ preview' },
];
