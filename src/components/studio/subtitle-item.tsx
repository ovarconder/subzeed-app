'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { SubtitleEntry, TextSegment, TextSegmentStyle, SubtitleDisplayStyle, FontWeight } from '@/lib/types';
import { textToSegments, DEFAULT_SEGMENT_STYLE, DEFAULT_DISPLAY_STYLE } from '@/lib/types';

interface SubtitleItemProps {
  sub: SubtitleEntry;
  index: number;
  isSelected: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fontFamily?: string;
  fontSize?: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<SubtitleEntry>) => void;
  onDelete: () => void;
  onRetranscribeSelection?: (subId: string) => void;
}

// ── ใชสำหรับ preview หลาย segment ────────────────────────

function PreviewText({ segments, displayStyle, fontFamily, fontSize }: {
  segments: TextSegment[];
  displayStyle: SubtitleDisplayStyle;
  fontFamily?: string;
  fontSize?: number;
}) {
  const ds = displayStyle ?? DEFAULT_DISPLAY_STYLE;
  const showBg = ds.bgActive && ds.bgOpacity > 0;
  const showShadow = ds.boxShadow.active && ds.boxShadow.opacity > 0;
  const ff = fontFamily || 'Arial';
  const fs = fontSize || 20;

  return (
    <div className="relative inline-block max-w-full" style={{
      padding: showBg ? `${ds.paddingY}px ${ds.paddingX}px` : '0',
      borderRadius: showBg ? `${ds.borderRadius}px` : '0',
      backgroundColor: showBg ? hexToRgba(ds.bgColor, ds.bgOpacity) : 'transparent',
      boxShadow: showShadow
        ? `${ds.boxShadow.offsetX}px ${ds.boxShadow.offsetY}px ${ds.boxShadow.blur}px ${ds.boxShadow.spread}px ${hexToRgba(ds.boxShadow.color, ds.boxShadow.opacity)}`
        : 'none',
      fontFamily: ff,
      fontSize: `${fs}px`,
    }}>
      <span>
        {segments.map((seg, i) => (
          <span key={i} style={{
            color: seg.style.color,
            opacity: seg.style.opacity,
            fontWeight: ['bold', 'bold-italic'].includes(seg.style.fontWeight) ? 'bold' : 'normal',
            fontStyle: ['italic', 'bold-italic'].includes(seg.style.fontWeight) ? 'italic' : 'normal',
            textShadow: seg.style.shadowActive && seg.style.shadowOpacity > 0
              ? `${seg.style.shadowOffsetX}px ${seg.style.shadowOffsetY}px ${seg.style.shadowBlur}px ${hexToRgba(seg.style.shadowColor, seg.style.shadowOpacity)}`
              : 'none',
            WebkitTextStroke: seg.style.strokeActive && seg.style.strokeWidth > 0 && seg.style.strokeOpacity > 0
              ? `${seg.style.strokeWidth}px ${hexToRgba(seg.style.strokeColor, seg.style.strokeOpacity)}`
              : 'none',
          }}>
            {seg.text}
          </span>
        ))}
      </span>
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  const r = parseInt(c.substring(0,2),16);
  const g = parseInt(c.substring(2,4),16);
  const b = parseInt(c.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Segment Editor (หลายสีในบรรทัดเดียว) ──────────────────

function MultiSegmentEditor({
  segments,
  onChange,
}: {
  segments: TextSegment[];
  onChange: (segs: TextSegment[]) => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const cur = segments[selectedIdx] ?? segments[0];
  const st = cur?.style ?? DEFAULT_SEGMENT_STYLE;

  const updateStyle = (up: Partial<TextSegmentStyle>) => {
    const next = segments.map((s, i) => i === selectedIdx ? { ...s, style: { ...s.style, ...up } } : s);
    onChange(next);
  };

  const updateText = (text: string) => {
    const next = segments.map((s, i) => i === selectedIdx ? { ...s, text } : s);
    onChange(next);
  };

  const addSeg = () => {
    const newSeg: TextSegment = {
      id: `seg-${Date.now()}`,
      text: '',
      style: { ...DEFAULT_SEGMENT_STYLE },
    };
    onChange([...segments, newSeg]);
    setSelectedIdx(segments.length);
  };

  const removeSeg = (idx: number) => {
    if (segments.length <= 1) return;
    onChange(segments.filter((_, i) => i !== idx));
    if (selectedIdx >= segments.length - 1) setSelectedIdx(Math.max(0, segments.length - 2));
  };

  return (
    <div className="space-y-2">
      {/* Segment tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {segments.map((seg, i) => (
          <button key={seg.id} onClick={() => setSelectedIdx(i)}
            className={`text-[9px] px-2 py-0.5 rounded ${i === selectedIdx ? 'bg-primary text-white' : 'bg-surface text-text-secondary'}`}>
            {seg.text.slice(0, 6) || '(empty)'}
          </button>
        ))}
        <button onClick={addSeg} className="text-[9px] px-2 py-0.5 rounded bg-green-50 text-green-600">+</button>
      </div>

      {/* Selected segment editor */}
      <div>
        <input type="text" value={cur?.text ?? ''}
          onChange={(e) => updateText(e.target.value)}
          className="w-full rounded border border-border px-2 py-1 text-[10px] bg-white font-mono"
          placeholder="Text for this segment" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] text-text-secondary block">Color</label>
          <div className="flex items-center gap-1">
            <input type="color" value={st.color}
              onChange={(e) => updateStyle({ color: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer border border-border shrink-0" />
            <input type="text" value={st.color}
              onChange={(e) => updateStyle({ color: e.target.value })}
              className="flex-1 rounded border border-border px-1 py-0.5 text-[9px] bg-white font-mono" />
          </div>
        </div>
        <div>
          <label className="text-[9px] text-text-secondary block">Opacity</label>
          <div className="flex items-center gap-1">
            <input type="range" min={0} max={1} step={0.05} value={st.opacity}
              onChange={(e) => updateStyle({ opacity: Number(e.target.value) })}
              className="flex-1 h-4 accent-primary" />
            <span className="text-[9px] text-text-secondary w-6">{Math.round(st.opacity * 100)}%</span>
          </div>
        </div>
      </div>

      <div>
        <label className="text-[9px] text-text-secondary block">Font weight</label>
        <div className="flex gap-1">
          {(['normal','bold','italic','bold-italic'] as FontWeight[]).map(fw => (
            <button key={fw} onClick={() => updateStyle({ fontWeight: fw })}
              className={`text-[9px] px-2 py-1 rounded ${st.fontWeight === fw ? 'bg-primary text-white' : 'bg-surface text-text-secondary'}`}>
              {fw === 'normal' ? 'N' : fw === 'bold' ? 'B' : fw === 'italic' ? 'I' : 'BI'}
            </button>
          ))}
        </div>
      </div>

      <details>
        <summary className="text-[9px] font-medium text-text-secondary cursor-pointer">Stroke</summary>
        <div className="mt-1 space-y-1.5 pl-1">
          <label className="flex items-center gap-2 text-[9px] text-text-secondary cursor-pointer">
            <input type="checkbox" checked={st.strokeActive}
              onChange={(e) => updateStyle({ strokeActive: e.target.checked })}
              className="accent-primary w-3 h-3" />
            Active
          </label>
          {st.strokeActive && (<>
          <div className="flex items-center gap-1">
            <label className="text-[8px] text-text-secondary w-10">Color</label>
            <input type="color" value={st.strokeColor}
              onChange={(e) => updateStyle({ strokeColor: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border border-border" />
            <input type="range" min={0} max={8} step={0.5} value={st.strokeWidth}
              onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })}
              className="flex-1 h-3 accent-primary" />
            <span className="text-[8px] text-text-secondary w-4">{st.strokeWidth}</span>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[8px] text-text-secondary w-10">Opacity</label>
            <input type="range" min={0} max={1} step={0.05} value={st.strokeOpacity}
              onChange={(e) => updateStyle({ strokeOpacity: Number(e.target.value) })}
              className="flex-1 h-3 accent-primary" />
            <span className="text-[8px] text-text-secondary w-6">{Math.round(st.strokeOpacity * 100)}%</span>
          </div>
          </>)}
        </div>
      </details>

      <details>
        <summary className="text-[9px] font-medium text-text-secondary cursor-pointer">Text shadow</summary>
        <div className="mt-1 space-y-1.5 pl-1">
          <label className="flex items-center gap-2 text-[9px] text-text-secondary cursor-pointer">
            <input type="checkbox" checked={st.shadowActive}
              onChange={(e) => updateStyle({ shadowActive: e.target.checked })}
              className="accent-primary w-3 h-3" />
            Active
          </label>
          {st.shadowActive && (<>
          <div className="flex items-center gap-1">
            <label className="text-[8px] text-text-secondary w-10">Color</label>
            <input type="color" value={st.shadowColor}
              onChange={(e) => updateStyle({ shadowColor: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border border-border" />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="text-[8px] text-text-secondary">Blur</label>
              <input type="range" min={0} max={30} step={1} value={st.shadowBlur}
                onChange={(e) => updateStyle({ shadowBlur: Number(e.target.value) })}
                className="w-full h-3 accent-primary" />
              <span className="text-[8px] text-text-secondary">{st.shadowBlur}px</span>
            </div>
            <div>
              <label className="text-[8px] text-text-secondary">Opacity</label>
              <input type="range" min={0} max={1} step={0.05} value={st.shadowOpacity}
                onChange={(e) => updateStyle({ shadowOpacity: Number(e.target.value) })}
                className="w-full h-3 accent-primary" />
              <span className="text-[8px] text-text-secondary">{Math.round(st.shadowOpacity * 100)}%</span>
            </div>
          </div>
          </>)}
        </div>
      </details>

      {segments.length > 1 && (
        <button onClick={() => removeSeg(selectedIdx)}
          className="text-[9px] text-red-500 hover:bg-red-50 w-full py-1 rounded">
          Remove segment
        </button>
      )}
    </div>
  );
}

// ── Box Style Editor ──────────────────────────────────────

function BoxStyleEditor({
  ds,
  onChange,
}: {
  ds: SubtitleDisplayStyle;
  onChange: (up: Partial<SubtitleDisplayStyle>) => void;
}) {
  return (
    <div className="space-y-2">
      {/* Background toggle */}
      <label className="flex items-center gap-2 text-[10px] text-text-secondary cursor-pointer">
        <input type="checkbox" checked={ds.bgActive} onChange={(e) => onChange({ bgActive: e.target.checked })}
          className="accent-primary" />
        Background
      </label>
      {ds.bgActive && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-text-secondary block">Color</label>
              <div className="flex items-center gap-1">
                <input type="color" value={ds.bgColor}
                  onChange={(e) => onChange({ bgColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-border shrink-0" />
                <input type="text" value={ds.bgColor}
                  onChange={(e) => onChange({ bgColor: e.target.value })}
                  className="flex-1 rounded border border-border px-1 py-0.5 text-[9px] bg-white font-mono" />
              </div>
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block">Opacity</label>
              <input type="range" min={0} max={1} step={0.05} value={ds.bgOpacity}
                onChange={(e) => onChange({ bgOpacity: Number(e.target.value) })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{Math.round(ds.bgOpacity * 100)}%</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-text-secondary block">Radius</label>
              <input type="range" min={0} max={30} step={1} value={ds.borderRadius}
                onChange={(e) => onChange({ borderRadius: Number(e.target.value) })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{ds.borderRadius}px</span>
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block">Pad X</label>
              <input type="range" min={0} max={40} step={1} value={ds.paddingX}
                onChange={(e) => onChange({ paddingX: Number(e.target.value) })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{ds.paddingX}px</span>
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block">Pad Y</label>
              <input type="range" min={0} max={30} step={1} value={ds.paddingY}
                onChange={(e) => onChange({ paddingY: Number(e.target.value) })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{ds.paddingY}px</span>
            </div>
          </div>
        </>
      )}

      {/* Box shadow toggle */}
      <label className="flex items-center gap-2 text-[10px] text-text-secondary cursor-pointer">
        <input type="checkbox" checked={ds.boxShadow.active}
          onChange={(e) => onChange({ boxShadow: { ...ds.boxShadow, active: e.target.checked } })}
          className="accent-primary" />
        Box shadow
      </label>
      {ds.boxShadow.active && (
        <div className="space-y-1.5 pl-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] text-text-secondary block">Offset X</label>
              <input type="range" min={-20} max={20} step={1} value={ds.boxShadow.offsetX}
                onChange={(e) => onChange({ boxShadow: { ...ds.boxShadow, offsetX: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
            <div>
              <label className="text-[8px] text-text-secondary block">Offset Y</label>
              <input type="range" min={-20} max={20} step={1} value={ds.boxShadow.offsetY}
                onChange={(e) => onChange({ boxShadow: { ...ds.boxShadow, offsetY: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[8px] text-text-secondary block">Blur</label>
              <input type="range" min={0} max={30} step={1} value={ds.boxShadow.blur}
                onChange={(e) => onChange({ boxShadow: { ...ds.boxShadow, blur: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
            <div>
              <label className="text-[8px] text-text-secondary block">Spread</label>
              <input type="range" min={0} max={20} step={1} value={ds.boxShadow.spread}
                onChange={(e) => onChange({ boxShadow: { ...ds.boxShadow, spread: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
            <div>
              <label className="text-[8px] text-text-secondary block">Opacity</label>
              <input type="range" min={0} max={1} step={0.05} value={ds.boxShadow.opacity}
                onChange={(e) => onChange({ boxShadow: { ...ds.boxShadow, opacity: Number(e.target.value) } })}
                className="w-full h-3 accent-primary" />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[8px] text-text-secondary">Color</label>
            <input type="color" value={ds.boxShadow.color}
              onChange={(e) => onChange({ boxShadow: { ...ds.boxShadow, color: e.target.value } })}
              className="w-7 h-7 rounded cursor-pointer border border-border" />
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Main SubtitleItem
// ══════════════════════════════════════════════════════════

export function SubtitleItem({
  sub, index, isSelected, videoRef, onSelect, onUpdate, onDelete, fontFamily, fontSize, onRetranscribeSelection,
}: SubtitleItemProps) {
  const [showStyle, setShowStyle] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(sub.text);
  const [editingTime, setEditingTime] = useState<'start' | 'end' | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  const segments = useMemo(() => sub.segments && sub.segments.length > 0
    ? sub.segments
    : textToSegments(sub.id, sub.text),
  [sub.segments, sub.text, sub.id]);

  const displayStyle = sub.displayStyle ?? DEFAULT_DISPLAY_STYLE;

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);
  useEffect(() => {
    if (editingTime && timeInputRef.current) { timeInputRef.current.focus(); timeInputRef.current.select(); }
  }, [editingTime]);
  useEffect(() => { if (!editing) setEditText(sub.text); }, [sub.text, editing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditText(sub.text);
    setEditing(true);
  };

  const handleSaveText = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== sub.text) {
      const segs = textToSegments(sub.id, trimmed);
      onUpdate({ text: trimmed, segments: segs });
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveText();
    else if (e.key === 'Escape') { setEditText(sub.text); setEditing(false); }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  };

  const parseTime = (val: string): number | null => {
    const parts = val.split(':');
    if (parts.length === 2) {
      const mins = parseFloat(parts[0]);
      const secs = parseFloat(parts[1]);
      if (!isNaN(mins) && !isNaN(secs)) return mins * 60 + secs;
    } else if (parts.length === 1) {
      const secs = parseFloat(parts[0]);
      if (!isNaN(secs)) return secs;
    }
    return null;
  };

  const handleStartTimeEdit = (e: React.MouseEvent, type: 'start' | 'end') => {
    e.stopPropagation();
    setEditingTime(type);
    setEditTimeValue(formatTime(type === 'start' ? sub.start : sub.end));
  };

  const handleSaveTime = () => {
    if (!editingTime) return;
    const val = parseTime(editTimeValue);
    if (val !== null && val >= 0) {
      const rounded = Math.round(val * 10) / 10;
      onUpdate(editingTime === 'start' ? { start: rounded } : { end: rounded });
    }
    setEditingTime(null);
  };

  const handleSegmentsChange = (segs: TextSegment[]) => {
    const text = segs.map(s => s.text).join('');
    onUpdate({ segments: segs, text });
  };

  const handleDisplayStyleChange = (up: Partial<SubtitleDisplayStyle>) => {
    onUpdate({ displayStyle: { ...displayStyle, ...up } });
  };

  return (
    <div className={`group text-sm relative ${isSelected ? 'bg-primary-light' : ''}`}>
      {/* Main row */}
      <div className={`p-3 cursor-pointer hover:bg-surface/50 transition-colors border-l-2 ${isSelected ? 'border-primary' : 'border-transparent'}`}
        onClick={onSelect}>
        {/* Header */}
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span className="font-medium">#{index + 1}</span>
          <div className="flex items-center gap-1">
            {editingTime === 'start' ? (
              <input ref={timeInputRef} type="text" value={editTimeValue}
                onChange={(e) => setEditTimeValue(e.target.value)}
                onBlur={handleSaveTime} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTime(); if (e.key === 'Escape') setEditingTime(null); }}
                className="w-14 rounded border border-primary px-1 py-0.5 text-[10px] text-center bg-white"
                onClick={(e) => e.stopPropagation()} />
            ) : (
              <span className="cursor-pointer hover:text-primary" onClick={(e) => handleStartTimeEdit(e, 'start')}>{formatTime(sub.start)}</span>
            )}
            <span className="text-text-disabled">&rarr;</span>
            {editingTime === 'end' ? (
              <input ref={timeInputRef} type="text" value={editTimeValue}
                onChange={(e) => setEditTimeValue(e.target.value)}
                onBlur={handleSaveTime} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTime(); if (e.key === 'Escape') setEditingTime(null); }}
                className="w-14 rounded border border-primary px-1 py-0.5 text-[10px] text-center bg-white"
                onClick={(e) => e.stopPropagation()} />
            ) : (
              <span className="cursor-pointer hover:text-primary" onClick={(e) => handleStartTimeEdit(e, 'end')}>{formatTime(sub.end)}</span>
            )}
          </div>
        </div>

        {/* Preview text with full styling */}
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-center pt-0.5 gap-0.5">
            <span className="text-[8px] text-text-secondary/50 font-mono">{sub.y_offset}%</span>
          </div>
          {editing ? (
            <input ref={inputRef} type="text" value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={handleSaveText} onKeyDown={handleKeyDown}
              className="flex-1 rounded border border-primary px-2 py-1 text-sm bg-white"
              onClick={(e) => e.stopPropagation()} />
          ) : (
            <div className="flex-1 line-clamp-2 cursor-text rounded px-1 -mx-1 py-0.5 overflow-hidden"
              onClick={handleStartEdit}>
              <PreviewText segments={segments} displayStyle={displayStyle} fontFamily={fontFamily} fontSize={fontSize} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 mt-1.5 justify-end">
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-primary hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setShowStyle(!showStyle); }}>
            {showStyle ? 'Close Style' : 'Style'}
          </button>
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-primary hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); const nY = Math.min(95, (sub.y_offset || 90) + 5); onUpdate({ y_offset: nY }); }}>
            Y+5
          </button>
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-primary hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); const nY = Math.max(10, (sub.y_offset || 90) - 5); onUpdate({ y_offset: nY }); }}>
            Y-5
          </button>
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-red-500 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); if (videoRef.current) { videoRef.current.currentTime = Math.max(0, sub.start - 2); videoRef.current.play(); } }}>
            Preview
          </button>
          {onRetranscribeSelection && (
            <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-amber-500 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); onRetranscribeSelection(sub.id); }}>
              ✂️ ถอดใหม่
            </button>
          )}
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-red-500 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) onDelete(); }}>
            Del
          </button>
        </div>
      </div>

      {/* Style panel */}
      {showStyle && (
        <div className="border-t border-border bg-white p-3 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
          <div className="font-medium text-[10px] text-text-secondary">Text segments (multi-color)</div>
          <MultiSegmentEditor segments={segments} onChange={handleSegmentsChange} />

          <hr className="border-border" />

          <div className="font-medium text-[10px] text-text-secondary">Box style</div>
          <BoxStyleEditor ds={displayStyle} onChange={(up) => handleDisplayStyleChange(up)} />
        </div>
      )}
    </div>
  );
}
