'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { SubtitleEntry, TextSegment, TextSegmentStyle, SubtitleDisplayStyle, SubscriptionTier } from '@/lib/types';
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
//
// IMPORTANT:
//   - Canvas size จะถูก lock หลังจาก mount ครั้งแรก (ใช้ video size ตอนนั้น)
//   - จะไม่ resize ตาม video อีก เพื่อป้องกัน layout shift ตอน re-render
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
  const animFrameRef = useRef<number>(0);
  const subtitlesRef = useRef<SubtitleEntry[]>([]);
  const currentTimeRef = useRef<number>(0);
  const showWatermark = TIER_CONFIGS[tier].watermark;

  // ─── Sync store → refs (ไม่ trigger re-render) ──────
  useEffect(() => {
    const unsub = useSubtitleStore.subscribe((state: any) => {
      subtitlesRef.current = state.subtitles;
      currentTimeRef.current = state.currentTime;
    });
    subtitlesRef.current = useSubtitleStore.getState().subtitles;
    currentTimeRef.current = useSubtitleStore.getState().currentTime;
    return () => { unsub(); };
  }, []);

  // ─── Find active subtitle ──────────────────────────
  const findActiveSubtitle = useCallback((): SubtitleEntry | null => {
    const subs = subtitlesRef.current;
    const ct = currentTimeRef.current;
    return subs.find((s) => ct >= s.start && ct <= s.end) ?? null;
  }, []);

  // ─── Render loop ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let canvasW = 0;
    let canvasH = 0;
    let currentDpr = 1;

    const draw = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const clientW = video.clientWidth;
      const clientH = video.clientHeight;
      if (vw > 0 && vh > 0 && clientW > 0 && clientH > 0) {
        const contentAspect = vw / vh;
        const containerAspect = clientW / clientH;
        let contentW: number;
        let contentH: number;
        if (contentAspect > containerAspect) {
          contentW = clientW;
          contentH = clientW / contentAspect;
        } else {
          contentH = clientH;
          contentW = clientH * contentAspect;
        }
        currentDpr = window.devicePixelRatio || 1;
        canvasW = Math.round(contentW);
        canvasH = Math.round(contentH);
        canvas.width = canvasW * currentDpr;
        canvas.height = canvasH * currentDpr;
        const videoRect = video.getBoundingClientRect();
        const parentRect = canvas.offsetParent!.getBoundingClientRect();
        canvas.style.left = `${videoRect.left - parentRect.left + (clientW - contentW) / 2}px`;
        canvas.style.top = `${videoRect.top - parentRect.top + (clientH - contentH) / 2}px`;
      }

      if (canvasW === 0 || canvasH === 0) {
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);

      const activeSub = findActiveSubtitle();

      if (activeSub) {
        const segs = activeSub.segments && activeSub.segments.length > 0
          ? activeSub.segments
          : [{ id: `${activeSub.id}-seg-0`, text: activeSub.text, style: { ...DEFAULT_SEGMENT_STYLE } }];

        const ds = activeSub.displayStyle;
        drawSegments(ctx, segs, canvasW, canvasH, fontFamily, fontSize, activeSub.y_offset ?? 90, activeSub.position ?? 'bottom', ds);
      }

      if (showWatermark) {
        drawWatermark(ctx, canvasW, canvasH);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
    // ⚠️ dependencies น้อยที่สุด — fontFamily/fontSize เท่านั้น
    // ไม่รวม videoRef, canvasRef เพราะเป็น refs (stable เสมอ)
    // ไม่รวม findActiveSubtitle (ใช้ closure จับ refs)
    // ไม่รวม showWatermark (เปลี่ยนเมื่อ tier เปลี่ยน ซึ่งน้อยมาก)
  }, [fontFamily, fontSize, showWatermark]);

  return null;
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
  displayStyle?: SubtitleDisplayStyle,
) {
  // ─── คำนวณความกว้างของข้อความ ─────────────────────────
  let totalWidth = 0;
  const metrics: { width: number; style: TextSegmentStyle; text: string }[] = [];

  for (const seg of segments) {
    const style = seg.style;
    ctx.font = buildFontString(style.fontWeight, fontSize, fontFamily);
    const m = ctx.measureText(seg.text);
    metrics.push({ width: m.width, style, text: seg.text });
    totalWidth += m.width;
  }

  // ─── ใช้ค่าจาก displayStyle หรือค่าเริ่มต้น ──────────
  const paddingX = displayStyle?.paddingX ?? fontSize * 0.5;
  const paddingY = displayStyle?.paddingY ?? fontSize * 0.3;
  const borderRadius = displayStyle?.borderRadius ?? fontSize * 0.3;
  const bgColor = displayStyle?.bgColor ?? '#000000';
  const bgOpacity = displayStyle?.bgOpacity ?? 0.6;
  const bgActive = displayStyle?.bgActive ?? true;
  const bs = displayStyle?.boxShadow;
  const hasBoxShadow = bs?.active === true && (bs.opacity > 0 || bs.blur > 0 || bs.offsetX !== 0 || bs.offsetY !== 0);

  const bgWidth = totalWidth + paddingX * 2;
  const bgHeight = fontSize * 1.4 + paddingY * 2;

  // ─── ตำแหน่ง ───────────────────────────────────────────
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

  // ถ้าไม่มี bg → วางข้อความไม่ต้องมีกล่อง
  const boxX = bgActive ? centerX - bgWidth / 2 : centerX - totalWidth / 2;
  const textY = bgActive ? boxY + bgHeight / 2 + fontSize * 0.4 : boxY + fontSize * 0.8;

  // ─── Box Shadow (เงากล่อง) ─────────────────────────────
  if (bgActive && hasBoxShadow) {
    ctx.save();
    ctx.shadowColor = bs!.color;
    ctx.shadowBlur = bs!.blur;
    ctx.shadowOffsetX = bs!.offsetX;
    ctx.shadowOffsetY = bs!.offsetY;
    ctx.globalAlpha = bs!.opacity;

    // วาดพื้นหลังจาง ๆ เพื่อให้ shadow แสดง
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.beginPath();
    roundRect(ctx, boxX, boxY, bgWidth, bgHeight, borderRadius);
    ctx.fill();
    ctx.restore();
  }

  // ─── Background Box ─────────────────────────────────────
  if (bgActive) {
    ctx.save();
    ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
    ctx.beginPath();
    roundRect(ctx, boxX, boxY, bgWidth, bgHeight, borderRadius);
    ctx.fill();
    ctx.restore();
  }

  // ─── ข้อความแต่ละ segment ─────────────────────────────
  let cursorX = bgActive ? centerX - totalWidth / 2 : boxX;

  for (const m of metrics) {
    const st = m.style;

    // Shadow ของตัวอักษร (มาก่อน fill/stroke)
    if (st.shadowActive && st.shadowOpacity > 0 && (st.shadowBlur > 0 || st.shadowOffsetX !== 0 || st.shadowOffsetY !== 0)) {
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

    // Stroke (ขอบตัวอักษร)
    if (st.strokeActive && st.strokeWidth > 0 && st.strokeOpacity > 0) {
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

    // Fill (สีตัวอักษร)
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
}

// ─── Hex Color → rgba string ─────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
