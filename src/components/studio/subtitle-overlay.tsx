'use client';

import { useEffect, useRef, useState } from 'react';
import type { SubtitleEntry, SubscriptionTier } from '@/lib/types';
import { TIER_CONFIGS } from '@/lib/types';

// ============================================================
// 📺 Subtitle Overlay Component
// ============================================================
// รองรับการแสดงซับไตเติลแบบต่าง ๆ:
//   - Basic: fadeIn ปกติ
//   - Premium+: text animation (typewriter, slide, highlight)
//   - Free: แสดง watermark
// ============================================================

export type AnimationStyle = 'none' | 'fade' | 'typewriter' | 'slide' | 'highlight';

interface SubtitleOverlayProps {
  subtitle: SubtitleEntry;
  currentTime: number;
  tier: SubscriptionTier;
  animationStyle?: AnimationStyle;
  fontFamily?: string;
}

export function SubtitleOverlay({
  subtitle,
  currentTime,
  tier,
  animationStyle = 'fade',
  fontFamily,
}: SubtitleOverlayProps) {
  const tierConfig = TIER_CONFIGS[tier];
  const canAnimate = tierConfig.textAnimation;
  const actualAnimation = canAnimate ? animationStyle : 'fade';

  return (
    <div
      className="subtitle-overlay"
      style={{ bottom: `${subtitle.y_offset}%` }}
    >
      <AnimatedText
        text={subtitle.text}
        animation={actualAnimation}
        fontFamily={fontFamily || tierConfig.fonts[0] || 'Arial'}
        isActive={currentTime >= subtitle.start && currentTime <= subtitle.end}
      />
    </div>
  );
}

// ============================================================
// Animated Text ภายใน
// ============================================================

interface AnimatedTextProps {
  text: string;
  animation: AnimationStyle;
  fontFamily: string;
  isActive: boolean;
}

function AnimatedText({ text, animation, fontFamily, isActive }: AnimatedTextProps) {
  const [displayText, setDisplayText] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Typewriter Animation ──────────────────────────────
  useEffect(() => {
    if (animation !== 'typewriter' || !isActive) {
      setDisplayText(text);
      return;
    }

    let idx = 0;
    setDisplayText('');

    intervalRef.current = setInterval(() => {
      idx++;
      setDisplayText(text.slice(0, idx));
      if (idx >= text.length && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 50); // 50ms per character

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, animation, isActive]);

  // ─── Highlight Animation ───────────────────────────────
  useEffect(() => {
    if (animation !== 'highlight' || !isActive) {
      setHighlightIdx(-1);
      return;
    }

    const words = text.split(' ');
    let wordIdx = 0;

    intervalRef.current = setInterval(() => {
      setHighlightIdx(wordIdx);
      wordIdx++;
      if (wordIdx >= words.length && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 200);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, animation, isActive]);

  // ─── Slide Animation ───────────────────────────────────
  const slideClass = animation === 'slide' && isActive ? 'animate-slide-in' : '';

  if (animation === 'typewriter') {
    return (
      <span
        className={`inline-block bg-black/60 px-4 py-2 rounded-lg text-white text-xl ${slideClass}`}
        style={{ fontFamily }}
      >
        {displayText}
        {isActive && displayText.length < text.length && (
          <span className="animate-pulse">|</span>
        )}
      </span>
    );
  }

  if (animation === 'highlight') {
    const words = text.split(' ');
    return (
      <span
        className={`inline-block bg-black/60 px-4 py-2 rounded-lg text-white text-xl ${slideClass}`}
        style={{ fontFamily }}
      >
        {words.map((word, i) => (
          <span
            key={i}
            className={`transition-colors duration-200 ${
              i === highlightIdx ? 'text-primary bg-white/20 rounded px-0.5' : ''
            }`}
          >
            {word}{' '}
          </span>
        ))}
      </span>
    );
  }

  // Default: fade
  return (
    <span
      className={`inline-block bg-black/60 px-4 py-2 rounded-lg text-white text-xl ${
        isActive ? 'animate-fade-in' : ''
      } ${slideClass}`}
      style={{ fontFamily }}
    >
      {displayText || text}
    </span>
  );
}
