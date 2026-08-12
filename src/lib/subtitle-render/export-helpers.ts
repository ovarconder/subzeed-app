// ============================================================
// 🎨 Subtitle Render Module — Export Helpers
// ============================================================
// utilities ด้าน export ที่ UI ใช้ (format/quality presets,
// การตรวจ hardware accel, และการดาวน์โหลด blob)
//
// เดิมอยู่ที่ video-renderer.ts → ย้ายมาให้อยู่กับ module render
// ============================================================

import type { RenderFormat, QualityPreset } from './types';

// ─── ตัวเลือก Format ────────────────────────────────────
export const EXPORT_FORMATS: { value: RenderFormat; label: string; mime: string }[] = [
  { value: 'mp4', label: 'MP4 (H.264)', mime: 'video/mp4' },
  { value: 'webm', label: 'WebM (VP9)', mime: 'video/webm' },
  { value: 'mov', label: 'MOV (H.264)', mime: 'video/quicktime' },
  { value: 'gif', label: 'GIF', mime: 'image/gif' },
];

// ─── ตัวเลือก Quality ───────────────────────────────────
export const QUALITY_PRESETS: { value: QualityPreset; label: string; desc: string }[] = [
  { value: 'best', label: 'ดีที่สุด', desc: 'CRF 18, ช้าที่สุด' },
  { value: 'high', label: 'สูง', desc: 'CRF 23, สมดุล' },
  { value: 'medium', label: 'ปานกลาง', desc: 'CRF 28, ไฟล์เล็ก' },
  { value: 'fast', label: 'เร็ว', desc: 'CRF 35, เหมาะ preview' },
];

// ─── Hardware Accel ─────────────────────────────────────
// ffmpeg.wasm บน browser ไม่มี hw accel จริง → คืน false เสมอ
// (เดิม video-renderer.ts supportHardwareAccel() คืน false เหมือนกัน)
export function supportsHardwareAccel(): boolean {
  return false;
}

// ─── Download Helper ────────────────────────────────────
// บันทึก blob ลงเครื่อง พร้อมกันหลายไฟล์ชื่อซ้ำ (เติม (n) ท้ายชื่อ)
export function downloadVideoBlob(blob: Blob, filename: string = 'subzeed-video.mp4') {
  const key = `download_count_${filename}`;
  let count = 0;
  try { count = parseInt(localStorage.getItem(key) || '0', 10); } catch { /* ignore */ }
  let finalName = filename;
  if (count > 0) {
    const dotIdx = filename.lastIndexOf('.');
    finalName = dotIdx > 0
      ? `${filename.substring(0, dotIdx)} (${count})${filename.substring(dotIdx)}`
      : `${filename} (${count})`;
  }
  try { localStorage.setItem(key, String(count + 1)); } catch { /* ignore */ }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
