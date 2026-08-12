// ============================================================

// 🎨 Subtitle Render Module — Render Pipeline
// ============================================================
// Orchestrator: เรียงลำดับการทำงานทั้งหมด
//   1. validate fonts + เตรียมรายชื่อ font
//   2. build ass string
//   3. load ffmpeg instance
//   4. write video input + ass + fonts เข้า VFS
//   5. build ffmpeg command
//   6. exec + progress
//   7. read output + cleanup VFS
//
// ไฟล์นี้สั้นและอ่านง่าย มีหน้าที่แค่เรียง step
// ไม่มี business logic ของตัวเอง
// ============================================================

import { fetchFile } from '@ffmpeg/util';
import { api } from '@/lib/api';
import type { RenderJobConfig, RenderProgressEvent, RenderStage } from './types';
import { buildAss } from './ass-builder';
import { validateFonts, collectFontFiles, fontVfsPath } from './font-registry';
import { getFFmpeg, terminateFFmpeg } from './ffmpeg-loader';
import { buildVideoCommand, buildGifCommands } from './ffmpeg-command';

// ─── Config ────────────────────────────────────────────
// เขียน font ลง /fonts แล้วชี้ fontsdir=/fonts (มีเฉพาะ .ttf)
// ไม่ชี้ root '/' เพราะ libass scan เจอไฟล์อื่นปน → FS error
const FONT_VFS_DIR = '/fonts';
const ASS_VFS_NAME = 'subs.ass';

// ─── Helper: emit progress ─────────────────────────────
type ProgressFn = (e: RenderProgressEvent) => void;

function emit(
  onProgress: ProgressFn | undefined,
  stage: RenderStage,
  percent: number,
  message: string,
) {
  onProgress?.({ stage, percent, message });
}

/**
 * รัน ff.exec() ให้ยกเลิกได้จริงเมื่อ abort signal ถูกสั่ง
 *
 * @param run      closure ที่เรียก ff.exec(...) ของงานนั้น
 * @param signal   AbortSignal — ถ้ามีและ abort → terminate instance + reset singleton + throw ABORTED
 * @param onKill   callback ใช้ reset global ffmpeg singleton (เรียกที่ import จาก loader)
 */
async function execWithAbort(
  run: () => Promise<void>,
  signal: AbortSignal | undefined,
  onKill: () => void,
): Promise<void> {
  if (signal?.aborted) throw new Error('ABORTED');

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      // ยุติ instance + reset singleton → ครั้งต่อไปจะ load ใหม่
      onKill();
      reject(new Error('ABORTED'));
    };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });

    run()
      .then(() => { if (!settled) { settled = true; resolve(); } })
      .catch((err) => {
        if (!settled) {
          settled = true;
          reject((err?.message === 'ABORTED' || signal?.aborted) ? new Error('ABORTED') : err);
        }
      })
      .finally(() => { signal?.removeEventListener('abort', onAbort); });
  });
}

/**
 * เรนเดอร์วิดีโอฝังซับ → คืน as Blob
 *
 * @param config     config ของงาน render
 * @param onProgress callback รับ progress
 * @param signal     (optional) AbortSignal — ใช้ยกเลิกการ render
 */
export async function renderSubtitleVideo(
  config: RenderJobConfig,
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<Blob> {
  const { style, cues, output } = config;

  // helper: ออกทันทีถ้าถูก abort
  const checkAborted = () => {
    if (signal?.aborted) throw new Error('ABORTED');
  };
  checkAborted();

  // ─── 1. Validate + เตรียม font ──────────────────────
  emit(onProgress, 'validate-fonts', 2, 'กำลังตรวจสอบฟอนต์...');
  const fontIssues: string[] = [];
  const problems = validateFonts(style, cues, (issue) => {
    console.warn('[render] Font issue:', issue.message);
    fontIssues.push(issue.message);
  });
  if (problems.length > 0) {
    throw new Error(`ฟอนต์ที่ใช้ไม่พร้อม: ${problems.join(', ')} — ${fontIssues.join(' | ')}`);
  }
  const fontFiles = collectFontFiles(style, cues);
  emit(onProgress, 'validate-fonts', 5, `ตรวจพบฟอนต์ ${fontFiles.length} ตัว`);

  // ─── 2. Build ASS ───────────────────────────────────
  emit(onProgress, 'build-ass', 8, 'กำลังสร้างไฟล์ซับไตเติล...');
  const ass = buildAss(style, cues);
  console.log('[render] ASS built, length:', ass.length);

  // ─── 3. Load ffmpeg ─────────────────────────────────
  emit(onProgress, 'load-ffmpeg', 12, 'กำลังโหลด FFmpeg...');
  const ff = await getFFmpeg();
  emit(onProgress, 'load-ffmpeg', 18, 'FFmpeg พร้อมใช้งาน');

  // ─── 4. Write VFS ───────────────────────────────────
  emit(onProgress, 'write-files', 22, 'กำลังเขียนไฟล์เข้า FFmpeg...');
  const ext = config.output.format === 'gif' ? 'mp4' : config.output.format;
  const inName = `input.${ext}`;
  const outName = `output.${config.output.format}`;

  // 4a. สร้างโฟลเดอร์ /fonts — ตรวจด้วย listDir ก่อน (หลีกเลี่ยง createDir ซ้ำ)
  //     ⭐ createDir กับ dir ที่มีอยู่แล้ว (reuse singleton) จะ throw
  //        ErrnoError: FS error → ตรวจก่อนสร้างเฉพาะถ้ายังไม่มี
  const rootNodes = await ff.listDir('/').catch(() => []);
  const hasFontsDir = Array.isArray(rootNodes) && rootNodes.some((n) => n.isDir && n.name === 'fonts');
  if (!hasFontsDir) {
    await ff.createDir(FONT_VFS_DIR).catch(() => {});
  }

  // 4b. เขียนวิดีโอ input
  const videoData = typeof config.videoSource === 'string'
    ? await (await fetch(config.videoSource)).blob()
    : config.videoSource;
  await ff.writeFile(inName, await fetchFile(videoData));

  // 4c. เขียน ASS
  await ff.writeFile(ASS_VFS_NAME, new TextEncoder().encode(ass));

  // 4d. เขียนเฉพาะ fonts ที่ job นี้ใช้จริง (ลง /fonts/<name>)
  for (const font of fontFiles) {
    const vfsPath = fontVfsPath(font.vfsName);
    const isRemote = font.source.startsWith('http');
    // ⭐ local font (relative path) ต้อง prefix basePath (/subzeed) ก่อน fetch
    const source = isRemote ? font.source : api(font.source);
    console.log(`[render] Writing font '${font.vfsName}' → ${vfsPath} (${isRemote ? 'remote' : 'local'})`);
    const fileData = await fetchFile(source);
    await ff.writeFile(vfsPath, fileData);
  }
  emit(onProgress, 'write-files', 30, 'เขียนไฟล์ครบ');

  // ─── 5-6. Build + exec command ──────────────────────
  emit(onProgress, 'exec', 32, 'กำลังเรนเดอร์วิดีโอ...');

  const commandOutput = {
    format: output.format,
    quality: output.quality,
    fps: output.fps,
    useHardwareAccel: output.useHardwareAccel,
    gifMaxWidth: output.gifMaxWidth,
    gifFrameSkip: output.gifFrameSkip,
    trimStart: config.trimStart,
    trimEnd: config.trimEnd,
  };

  // ── capture stderr ของ ffmpeg/libass เพื่อ debug ────
  const errLines: string[] = [];
  const onLog = ({ type, message }: { type: string; message: string }) => {
    if (type === 'stderr' || type === 'error' || type === 'warn') errLines.push(message.trim());
  };
  ff.on('log', onLog);

  // อ่านผลลัพธ์เข้าไว้ก่อน cleanup (ต้องอ่านก่อนลบไฟล์ใน finally)
  const readBytes = async (): Promise<ArrayBuffer> => {
    const read = await ff.readFile(outName);
    let buf: ArrayBuffer;
    if (read instanceof Uint8Array) {
      buf = read.buffer.slice(0) as ArrayBuffer;
    } else if (typeof read === 'string') {
      buf = new TextEncoder().encode(read).buffer as ArrayBuffer;
    } else {
      throw new Error('ไม่สามารถอ่านผลลัพธ์จาก FFmpeg ได้');
    }
    if (buf.byteLength === 0) throw new Error('FFmpeg สร้างไฟล์ว่างเปล่า');
    return buf;
  };

  let dataBuffer: ArrayBuffer | null = null;

  // ⭐ Progress real-time จาก ffmpeg (0..1) → map เป็น % ระหว่าง 32–94
  //    ทำให้ UI เห็นตัวเลขขยับระหว่าง render แทนที่จะค้างที่ 32%
  let lastPct = 0;
  const onProgressEvt = ({ progress }: { progress: number }) => {
    let p = progress;
    // progress 0..1; เวลาตัด (trim) ต้อง normalize เป็น 0..1 เอง
    p = Math.max(0, Math.min(1, p));
    const pct = Math.round(32 + p * 62); // 32% → 94%
    if (pct > lastPct && pct < 95) {     // ขยับขึ้นเรื่อย ๆ (ไม่ถอย)
      lastPct = pct;
      onProgress?.({ stage: 'exec', percent: pct, message: `กำลังเรนเดอร์ ${Math.round(p * 100)}%` });
    }
  };
  ff.on('progress', onProgressEvt);

  try {
    const runExec = (args: string[]) =>
      execWithAbort(async () => { await ff.exec(args); }, signal, terminateFFmpeg);

    if (output.format === 'gif') {
      const gifCmds = buildGifCommands(inName, ASS_VFS_NAME, FONT_VFS_DIR, outName, commandOutput);
      await runExec(gifCmds.palette);
      await runExec(gifCmds.gif);
    } else {
      const args = buildVideoCommand(inName, ASS_VFS_NAME, FONT_VFS_DIR, outName, commandOutput);
      console.log('[render] ffmpeg args:', args.join(' '));
      await runExec(args);
    }
    emit(onProgress, 'read-output', 95, 'กำลังอ่านผลลัพธ์...');
    dataBuffer = await readBytes();
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);

    // ⭐ ผู้ใช้ยกเลิก → ออกทันทีเป็น ABORTED (ยังไม่ต้องอ่าน output)
    if (raw === 'ABORTED' || signal?.aborted) {
      throw new Error('ABORTED');
    }

    // ⭐ ffmpeg.wasm บางทีจบงานแล้วแต่ throw 'Aborted()' ระหว่าง cleanup
    //    (stderr แสดง encode+mux เสร็จ Lsize=...) → ลองอ่าน output ถ้ามีไฟล์จริงให้ใช้ต่อ
    const detail = errLines.slice(-8).join(' | ');
    const hasOutput = await ff.readFile(outName).then(() => true).catch(() => false);
    if (hasOutput) {
      console.warn('[render] FFmpeg abort หลังเสร็จ แต่ output มีอยู่ — ใช้ต่อ');
      emit(onProgress, 'read-output', 95, 'เรนเดอร์เสร็จ (FFmpeg abort หลัง cleanup)');
      dataBuffer = await readBytes();
    } else {
      throw new Error(
        `FFmpeg render ล้มเหลว${detail ? ` :: ${detail}` : ''} :: ${raw}`,
      );
    }
  } finally {
    ff.off('log', onLog);
    ff.off('progress', onProgressEvt);
    // 7. Cleanup VFS — ลบไฟล์ชั่วคราวทั้งหมด (อ่านค่าไว้แล้ว)
    await Promise.allSettled([
      ff.deleteFile(inName).catch(() => {}),
      ff.deleteFile(outName).catch(() => {}),
      ff.deleteFile(ASS_VFS_NAME).catch(() => {}),
      ff.deleteFile('palette.png').catch(() => {}),
    ]);
  }

  if (!dataBuffer) throw new Error('ไม่สามารถอ่านผลลัพธ์จาก FFmpeg ได้');

  emit(onProgress, 'done', 100, 'เสร็จสิ้น');
  return new Blob([dataBuffer], { type: mimeOf(output.format) });
}

// ─── mime helper ───────────────────────────────────────
function mimeOf(format: RenderFormatOf): string {
  switch (format) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'gif': return 'image/gif';
  }
}

type RenderFormatOf = RenderJobConfig['output']['format'];

export { terminateFFmpeg };
