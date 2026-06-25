// ============================================================
// 📦 TYPES & INTERFACES — SubZeed
// ============================================================

// --- Subscription Tiers ---
export type SubscriptionTier = 'free' | 'basic' | 'premium' | 'business_starter' | 'business_pro';

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
};

// --- Subtitle Entry ---
export interface SubtitleEntry {
  id: string;
  start: number; // seconds
  end: number;
  text: string;
  position: 'bottom' | 'top' | 'middle';
  y_offset: number; // 0-100 percent
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
