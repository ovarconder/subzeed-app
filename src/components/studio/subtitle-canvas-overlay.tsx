'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type {
  SubtitleEntry,
  TextSegment,
  TextSegmentStyle,
  SubscriptionTier,
  FontWeight,
} from '@/lib/types';
import { DEFAULT_SEGMENT_STYLE, TIER_CONFIGS } from '@/lib/types';
import { useSubtitleStore } from '@/lib/store/subtitle-store';

// ============================================================
// 🎯 InteractiveCanvasOverlay — Canvas แบบอินเทอร์แอคทีฟ
// ============================================================
//
// รองรับ:
//   ✅ Step 1: ลาก subtitle เพื่อเปลี่ยนความสูง (Y-offset) — ทุก tier
//   ✅ Step 2: คลิก/ดับเบิลคลิก subtitle เพื่อเปิด inline editor — ทุก tier
//   🏷️ Step 3: Multi-segment rich edit (หลายสี/หลายขนาด/หลายฟอนต์) — Premium+
//
// แยกจาก SubtitleCanvasOverlay เดิม เพื่อไม่ให้กระทบการทำงานเดิม
// ============================================================

// ─── Inline Editor Popup ──────────────────────────────────

interface InlineEditorProps {
  /** subtitle ที่กำลังแก้ไข */
  sub: SubtitleEntry;
  /** ตำแหน่งบน canvas (CSS px) */
  x: number;
  y: number;
  /** width ของกล่อง editor */
  width: number;
  /** tier สำหรับเช็คสิทธิ์ multi-segment */
  tier: SubscriptionTier;
  /** callback ปิด editor */
  onClose: () => void;
}

function InlineSubtitleEditor({
  sub,
  x,
  y,
  width,
  tier,
  onClose,
}: InlineEditorProps) {
  const isPremiumOrUp =
    tier === 'premium' ||
    tier === 'business_starter' ||
    tier === 'business_pro' ||
    tier === 'unlimited';

  // แก้ไข text ผ่าน store โดยตรง
  const updateSubtitle = useSubtitleStore((s) => s.updateSubtitle);

  // Local state สำหรับแต่ละ segment
  const [segments, setSegments] = useState<TextSegment[]>(
    sub.segments && sub.segments.length > 0
      ? sub.segments.map((s) => ({ ...s, style: { ...s.style } }))
      : [
          {
            id: `${sub.id}-seg-0`,
            text: sub.text,
            style: { ...DEFAULT_SEGMENT_STYLE },
          },
        ]
  );

  // Segment ที่กำลัง active (สำหรับเปลี่ยน style)
  const [activeSegIdx, setActiveSegIdx] = useState<number>(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Sync กลับไป store ─────────────────────────────────
  const syncToStore = useCallback(
    (newSegs: TextSegment[]) => {
      const plainText = newSegs.map((s) => s.text).join('');
      updateSubtitle(sub.id, {
        text: plainText,
        segments: newSegs,
      });
    },
    [sub.id, updateSubtitle]
  );

  // ─── อัปเดต text ของ segment ────────────────────────────
  const updateSegmentText = (idx: number, text: string) => {
    const newSegs = segments.map((s, i) => (i === idx ? { ...s, text } : s));
    setSegments(newSegs);
    syncToStore(newSegs);
  };

  // ─── อัปเดต style ของ segment ────────────────────────────
  const updateSegmentStyle = (idx: number, styleUpdate: Partial<TextSegmentStyle>) => {
    const newSegs = segments.map((s, i) =>
      i === idx ? { ...s, style: { ...s.style, ...styleUpdate } } : s
    );
    setSegments(newSegs);
    syncToStore(newSegs);
  };

  // ─── แยก segment (Premium+) ─────────────────────────────
  const splitSegment = (idx: number, splitAt: number) => {
    if (!isPremiumOrUp) return;
    const seg = segments[idx];
    if (!seg || splitAt <= 0 || splitAt >= seg.text.length) return;

    const before = seg.text.slice(0, splitAt).trim();
    const after = seg.text.slice(splitAt).trim();
    if (!before || !after) return;

    const newSegs = [
      ...segments.slice(0, idx),
      { ...seg, id: `${sub.id}-seg-${Date.now()}-a`, text: before },
      {
        id: `${sub.id}-seg-${Date.now()}-b`,
        text: after,
        style: { ...seg.style },
      },
      ...segments.slice(idx + 1),
    ];
    setSegments(newSegs);
    syncToStore(newSegs);
  };
  // ─── รวม segment (Premium+) ─────────────────────────────
  const mergeSegments = (idx: number) => {
    if (!isPremiumOrUp) return;
    if (idx < 0 || idx >= segments.length - 1) return;

    const mergedText = segments[idx].text + segments[idx + 1].text;
    const newSegs = [
      ...segments.slice(0, idx),
      {
        ...segments[idx],
        id: `${sub.id}-seg-${Date.now()}-merged`,
        text: mergedText,
      },
      ...segments.slice(idx + 2),
    ];
    setSegments(newSegs);
    syncToStore(newSegs);
  };

  // ─── ปิดเมื่อคลิกนอก editor ────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // ดีเลย์นิดหน่อยไม่ให้ปิดทันทีที่เปิด
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const activeSeg = segments[activeSegIdx] || segments[0];

  return (
    <div
      ref={editorRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-border p-3"
      style={{
        left: Math.max(10, Math.min(x, window.innerWidth - width - 20)),
        top: Math.max(10, y - 180),
        width: Math.min(width + 40, window.innerWidth - 40),
      }}
    >
      {/* ─── Header: ช่วง segment ───────────────────── */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {segments.map((seg, idx) => (
          <button
            key={seg.id}
            onClick={() => setActiveSegIdx(idx)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              idx === activeSegIdx
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-text-secondary border-border hover:bg-border'
            }`}
          >
            seg {idx + 1}
          </button>
        ))}
        {isPremiumOrUp && (
          <button
            onClick={() => {
              // แยก segment โดยใช้ cursor position ใน textarea
              const ta = textareaRef.current;
              if (ta) {
                const pos = ta.selectionStart;
                if (pos > 0 && pos < ta.value.length) {
                  splitSegment(activeSegIdx, pos);
                } else {
                  alert('วางเคอร์เซอร์ในข้อความตรงตำแหน่งที่ต้องการแบ่ง');
                }
              }
            }}
            className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-text-secondary/40 text-text-secondary hover:bg-border"
            title="วางเคอร์เซอร์ในข้อความตรงจุดที่ต้องการแบ่งแล้วคลิก (Premium+)"
          >
            + แยก
          </button>
        )}
        {isPremiumOrUp && segments.length > 1 && activeSegIdx > 0 && (
          <button
            onClick={() => mergeSegments(activeSegIdx - 1)}
            className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-text-secondary/40 text-text-secondary hover:bg-border"
            title="รวม segment นี้กับอันก่อน"
          >
            ⤴ รวม
          </button>
        )}
      </div>

      {/* ─── Text input ──────────────────────────────── */}
      <textarea
        ref={textareaRef}
        value={activeSeg?.text || ''}
        onChange={(e) => updateSegmentText(activeSegIdx, e.target.value)}
        className="w-full rounded border border-border px-2 py-1 text-sm mb-2 resize-none"
        rows={2}
        autoFocus
      />

      {/* ─── Style controls ──────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Color */}
        <div>
          <label className="block text-[10px] text-text-secondary mb-0.5">สี</label>
          <input
            type="color"
            value={activeSeg?.style.color || '#FFFFFF'}
            onChange={(e) => updateSegmentStyle(activeSegIdx, { color: e.target.value })}
            className="w-full h-7 rounded cursor-pointer"
          />
        </div>

        {/* Font Family */}
        <div>
        <label className="block text-[10px] text-text-secondary mb-0.5">ฟอนต์</label>
        <select
          value={activeSeg?.style.fontFamily || 'Arial'}
          onChange={(e) => updateSegmentStyle(activeSegIdx, { fontFamily: e.target.value })}
          className="w-full rounded border border-border px-1 py-1 text-[10px] bg-white"
        >
          <option value="Arial">Arial</option>
          <option value="Arial Black">Arial Black</option>
          <option value="Verdana">Verdana</option>
          <option value="Tahoma">Tahoma</option>
          <option value="Trebuchet MS">Trebuchet MS</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Georgia">Georgia</option>
          <option value="Garamond">Garamond</option>
          <option value="Courier New">Courier New</option>
          <option value="Brush Script MT">Brush Script MT</option>
          <option value="Impact">Impact</option>
          <option value="Comic Sans MS">Comic Sans MS</option>
          <option value="Kanit">Kanit</option>
          <option value="Sarabun">Sarabun</option>
          <option value="Noto Sans Thai">Noto Sans Thai</option>
        </select>
        </div>

        {/* Font Weight */}
        <div>
          <label className="block text-[10px] text-text-secondary mb-0.5">น้ำหนัก</label>
          <select
            value={activeSeg?.style.fontWeight || 'normal'}
            onChange={(e) =>
              updateSegmentStyle(activeSegIdx, { fontWeight: e.target.value as FontWeight })
            }
            className="w-full rounded border border-border px-1 py-1 text-[10px] bg-white"
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
            <option value="italic">Italic</option>
            <option value="bold-italic">Bold Italic</option>
          </select>
        </div>

        {/* Opacity */}
        <div>
          <label className="block text-[10px] text-text-secondary mb-0.5">
            ความทึบ: {Math.round((activeSeg?.style.opacity ?? 1) * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((activeSeg?.style.opacity ?? 1) * 100)}
            onChange={(e) =>
              updateSegmentStyle(activeSegIdx, { opacity: parseInt(e.target.value, 10) / 100 })
            }
            className="w-full"
          />
        </div>

        {/* Stroke Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={activeSeg?.style.strokeActive || false}
              onChange={(e) =>
                updateSegmentStyle(activeSegIdx, { strokeActive: e.target.checked })
              }
              className="accent-primary"
            />
            <span className="text-[10px]">Stroke</span>
          </label>
          {activeSeg?.style.strokeActive && (
            <input
              type="color"
              value={activeSeg?.style.strokeColor || '#000000'}
              onChange={(e) =>
                updateSegmentStyle(activeSegIdx, { strokeColor: e.target.value })
              }
              className="w-6 h-6 rounded cursor-pointer"
            />
          )}
        </div>

        {/* Shadow Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={activeSeg?.style.shadowActive || false}
              onChange={(e) =>
                updateSegmentStyle(activeSegIdx, { shadowActive: e.target.checked })
              }
              className="accent-primary"
            />
            <span className="text-[10px]">Shadow</span>
          </label>
          {activeSeg?.style.shadowActive && (
            <input
              type="color"
              value={activeSeg?.style.shadowColor || '#000000'}
              onChange={(e) =>
                updateSegmentStyle(activeSegIdx, { shadowColor: e.target.value })
              }
              className="w-6 h-6 rounded cursor-pointer"
            />
          )}
        </div>

        {/* Stroke Width (เฉพาะ Premium+) */}
        {isPremiumOrUp && activeSeg?.style.strokeActive && (
          <div>
            <label className="block text-[10px] text-text-secondary mb-0.5">
              Stroke width: {activeSeg?.style.strokeWidth}px
            </label>
            <input
              type="range"
              min={0}
              max={8}
              step={0.5}
              value={activeSeg?.style.strokeWidth || 2}
              onChange={(e) =>
                updateSegmentStyle(activeSegIdx, {
                  strokeWidth: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
          </div>
        )}

        {/* Shadow Blur (Premium+) */}
        {isPremiumOrUp && activeSeg?.style.shadowActive && (
          <div>
            <label className="block text-[10px] text-text-secondary mb-0.5">
              Shadow blur: {activeSeg?.style.shadowBlur}px
            </label>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={activeSeg?.style.shadowBlur || 4}
              onChange={(e) =>
                updateSegmentStyle(activeSegIdx, { shadowBlur: parseInt(e.target.value, 10) })
              }
              className="w-full"
            />
          </div>
        )}

        {/* Shadow Offset (Premium+) */}
        {isPremiumOrUp && activeSeg?.style.shadowActive && (
          <>
            <div>
              <label className="block text-[10px] text-text-secondary mb-0.5">
                Offset X: {activeSeg?.style.shadowOffsetX}
              </label>
              <input
                type="range"
                min={-10}
                max={10}
                step={1}
                value={activeSeg?.style.shadowOffsetX || 2}
                onChange={(e) =>
                  updateSegmentStyle(activeSegIdx, {
                    shadowOffsetX: parseInt(e.target.value, 10),
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10px] text-text-secondary mb-0.5">
                Offset Y: {activeSeg?.style.shadowOffsetY}
              </label>
              <input
                type="range"
                min={-10}
                max={10}
                step={1}
                value={activeSeg?.style.shadowOffsetY || 2}
                onChange={(e) =>
                  updateSegmentStyle(activeSegIdx, {
                    shadowOffsetY: parseInt(e.target.value, 10),
                  })
                }
                className="w-full"
              />
            </div>
          </>
        )}
      </div>

      {/* ─── ปุ่มล่าง ────────────────────────────────── */}
      <div className="flex justify-between items-center mt-3 pt-2 border-t border-border">
        <div className="text-[10px] text-text-secondary">
          {segments.length} segment{segments.length > 1 ? 's' : ''}
          {isPremiumOrUp && ' (Premium)'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="text-[10px] px-3 py-1 rounded bg-surface text-text-secondary hover:bg-border"
          >
            ✕ ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 🎯 Main Component
// ============================================================

export interface InteractiveCanvasOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  fontFamily: string;
  fontSize: number;
  tier: SubscriptionTier;
}

interface DragState {
  isDragging: boolean;
  subId: string | null;
  startY: number;
  startYOffset: number;
}

interface Point {
  x: number;
  y: number;
}

export function InteractiveCanvasOverlay({
  videoRef,
  canvasRef,
  fontFamily,
  fontSize,
  tier,
}: InteractiveCanvasOverlayProps) {
  const subtitlesRef = useRef<SubtitleEntry[]>([]);
  const currentTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);

  // ─── Drag state ─────────────────────────────────────────
  const dragRef = useRef<DragState>({
    isDragging: false,
    subId: null,
    startY: 0,
    startYOffset: 0,
  });

  // ─── Inline editor state ───────────────────────────────
  const [editorState, setEditorState] = useState<{
    sub: SubtitleEntry;
    x: number;
    y: number;
    width: number;
  } | null>(null);

  // ─── Tier check ─────────────────────────────────────────
  const isPremiumOrUp =
    tier === 'premium' ||
    tier === 'business_starter' ||
    tier === 'business_pro' ||
    tier === 'unlimited';

  // ─── Sync store → refs ─────────────────────────────────
  useEffect(() => {
    const unsub = useSubtitleStore.subscribe((state: any) => {
      subtitlesRef.current = state.subtitles;
      currentTimeRef.current = state.currentTime;
    });
    subtitlesRef.current = useSubtitleStore.getState().subtitles;
    currentTimeRef.current = useSubtitleStore.getState().currentTime;
    return () => unsub();
  }, []);

  // ─── Find active subtitle ──────────────────────────────
  const findActiveSubtitle = useCallback((): SubtitleEntry | null => {
    const subs = subtitlesRef.current;
    const ct = currentTimeRef.current;
    return subs.find((s) => ct >= s.start && ct <= s.end) ?? null;
  }, []);

  // ─── หา subtitle จากพิกัดคลิก ──────────────────────────
  const findSubtitleAtPoint = useCallback(
    (px: number, py: number, canvasW: number, canvasH: number): SubtitleEntry | null => {
      const subs = subtitlesRef.current;
      if (subs.length === 0) return null;

      // เรียงลำดับ subtitle ที่กำลัง active ณ เวลาปัจจุบัน
      const ct = currentTimeRef.current;
      const visibleSubs = subs.filter((s) => ct >= s.start && ct <= s.end);
      if (visibleSubs.length === 0) return null;

      // ใช้ subtitle แรกที่เจอ
      // สำหรับ multi-subtitle ในเวลาเดียวกัน จะใช้ context (position) 来判断
      // ถ้ามีหลายอัน → ใช้อันที่มี y_offset ใกล้เคียง py มากที่สุด
      const candidates = visibleSubs.map((s) => {

        const yPos = canvasH * ((s.y_offset ?? 80) / 100);
        return { sub: s, dist: Math.abs(py - yPos) };
      });
      candidates.sort((a, b) => a.dist - b.dist);
      return candidates[0]?.sub ?? null;
    },
    []
  );

  // ============================================================
  // Mouse / Pointer Handlers
  // ============================================================

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const rect = video.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const canvasW = Math.round(rect.width);
      const canvasH = Math.round(rect.height);

      const sub = findSubtitleAtPoint(px, py, canvasW, canvasH);
      if (!sub) return;

      dragRef.current = {
        isDragging: true,
        subId: sub.id,
        startY: py,

        startYOffset: sub.y_offset ?? 80,
      };

      video.setPointerCapture(e.pointerId);
    },
    [videoRef, findSubtitleAtPoint]
  );

  const SNAP_TOLERANCE = 3; // % tolerance
  const MAGNET_POINTS = [12.5, 25, 37.5, 50, 62.5, 75, 87.5];

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.isDragging || !drag.subId) return;

      const video = videoRef.current;
      if (!video) return;

      const rect = video.getBoundingClientRect();
      const py = e.clientY - rect.top;
      const canvasH = Math.round(rect.height);

      const deltaY = py - drag.startY;
      const deltaPercent = (deltaY / canvasH) * 100;
      const newOffset = Math.max(5, Math.min(95, drag.startYOffset + deltaPercent));
      const roundedOffset = Math.round(newOffset);

      // 🧲 Magnet snap: ถ้าใกล้ guideline ให้ snap ที่ center ของ subtitle
      // โดย center = y_offset + (half of bgHeight in %)
      // bgHeight ≈ fontSize * 1.4 + paddingY*2 ≈ fontSize * 2
      const halfBgPct = ((fontSize * 2) / canvasH / 2) * 100; // half bg height in percent
      let snapped = roundedOffset;
      for (const mp of MAGNET_POINTS) {
        // snap เมื่อ center ของ subtitle (= y_offset + halfBgPct) ใกล้ guideline
        const center = roundedOffset + halfBgPct;
        if (Math.abs(center - mp) <= SNAP_TOLERANCE) {
          snapped = Math.round(mp - halfBgPct);
          break;
        }
      }

      // อัปเดต store โดยตรง
      const store = useSubtitleStore.getState();
      store.updateSubtitle(drag.subId, { y_offset: snapped });
    },
    [videoRef]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = {
      isDragging: false,
      subId: null,
      startY: 0,
      startYOffset: 0,
    };
  }, []);

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const rect = video.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const canvasW = Math.round(rect.width);
      const canvasH = Math.round(rect.height);

      const sub = findSubtitleAtPoint(px, py, canvasW, canvasH);
      if (!sub) return;

      // เปิด inline editor
      setEditorState({
        sub,
        x: e.clientX,
        y: e.clientY,
        width: canvasW * 0.6,
      });
    },
    [canvasRef, videoRef, findSubtitleAtPoint]
  );

  // ─── Register event listeners บน video (เพราะ canvas มี pointer-events: none) ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener('pointerdown', handlePointerDown);
    video.addEventListener('pointermove', handlePointerMove);
    video.addEventListener('pointerup', handlePointerUp);
    video.addEventListener('pointercancel', handlePointerUp);
    video.addEventListener('dblclick', handleDoubleClick);

    // ป้องกัน context menu
    const preventCtx = (e: Event) => e.preventDefault();
    video.addEventListener('contextmenu', preventCtx);

    return () => {
      video.removeEventListener('pointerdown', handlePointerDown);
      video.removeEventListener('pointermove', handlePointerMove);
      video.removeEventListener('pointerup', handlePointerUp);
      video.removeEventListener('pointercancel', handlePointerUp);
      video.removeEventListener('dblclick', handleDoubleClick);
      video.removeEventListener('contextmenu', preventCtx);
    };
  }, [videoRef, handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick]);

  // ─── Canvas render loop ───────────────────────────────
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
        // ใช้ style.width/height + left/top เพื่อวาง canvas ตรง video content
        canvas.style.width = `${canvasW}px`;
        canvas.style.height = `${canvasH}px`;
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

      // ═══════════════════════════════════════════════════
      // 🎯 Guideline แบ่ง 8 ส่วน (เส้นประ)
      // ═══════════════════════════════════════════════════
      for (let i = 1; i < 8; i++) {
        const y = canvasH * (i / 8);
        const isHalf = i === 4; // เส้น 50% เข้มกว่า
        ctx.save();
        ctx.strokeStyle = isHalf ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = isHalf ? 2 : 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasW, y);
        ctx.stroke();
        // Label
        ctx.fillStyle = isHalf ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.35)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${Math.round((i / 8) * 100)}%`, 4, y - 2);
        ctx.restore();
      }

      // ✅ วาดเฉพาะ drag indicator อย่างเดียว

      // ─── วาด cursor indicator ถ้ากำลังลาก ─────────
      if (dragRef.current.isDragging) {
        ctx.save();
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        const active = findActiveSubtitle();
        if (active) {

          const yPos = canvasH * ((active.y_offset ?? 80) / 100);
          ctx.beginPath();
          ctx.moveTo(0, yPos);
          ctx.lineTo(canvasW, yPos);
          ctx.stroke();
        }
        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [fontFamily, fontSize, findActiveSubtitle]);

  return (
    <>
      {/* ⚠️ Canvas ไม่ต้องมี className อะไร — set โดยตรงใน render loop */}
      {/* Inline Editor Popup */}
      {editorState && (
        <InlineSubtitleEditor
          sub={editorState.sub}
          x={editorState.x}
          y={editorState.y}
          width={editorState.width}
          tier={tier}
          onClose={() => setEditorState(null)}
        />
      )}
    </>
  );
}

// ============================================================
// 🎨 Canvas Drawing Functions (copy จาก SubtitleCanvasOverlay)
// ============================================================

function drawSegments(
  ctx: CanvasRenderingContext2D,
  segments: TextSegment[],
  actualW: number,
  actualH: number,
  fontFamily: string,
  fontSize: number,
  yOffset: number,
  position: 'bottom' | 'top' | 'middle',
  displayStyle?: any
) {
  // ─── คำนวณความกว้างของข้อความ ─────────────────────────
  let totalWidth = 0;
  const metrics: { width: number; style: TextSegmentStyle; text: string }[] = [];

  for (const seg of segments) {
    const style = seg.style;
    ctx.font = buildFontString(style, fontSize, fontFamily);
    const m = ctx.measureText(seg.text);
    metrics.push({ width: m.width, style, text: seg.text });
    totalWidth += m.width;
  }

  const paddingX = displayStyle?.paddingX ?? fontSize * 0.5;
  const paddingY = displayStyle?.paddingY ?? fontSize * 0.3;
  const borderRadius = displayStyle?.borderRadius ?? fontSize * 0.3;
  const bgColor = displayStyle?.bgColor ?? '#000000';
  const bgOpacity = displayStyle?.bgOpacity ?? 0.6;
  const bgActive = displayStyle?.bgActive ?? true;
  const bs = displayStyle?.boxShadow;
  const hasBoxShadow =
    bs?.active === true && (bs.opacity > 0 || bs.blur > 0 || bs.offsetX !== 0 || bs.offsetY !== 0);

  const bgWidth = totalWidth + paddingX * 2;
  const bgHeight = fontSize * 1.4 + paddingY * 2;

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

  const boxX = bgActive ? centerX - bgWidth / 2 : centerX - totalWidth / 2;
  const textY = bgActive ? boxY + bgHeight / 2 + fontSize * 0.4 : boxY + fontSize * 0.8;

  // ─── Box Shadow ────────────────────────────────────────
  if (bgActive && hasBoxShadow) {
    ctx.save();
    ctx.shadowColor = bs!.color;
    ctx.shadowBlur = bs!.blur;
    ctx.shadowOffsetX = bs!.offsetX;
    ctx.shadowOffsetY = bs!.offsetY;
    ctx.globalAlpha = bs!.opacity;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.beginPath();
    roundRect(ctx, boxX, boxY, bgWidth, bgHeight, borderRadius);
    ctx.fill();
    ctx.restore();
  }

  // ─── Background Box ────────────────────────────────────
  if (bgActive) {
    ctx.save();
    ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
    ctx.beginPath();
    roundRect(ctx, boxX, boxY, bgWidth, bgHeight, borderRadius);
    ctx.fill();
    ctx.restore();
  }

  // ─── Text segments ──────────────────────────────────────
  let cursorX = bgActive ? centerX - totalWidth / 2 : boxX;

  for (const m of metrics) {
    const st = m.style;

    // Shadow
    if (
      st.shadowActive &&
      st.shadowOpacity > 0 &&
      (st.shadowBlur > 0 || st.shadowOffsetX !== 0 || st.shadowOffsetY !== 0)
    ) {
      ctx.save();
      ctx.globalAlpha = st.shadowOpacity;
      ctx.font = buildFontString(st, fontSize, fontFamily);
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

    // Stroke
    if (st.strokeActive && st.strokeWidth > 0 && st.strokeOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = st.strokeOpacity;
      ctx.font = buildFontString(st, fontSize, fontFamily);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = st.strokeColor;
      ctx.lineWidth = st.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeText(m.text, cursorX, textY);
      ctx.restore();
    }

    // Fill
    ctx.save();
    ctx.globalAlpha = st.opacity;
    ctx.font = buildFontString(st, fontSize, fontFamily);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = st.color;
    ctx.fillText(m.text, cursorX, textY);
    ctx.restore();

    cursorX += m.width;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawWatermark(ctx: CanvasRenderingContext2D, actualW: number, actualH: number) {
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

function buildFontString(
  fontWeight: string | TextSegmentStyle,
  fontSize: number,
  fontFamily: string
): string {
  // ถ้า fontWeight เป็น object (pass-through style) ให้ดึง fontFamily จากนั้น
  if (typeof fontWeight === 'object' && fontWeight !== null) {
    const st = fontWeight as TextSegmentStyle;
    const ff = st.fontFamily || fontFamily;
    switch (st.fontWeight) {
      case 'bold': return `bold ${fontSize}px ${ff}`;
      case 'italic': return `italic ${fontSize}px ${ff}`;
      case 'bold-italic': return `bold italic ${fontSize}px ${ff}`;
      default: return `${fontSize}px ${ff}`;
    }
  }
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
  r: number
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
