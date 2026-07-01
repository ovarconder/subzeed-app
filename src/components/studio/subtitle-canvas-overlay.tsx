'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { SubtitleEntry, TextSegment, TextSegmentStyle, SubscriptionTier } from '@/lib/types';
import { TIER_CONFIGS, DEFAULT_SEGMENT_STYLE } from '@/lib/types';
import { useSubtitleStore } from '@/lib/store/subtitle-store';

// ============================================================
// 📺 Subtitle Canvas Overlay Component
// ============================================================
// ใช้ Canvas ในการ render ซับไตเติลแบบ WYSIWYG
// รองรับ:
//   - หลายสี/หลายสไตล์ในบรรทัดเดียว (segments)
//   - Stroke (border) หนาบางได้
//   - Fill (สีพื้นข้อความ + opacity)
//   - Shadow (offset, blur, color, opacity)
//   - Font weight (bold, italic, bold-italic)
//   - Watermark สำหรับ Free tier
//
// Canvas coordinate system:
//   canvas.width/height = CSS px * devicePixelRatio (physical pixels)
//   แต่ ctx transform จะ scale ด้วย dpr ทำให้เราวาดโดยใช้ CSS px ได้เลย
// ============================================================

interface SubtitleCanvasOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  fontFamily: string;
  fontSize: number;
  tier: SubscriptionTier;
}

export function SubtitleCanvasOverlay({
  videoRef,
  canvasRef,
  fontFamily,
  fontSize,
  tier,
}: SubtitleCanvasOverlayProps) {
  const currentTime = useSubtitleStore((s) => s.currentTime);
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const animFrameRef = useRef<number>(0);
  const tierConfig = TIER_CONFIGS[tier];
  const showWatermark = tierConfig.watermark;

  // ─── Canvas resize handler ──────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const rect = video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, [canvasRef, videoRef]);

  // ─── Find active subtitle ──────────────────────────────
  const findActiveSubtitle = useCallback((): SubtitleEntry | null => {
    return subtitles.find(
      (s) => currentTime >= s.start && currentTime <= s.end
    ) ?? null;
  }, [subtitles, currentTime]);

  // ─── Render loop ─────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    resizeCanvas();
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(video);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;

      // reset transform → clear ทั้ง canvas (ใช้ physical pixels)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // scale → ทุกอย่างที่วาดจากนี้ใช้ CSS px
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const actualW = canvas.width / dpr;
      const actualH = canvas.height / dpr;

      const activeSub = findActiveSubtitle();

      if (activeSub) {
        const segs = activeSub.segments && activeSub.segments.length > 0
          ? activeSub.segments
          : [{ id: `${activeSub.id}-seg-0`, text: activeSub.text, style: { ...DEFAULT_SEGMENT_STYLE } }];

        drawSegments(
          ctx,
          segs,
          actualW,
          actualH,
          fontFamily,
          fontSize,
          activeSub.y_offset ?? 90,
          activeSub.position ?? 'bottom',
        );
      }

      // ─── Watermark (Free tier) ─────────────────────────
      if (showWatermark) {
        drawWatermark(ctx, actualW, actualH);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
    };
  }, [canvasRef, videoRef, fontFamily, fontSize, showWatermark, findActiveSubtitle, resizeCanvas]);

  return null; // Canvas only, no DOM output
}

// ─── Draw segments ────────────────────────────────────────

function drawSegments(
  ctx: CanvasRenderingContext2D,
  segments: TextSegment[],
  actualW: number,
  actualH: number,
  fontFamily: string,
  fontSize: number,
  yOffset: number,
  position: 'bottom' | 'top' | 'middle',
) {
  // ─── Calculate total width for centering ──────────────
  let totalWidth = 0;
  const metrics: { width: number; style: TextSegmentStyle; text: string }[] = [];

  for (const seg of segments) {
    const style = seg.style;
    ctx.font = buildFontString(style.fontWeight, fontSize, fontFamily);
    const m = ctx.measureText(seg.text);
    metrics.push({ width: m.width, style, text: seg.text });
    totalWidth += m.width;
  }

  // ─── Calculate padding & background ───────────────────
  const paddingX = fontSize * 0.5;
  const paddingY = fontSize * 0.3;
  const bgWidth = totalWidth + paddingX * 2;
  const bgHeight = fontSize * 1.4 + paddingY * 2;
  const borderRadius = fontSize * 0.3;

  // ─── Position ─────────────────────────────────────────
  const centerX = actualW / 2;
  let boxY: number;

  switch (position) {
    case 'top':
      boxY = actualH * (yOffset / 100) || 10;
      break;
    case 'middle':
      boxY = actualH * (yOffset / 100) || 40;
      break;
    case 'bottom':
    default:
      boxY = actualH * (yOffset / 100) || 80;
      break;
  }

  const boxX = centerX - bgWidth / 2;

  // ─── Draw background box ──────────────────────────────
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  roundRect(ctx, boxX - 4, boxY - 4, bgWidth + 8, bgHeight + 8, borderRadius + 2);
  ctx.fill();

  // ─── Draw each segment ────────────────────────────────
  let cursorX = centerX - totalWidth / 2;
  const textY = boxY + bgHeight / 2 + fontSize * 0.4;

  for (const m of metrics) {
    const st = m.style;

    // ─── Shadow (draw behind text) ──────────────────────
    if (st.shadowOpacity > 0 && (st.shadowBlur > 0 || st.shadowOffsetX !== 0 || st.shadowOffsetY !== 0)) {
      ctx.save();
      ctx.globalAlpha = st.shadowOpacity;
      ctx.font = buildFontString(st.fontWeight, fontSize, fontFamily);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = st.shadowColor;
      ctx.shadowBlur = st.shadowBlur;
      ctx.shadowOffsetX = st.shadowOffsetX;
      ctx.shadowOffsetY = st.shadowOffsetY;
      ctx.fillStyle = st.shadowColor;
      ctx.fillText(m.text, cursorX, textY);
      ctx.restore();
    }

    // ─── Stroke (outline) ───────────────────────────────
    if (st.strokeWidth > 0 && st.strokeOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = st.strokeOpacity;
      ctx.font = buildFontString(st.fontWeight, fontSize, fontFamily);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = st.strokeColor;
      ctx.lineWidth = st.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeText(m.text, cursorX, textY);
      ctx.restore();
    }

    // ─── Fill (text color) ──────────────────────────────
    ctx.save();
    ctx.globalAlpha = st.opacity;
    ctx.font = buildFontString(st.fontWeight, fontSize, fontFamily);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = st.color;
    ctx.fillText(m.text, cursorX, textY);
    ctx.restore();

    cursorX += m.width;
  }

  ctx.restore();
}

// ─── Watermark ─────────────────────────────────────────────

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  actualW: number,
  actualH: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  ctx.fillText('Generated by SubZeed', actualW - 12, actualH - 12);
  ctx.restore();
}

// ─── Helpers ───────────────────────────────────────────────

function buildFontString(fontWeight: string, fontSize: number, fontFamily: string): string {
  switch (fontWeight) {
    case 'bold':
      return `bold ${fontSize}px ${fontFamily}`;
    case 'italic':
      return `italic ${fontSize}px ${fontFamily}`;
    case 'bold-italic':
      return `bold italic ${fontSize}px ${fontFamily}`;
    default:
      return `${fontSize}px ${fontFamily}`;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
