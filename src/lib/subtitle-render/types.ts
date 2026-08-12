// ============================================================
// 🎨 Subtitle Render Module — Types
// ============================================================
// เก็บ type & interface ทั้งหมดของโมดูล render เท่านั้น
// ไม่มี business logic ใด ๆ ทั้งสิ้น
// ============================================================

// ─── Font Weight ────────────────────────────────────────
export type FontWeight = 'normal' | 'bold' | 'italic' | 'bold-italic';

// ─── ตำแหน่งข้อความบนจอ ─────────────────────────────────
export type SubtitlePosition = 'bottom' | 'top' | 'middle';

// ─── Style ของข้อความแต่ละ segment (หลาย segment ต่อบรรทัดได้) ──
// ครอบคลุม parameter ที่ UI (SegmentStyleEditor) ใช้อยู่จริง
export interface SubtitleSegmentStyle {
  /** เปิด/ปิด stroke */
  strokeActive: boolean;
  /** เปิด/ปิด text shadow */
  shadowActive: boolean;
  /** สีข้อความ (hex, rgba, หรือชื่อสี) */
  color: string;
  /** ความทึบของข้อความ 0-1 */
  opacity: number;
  /** สีของ Stroke (ขอบ) */
  strokeColor: string;
  /** ความหนาของ Stroke (0 = ไม่มี) */
  strokeWidth: number;
  /** ความทึบของ Stroke 0-1 */
  strokeOpacity: number;
  /** สีเงา */
  shadowColor: string;
  /** ความทึบเงา 0-1 */
  shadowOpacity: number;
  /** ระยะห่างเงาแกน X (px) */
  shadowOffsetX: number;
  /** ระยะห่างเงาแกน Y (px) */
  shadowOffsetY: number;
  /** รัศมีเบลอเงา (px) */
  shadowBlur: number;
  /** องศาเงา (0-360) — ใช้คำนวณ offsetX/offsetY ถ้าต้องการ */
  shadowAngle: number;
  /** รูปแบบตัวหนา/เอียง */
  fontWeight: FontWeight;
  /** ชื่อฟอนต์ (แยกจาก global fontFamily ของ subtitle) */
  fontFamily?: string;
  /** ขนาดฟอนต์ (px) ถ้าไม่ระบุใช้ global fontSize */
  fontSize?: number;
}

// ─── Style ของกล่องแสดงผล (background, padding, box shadow) ──
// ครอบคลุม SubtitleDisplayStyle ที่ UI มีอยู่จริง
export interface SubtitleBoxStyle {
  /** เปิด/ปิด พื้นหลัง */
  bgActive: boolean;
  /** ความทึบของพื้นหลัง 0-1 (0 = โปร่งใส ไม่มี BG) */
  bgOpacity: number;
  /** สีพื้นหลัง (hex) */
  bgColor: string;
  /** รัศมีมุมโค้ง (px) */
  borderRadius: number;
  /** Padding แนวตั้ง (px) */
  paddingY: number;
  /** Padding แนวนอน (px) */
  paddingX: number;
  /** เงาของกล่อง subtitle (offsetX, offsetY, blur, color, opacity) */
  boxShadow: {
    /** เปิด/ปิด box shadow */
    active: boolean;
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    color: string;
    opacity: number;
  };
}

// ─── Style Params ครอบคลุมทั้งหมดที่ user ปรับได้ ────────
export interface SubtitleStyleParams {
  /** ชื่อฟอนต์หลักของทั้งโปรเจกต์ (ตรงกับ font.value ใน ALL_FONTS) */
  fontFamily: string;
  /** ขนาดฟอนต์หลัก (px) */
  fontSize: number;
  /** ตำแหน่งข้อความบนจอ */
  position: SubtitlePosition;
  /** Y-offset เปอร์เซ็นต์ (0-100) ใช้ขยับความสูง */
  y_offset: number;
  /** Style ของ box / background / padding */
  box?: SubtitleBoxStyle;
  /** Style เริ่มต้นของ segment (ใช้เมื่อ cue ไม่มี style override) */
  defaultSegmentStyle?: SubtitleSegmentStyle;
}

// ─── ข้อมูลแต่ละบรรทัด (cue) ในซับไตเติล ────────────────
export interface SubtitleCue {
  /** เวลาเริ่มต้น (วินาที) */
  start: number;
  /** เวลาสิ้นสุด (วินาที) */
  end: number;
  /** ข้อความต้นฉบับ (plain text) — fallback */
  text: string;
  /** ข้อความแยก segment พร้อม style ต่อ segment (ถ้ามี) */
  segments?: SubtitleCueSegment[];
  /** ตำแหน่งเฉพาะบรรทัด (ถ้าไม่ระบุ ใช้ของ global) */
  position?: SubtitlePosition;
  /** Y-offset เฉพาะบรรทัด (ถ้าไม่ระบุ ใช้ของ global) */
  y_offset?: number;
  /** Box / background style เฉพาะบรรทัด (ถ้าไม่ระบุ ใช้ของ global `style.box`) */
  displayStyle?: SubtitleBoxStyle;
}

// ─── Segment ย่อยในบรรทัดหนึ่ง (หลายสี/สไตล์ในบรรทัดเดียว) ─
export interface SubtitleCueSegment {
  text: string;
  style?: Partial<SubtitleSegmentStyle>;
}

// ─── Output Format ──────────────────────────────────────
export type RenderFormat = 'mp4' | 'webm' | 'mov' | 'gif';
export type QualityPreset = 'best' | 'high' | 'medium' | 'fast';

// ─── Config ครอบคลุมทั้ง job ของ render ─────────────────
export interface RenderJobConfig {
  /** ไฟล์วิดีโอต้นทาง (Blob หรือ URL) */
  videoSource: Blob | string;
  /** รายการ cue ทั้งหมด */
  cues: SubtitleCue[];
  /** Style params ทั้งหมด */
  style: SubtitleStyleParams;
  /** Output settings */
  output: {
    format: RenderFormat;
    quality: QualityPreset;
    fps: number;
    /** ใช้ hardware acceleration (ถ้า browser รองรับ) */
    useHardwareAccel: boolean;
    /** สำหรับ GIF เท่านั้น */
    gifMaxWidth: number;
    gifFrameSkip: number;
  };
  /** ตัดวิดีโอเฉพาะช่วง (วินาที) */
  trimStart?: number;
  trimEnd?: number;
}

// ─── Progress Event ─────────────────────────────────────
export type RenderStage =
  | 'init'
  | 'validate-fonts'
  | 'build-ass'
  | 'load-ffmpeg'
  | 'write-files'
  | 'exec'
  | 'read-output'
  | 'done'
  | 'error';

export interface RenderProgressEvent {
  /** stage ปัจจุบัน */
  stage: RenderStage;
  /** เปอร์เซ็นต์ 0-100 */
  percent: number;
  /** ข้อความสถานะ (ภาษาไทย) สำหรับแสดง UI */
  message: string;
}
