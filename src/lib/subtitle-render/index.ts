// ============================================================
// 🎨 Subtitle Render Module — Public API (index)
// ============================================================
// จุดเดียวที่นักพัฒนาภายนอก import จากโมดูลนี้
//
//   import { renderSubtitleVideo, buildRenderConfig } from '@/lib/subtitle-render';
//
// ทำให้ UI แต่ละหน้าสะอาด ไม่ต้องรู้รายละเอียดภายใน pipeline
// และทำให้ refactor/internal เปลี่ยนได้โดยไม่กระทบผู้ใช้
// ============================================================

// ── Renderer หลัก ──────────────────────────────────────
export { renderSubtitleVideo, terminateFFmpeg } from './render-pipeline';

// ── Adapter เชื่อม UI เดิม (studio) ────────────────────
export { buildRenderConfig, studioEntriesToCues } from './adapter-studio';
export type { StudioRenderOptions } from './adapter-studio';

// ── Font Registry ──────────────────────────────────────
export {
  FONT_REGISTRY,
  DEFAULT_FONT,
  getFontEntry,
  resolveFamilyName,
  defaultFontByLocale,
  validateFonts,
  collectFontFiles,
} from './font-registry';
export type { FontRegistryEntry } from './font-registry';

// ── Export Helpers (ที่ UI ใช้ตอน export) ─────────────
export {
  EXPORT_FORMATS,
  QUALITY_PRESETS,
  supportsHardwareAccel,
  downloadVideoBlob,
} from './export-helpers';

// ── Types ──────────────────────────────────────────────
export type {
  RenderJobConfig,
  RenderProgressEvent,
  RenderStage,
  RenderFormat,
  QualityPreset,
  SubtitleCue,
  SubtitleCueSegment,
  SubtitleStyleParams,
  SubtitleSegmentStyle,
  SubtitleBoxStyle,
  SubtitlePosition,
  FontWeight,
} from './types';
