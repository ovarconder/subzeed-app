// ============================================================
// 📦 TYPES & INTERFACES — SubZeed
// ============================================================

// --- Subscription Tiers ---
export type SubscriptionTier = 'free' | 'basic' | 'premium' | 'business_starter' | 'business_pro' | 'unlimited';

export interface TierConfig {
  name: string;
  price: number;
  quotaMinutes: number;
  maxVideoMinutes: number;
  watermark: boolean;
  fonts: string[];
  aiVocabulary: boolean;
  positionAdjust: boolean;
  textAnimation: boolean;
  teamSeats: number;
  clientReview: boolean;
  invoiceDownload: boolean;
}

export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: 'Free',
    price: 0,
    quotaMinutes: 20,
    maxVideoMinutes: 3,
    watermark: true,
    fonts: ['Arial'],
    aiVocabulary: false,
    positionAdjust: false,
    textAnimation: false,
    teamSeats: 1,
    clientReview: false,
    invoiceDownload: false,
  },
  basic: {
    name: 'Basic',
    price: 89,
    quotaMinutes: 120,
    maxVideoMinutes: 15,
    watermark: false,
    fonts: ['Kanit', 'Itim', 'Chonburi'],
    aiVocabulary: false,
    positionAdjust: false,
    textAnimation: false,
    teamSeats: 1,
    clientReview: false,
    invoiceDownload: false,
  },
  premium: {
    name: 'Premium',
    price: 169,
    quotaMinutes: 300,
    maxVideoMinutes: 60,
    watermark: false,
    fonts: ['Kanit', 'Itim', 'Chonburi', 'Prompt', 'Sarabun'],
    aiVocabulary: true,
    positionAdjust: true,
    textAnimation: true,
    teamSeats: 1,
    clientReview: false,
    invoiceDownload: false,
  },
  business_starter: {
    name: 'Business Starter',
    price: 899,
    quotaMinutes: 1200,
    maxVideoMinutes: 30,
    watermark: false,
    fonts: ['Kanit', 'Itim', 'Chonburi', 'Prompt', 'Sarabun'],
    aiVocabulary: true,
    positionAdjust: true,
    textAnimation: true,
    teamSeats: 2,
    clientReview: false,
    invoiceDownload: false,
  },
  business_pro: {
    name: 'Business Pro',
    price: 1299,
    quotaMinutes: 2500,
    maxVideoMinutes: 999,
    watermark: false,
    fonts: ['Kanit', 'Itim', 'Chonburi', 'Prompt', 'Sarabun', 'Mali', 'Noto Sans Thai'],
    aiVocabulary: true,
    positionAdjust: true,
    textAnimation: true,
    teamSeats: 5,
    clientReview: true,
    invoiceDownload: true,
  },
  unlimited: {
    name: 'Unlimited',
    price: 0,
    quotaMinutes: 999999, // ไม่จำกัด
    maxVideoMinutes: 999,   // ไม่จำกัด
    watermark: false,
    fonts: ['Kanit', 'Itim', 'Chonburi', 'Prompt', 'Sarabun', 'Mali', 'Noto Sans Thai'],
    aiVocabulary: true,
    positionAdjust: true,
    textAnimation: true,
    teamSeats: 999,
    clientReview: true,
    invoiceDownload: true,
  },
};

// ============================================================
// 🎨 STYLE & TEXT SEGMENT TYPES — รองรับหลายสีในบรรทัดเดียว
// ============================================================

/** Font weight options */
export type FontWeight = 'normal' | 'bold' | 'italic' | 'bold-italic';

/** Style for a single text segment (ส่วนย่อยของข้อความ) */
export interface TextSegmentStyle {
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
}

/** หนึ่ง segment ในบรรทัดข้อความ */
export interface TextSegment {
  id: string;
  text: string;
  style: TextSegmentStyle;
}

/** ค่าเริ่มต้นของ TextSegmentStyle */
export const DEFAULT_SEGMENT_STYLE: TextSegmentStyle = {
  color: '#FFFFFF',
  opacity: 1,
  strokeColor: '#000000',
  strokeWidth: 2,
  strokeOpacity: 1,
  shadowColor: '#000000',
  shadowOpacity: 0.5,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  shadowBlur: 4,
  shadowAngle: 0,
  fontWeight: 'normal',
};

/** Helper: แปลง segments → plain text */
export function segmentsToText(segments: TextSegment[]): string {
  return segments.map(s => s.text).join('');
}

/** Helper: สร้าง segments จากข้อความ plain (fallback) */
export function textToSegments(id: string, text: string): TextSegment[] {
  return [{
    id: `${id}-seg-0`,
    text,
    style: { ...DEFAULT_SEGMENT_STYLE },
  }];
}

// ============================================================
// 🎬 SUBTITLE DISPLAY STYLE — Background, Padding, Shadow ของซับบนวิดีโอ
// ============================================================

/** รูปแบบการแสดงผลของซับไตเติลบนวิดีโอ (ทั้งบรรทัด) */
export interface SubtitleDisplayStyle {
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

/** ค่าเริ่มต้นของ SubtitleDisplayStyle */
export const DEFAULT_DISPLAY_STYLE: SubtitleDisplayStyle = {
  bgActive: true,
  bgOpacity: 0.6,
  bgColor: '#000000',
  borderRadius: 6,
  paddingY: 6,
  paddingX: 12,
  boxShadow: {
    active: false,
    offsetX: 0,
    offsetY: 0,
    blur: 0,
    spread: 0,
    color: '#000000',
    opacity: 0,
  },
};

// --- Subtitle Entry (ขยาย) ---
export interface SubtitleEntry {
  id: string;
  start: number; // seconds
  end: number;
  text: string; // plain text (fallback / legacy)
  segments: TextSegment[]; // NEW: รองรับหลายสีหลายสไตล์
  position: 'bottom' | 'top' | 'middle';
  y_offset: number; // 0-100 percent
  /** รูปแบบการแสดงผลของซับนี้ (ถ้าไม่ระบุ ใช้ค่าเริ่มต้นของโปรเจกต์) */
  displayStyle?: SubtitleDisplayStyle;
}

// --- Project ---
export interface Project {
  id: string;
  user_id: string;
  title: string;
  video_url: string | null;
  duration_seconds: number;
  subtitles: SubtitleEntry[];
  is_client_review_enabled: boolean;
  review_token: string | null;
  created_at: string;
  updated_at: string;
}

// --- Profile (User) ---
export interface Profile {
  id: string;
  email: string;
  phone_number: string | null;
  tier: SubscriptionTier;
  is_super_admin?: boolean;
  is_quota_abuser?: boolean;
  quota_minutes_total: number;
  quota_minutes_used: number;
  billing_cycle_start: string;
  billing_cycle_end: string;
  workspace_owner_id: string | null;
  created_at: string;
  updated_at: string;
}

// --- Billing ---
export type BillingActionType = 'subscribe' | 'renew_early' | 'recurring' | 'cancel' | 'refund';

export interface BillingHistory {
  id: string;
  user_id: string;
  action_type: BillingActionType;
  previous_tier: SubscriptionTier;
  new_tier: SubscriptionTier;
  amount_thb: number;
  invoice_number: string | null;
  billing_cycle_start: string;
  billing_cycle_end: string;
  payment_status: string;
  created_at: string;
}

// --- Quota Log ---
export type QuotaLogType = 'stt_transcription' | 'renew_reset' | 'admin_adjustment';

export interface QuotaActivityLog {
  id: string;
  user_id: string;
  project_id: string | null;
  log_type: QuotaLogType;
  minutes_changed: number;
  quota_minutes_used_snapshot: number;
  description: string | null;
  created_at: string;
}

// --- Stripe ---
export interface StripePrice {
  id: string;
  tier: SubscriptionTier;
  priceId: string;
  amount: number;
}

// ============================================================
// 🎛️ API PROVIDER TYPES — Dynamic Provider Config
// ============================================================

/** Supported STT providers */
export type SttProvider = 'openai' | 'groq';

/** Supported LLM providers */
export type LlmProvider = 'openai' | 'gemini' | 'groq';

/** API provider entry (from DB) */
export interface ApiProvider {
  id: string;
  service_type: 'stt' | 'llm';
  provider: SttProvider | LlmProvider;
  model: string;
  api_key_encrypted: string | null;
  is_active: boolean;
  label: string | null;
  created_at: string;
  updated_at: string;
}

/** Sanitized provider info (no key) for client-side display */
export interface ApiProviderInfo {
  id: string;
  service_type: 'stt' | 'llm';
  provider: string;
  model: string;
  is_active: boolean;
  label: string | null;
  has_key: boolean;
  updated_at: string;
}

/** Payload for saving API provider settings */
export interface ApiProviderPayload {
  service_type: 'stt' | 'llm';
  provider: string;
  model: string;
  api_key?: string; // plaintext from form → encrypted server-side
  is_active?: boolean;
}

/** Supported model options per provider */
export const STT_PROVIDER_OPTIONS: Record<SttProvider, { label: string; models: string[] }> = {
  openai: {
    label: 'OpenAI Whisper',
    models: ['whisper-1'],
  },
  groq: {
    label: 'Groq Whisper',
    models: ['whisper-large-v3', 'whisper-large-v3-turbo'],
  },
};

export const LLM_PROVIDER_OPTIONS: Record<LlmProvider, { label: string; models: string[] }> = {
  openai: {
    label: 'OpenAI',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  },
  gemini: {
    label: 'Google Gemini',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
  },
  groq: {
    label: 'Groq',
    models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'mixtral-8x7b-32768'],
  },
};
