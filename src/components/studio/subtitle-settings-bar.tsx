'use client';

import { useState } from 'react';
import { useSubtitleStore } from '@/lib/store/subtitle-store';
import type { SubscriptionTier } from '@/lib/types';
import { TIER_CONFIGS } from '@/lib/types';
import type { AnimationStyle } from './subtitle-overlay';

interface SubtitleSettingsBarProps {
  tier: SubscriptionTier;
  fontFamily: string;
  fontSize: number;
  onFontFamilyChange: (font: string) => void;
  onFontSizeChange: (size: number) => void;
}

/** ฟอนต์มาตรฐานที่ทุก tier ใช้ได้ (Free รวม Arial) */
const STANDARD_FONTS = [
  { value: 'Arial', label: 'Arial (มาตรฐาน)' },
  { value: 'Kanit', label: 'Kanit' },
  { value: 'Itim', label: 'Itim' },
  { value: 'Chonburi', label: 'Chonburi' },
];

/** ฟอนต์พรีเมียมเฉพาะ Premium+ */
const PREMIUM_FONTS = [
  { value: 'Prompt', label: 'Prompt' },
  { value: 'Sarabun', label: 'Sarabun' },
  { value: 'Mali', label: 'Mali' },
  { value: 'Noto Sans Thai', label: 'Noto Sans Thai' },
];

const FONT_SIZES = [
  { value: 16, label: 'เล็ก' },
  { value: 20, label: 'ปกติ' },
  { value: 24, label: 'กลาง' },
  { value: 28, label: 'ใหญ่' },
  { value: 32, label: 'ใหญ่พิเศษ' },
];

const ANIMATION_STYLES: { value: AnimationStyle; label: string }[] = [
  { value: 'fade', label: 'Fade In' },
  { value: 'typewriter', label: 'พิมพ์ทีละตัว' },
  { value: 'slide', label: 'Slide' },
  { value: 'highlight', label: 'ไฮไลท์คำ' },
];

export function SubtitleSettingsBar({
  tier,
  fontFamily,
  fontSize,
  onFontFamilyChange,
  onFontSizeChange,
}: SubtitleSettingsBarProps) {
  const tierConfig = TIER_CONFIGS[tier];
  const canPremiumFonts = tierConfig.positionAdjust; // Premium+ feature
  const canAnimate = tierConfig.textAnimation;
  const store = useSubtitleStore();

  const allFonts = [
    ...STANDARD_FONTS,
    ...(canPremiumFonts ? PREMIUM_FONTS : PREMIUM_FONTS.map(f => ({ ...f, locked: true }))),
  ];

  return (
    <div className="px-3 py-2 border-b border-border bg-surface/50 flex items-center gap-3 flex-wrap">
      {/* Font Family */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-text-secondary font-medium whitespace-nowrap">ฟอนต์:</label>
        <select
          value={fontFamily}
          onChange={(e) => onFontFamilyChange(e.target.value)}
          className="rounded border border-border px-2 py-1 text-xs bg-white max-w-[110px]"
          style={{ fontFamily }}
        >
          {allFonts.map((f) => (
            <option key={f.value} value={f.value} disabled={(f as any).locked}>
              {f.label}{(f as any).locked ? ' 🔒' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Font Size */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-text-secondary font-medium whitespace-nowrap">ขนาด:</label>
        <select
          value={fontSize}
          onChange={(e) => onFontSizeChange(Number(e.target.value))}
          className="rounded border border-border px-2 py-1 text-xs bg-white"
        >
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>{s.label} ({s.value}px)</option>
          ))}
        </select>
      </div>

      {/* Position (Y-Offset) */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-text-secondary font-medium whitespace-nowrap">ตำแหน่ง:</label>
        <input
          type="range"
          min={10}
          max={95}
          value={store.selectedSubtitleId
            ? store.subtitles.find(s => s.id === store.selectedSubtitleId)?.y_offset ?? 80
            : 90
          }
          onChange={(e) => {
            const val = Number(e.target.value);
            if (store.selectedSubtitleId) {
              store.updateSubtitle(store.selectedSubtitleId, { y_offset: val });
            }
          }}
          className="w-16 h-4 accent-primary"
          title="ปรับตำแหน่งสูง-ต่ำของซับ"
        />
        <span className="text-[10px] text-text-secondary w-6">
          {store.selectedSubtitleId
            ? store.subtitles.find(s => s.id === store.selectedSubtitleId)?.y_offset ?? 80
            : 90
          }%
        </span>
      </div>

      {/* Animation (เฉพาะ Premium+) */}
      {canAnimate && (
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-text-secondary font-medium whitespace-nowrap">Animation:</label>
          <select
            className="rounded border border-border px-2 py-1 text-xs bg-white"
            // Animation style will be stored in a future setting
            defaultValue="fade"
          >
            {ANIMATION_STYLES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
      )}

      {!canAnimate && (
        <span className="text-[10px] text-text-secondary/60 italic" title="เฉพาะ Premium ขึ้นไป">
          Animation 🔒
        </span>
      )}
    </div>
  );
}
