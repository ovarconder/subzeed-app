'use client';

import { useState, useRef, useEffect } from 'react';
import type { SubtitleEntry, TextSegmentStyle, SubtitleDisplayStyle } from '@/lib/types';
import { textToSegments, DEFAULT_SEGMENT_STYLE, DEFAULT_DISPLAY_STYLE } from '@/lib/types';

interface SubtitleItemProps {
  sub: SubtitleEntry;
  index: number;
  isSelected: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSelect: () => void;
  onUpdate: (updates: Partial<SubtitleEntry>) => void;
  onDelete: () => void;
}

export function SubtitleItem({
  sub, index, isSelected, videoRef, onSelect, onUpdate, onDelete,
}: SubtitleItemProps) {
  const [showStyle, setShowStyle] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(sub.text);
  const [editingTime, setEditingTime] = useState<'start' | 'end' | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  // ใช segment แรกเปนตัวแทนสี/สไตล
  const seg = sub.segments?.[0];
  const segStyle: TextSegmentStyle = seg?.style ?? DEFAULT_SEGMENT_STYLE;

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
      const segments = textToSegments(sub.id, trimmed);
      onUpdate({ text: trimmed, segments });
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveText();
    else if (e.key === 'Escape') { setEditText(sub.text); setEditing(false); }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return `${m}:${sec.padStart(4, '0')}`;
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

  const updateSegStyle = (updates: Partial<TextSegmentStyle>) => {
    const segments = sub.segments && sub.segments.length > 0
      ? sub.segments.map((s, i) => i === 0 ? { ...s, style: { ...s.style, ...updates } } : s)
      : [{ id: `${sub.id}-seg-0`, text: sub.text, style: { ...DEFAULT_SEGMENT_STYLE, ...updates } }];
    onUpdate({ segments });
  };

  const updateDisplayStyle = (updates: Partial<SubtitleDisplayStyle>) => {
    const current = sub.displayStyle ?? DEFAULT_DISPLAY_STYLE;
    onUpdate({ displayStyle: { ...current, ...updates } });
  };

  const ds = sub.displayStyle ?? DEFAULT_DISPLAY_STYLE;

  return (
    <div className={`group text-sm relative ${isSelected ? 'bg-primary-light' : ''}`}>
      {/* Main row */}
      <div
        className={`p-3 cursor-pointer hover:bg-surface/50 transition-colors border-l-2 ${
          isSelected ? 'border-primary' : 'border-transparent'
        }`}
        onClick={onSelect}
      >
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

        {/* Text */}
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
            <div className="flex-1 line-clamp-2 cursor-text rounded px-1 -mx-1 py-0.5"
              onClick={handleStartEdit}
              style={{
                color: segStyle.color,
                fontWeight: segStyle.fontWeight === 'bold' || segStyle.fontWeight === 'bold-italic' ? 'bold' : 'normal',
                fontStyle: segStyle.fontWeight === 'italic' || segStyle.fontWeight === 'bold-italic' ? 'italic' : 'normal',
              }}>
              {sub.text}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 mt-1.5 justify-end">
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-primary hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setShowStyle(!showStyle); }}>
            {showStyle ? 'Close Style' : 'Style'}
          </button>
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-primary hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); const nY = Math.min(95, (sub.y_offset || 90) + 5); onUpdate({ y_offset: nY }); }}
            title="Move up">Y +5</button>
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-primary hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); const nY = Math.max(10, (sub.y_offset || 90) - 5); onUpdate({ y_offset: nY }); }}
            title="Move down">Y -5</button>
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-red-500 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); if (videoRef.current) { videoRef.current.currentTime = Math.max(0, sub.start - 2); videoRef.current.play(); } }}>
            Preview</button>
          <button className="text-[10px] px-2 py-1 rounded bg-surface text-text-secondary hover:bg-red-500 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) onDelete(); }}>
            Delete</button>
        </div>
      </div>

      {/* Style panel inline */}
      {showStyle && (
        <div className="border-t border-border bg-white p-3 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
          {/* Text color & opacity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-secondary font-medium block mb-1">Text color</label>
              <div className="flex items-center gap-1">
                <input type="color" value={segStyle.color}
                  onChange={(e) => updateSegStyle({ color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-border shrink-0" />
                <input type="text" value={segStyle.color}
                  onChange={(e) => updateSegStyle({ color: e.target.value })}
                  className="flex-1 rounded border border-border px-2 py-1 text-[10px] bg-white font-mono" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-text-secondary font-medium block mb-1">Opacity</label>
              <div className="flex items-center gap-1">
                <input type="range" min={0} max={1} step={0.05} value={segStyle.opacity}
                  onChange={(e) => updateSegStyle({ opacity: Number(e.target.value) })}
                  className="flex-1 h-4 accent-primary" />
                <span className="text-[10px] text-text-secondary w-8 text-right">{Math.round(segStyle.opacity * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Font weight */}
          <div>
            <label className="text-[10px] text-text-secondary font-medium block mb-1">Font weight</label>
            <div className="flex gap-1">
              {[
                { v: 'normal' as const, l: 'Normal' },
                { v: 'bold' as const, l: 'Bold' },
                { v: 'italic' as const, l: 'Italic' },
                { v: 'bold-italic' as const, l: 'B+I' },
              ].map(fw => (
                <button key={fw.v} onClick={() => updateSegStyle({ fontWeight: fw.v })}
                  className={`text-[10px] px-3 py-1.5 rounded ${segStyle.fontWeight === fw.v ? 'bg-primary text-white' : 'bg-surface text-text-secondary'}`}>
                  {fw.l}
                </button>
              ))}
            </div>
          </div>

          {/* Stroke */}
          <details>
            <summary className="text-[10px] font-medium text-text-secondary cursor-pointer select-none">Stroke (outline)</summary>
            <div className="mt-2 space-y-2 pl-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-text-secondary block">Color</label>
                  <input type="color" value={segStyle.strokeColor}
                    onChange={(e) => updateSegStyle({ strokeColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border" />
                </div>
                <div>
                  <label className="text-[9px] text-text-secondary block">Width</label>
                  <input type="range" min={0} max={8} step={0.5} value={segStyle.strokeWidth}
                    onChange={(e) => updateSegStyle({ strokeWidth: Number(e.target.value) })}
                    className="w-full h-4 accent-primary" />
                  <span className="text-[9px] text-text-secondary">{segStyle.strokeWidth}px</span>
                </div>
              </div>
              <div>
                <label className="text-[9px] text-text-secondary block">Opacity</label>
                <input type="range" min={0} max={1} step={0.05} value={segStyle.strokeOpacity}
                  onChange={(e) => updateSegStyle({ strokeOpacity: Number(e.target.value) })}
                  className="w-full h-4 accent-primary" />
                <span className="text-[9px] text-text-secondary">{Math.round(segStyle.strokeOpacity * 100)}%</span>
              </div>
            </div>
          </details>

          {/* Shadow */}
          <details>
            <summary className="text-[10px] font-medium text-text-secondary cursor-pointer select-none">Text shadow</summary>
            <div className="mt-2 space-y-2 pl-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-text-secondary block">Color</label>
                  <input type="color" value={segStyle.shadowColor}
                    onChange={(e) => updateSegStyle({ shadowColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border" />
                  <input type="text" value={segStyle.shadowColor}
                    onChange={(e) => updateSegStyle({ shadowColor: e.target.value })}
                    className="w-full rounded border border-border px-1 py-0.5 text-[9px] bg-white font-mono mt-1" />
                </div>
                <div>
                  <label className="text-[9px] text-text-secondary block">Opacity</label>
                  <input type="range" min={0} max={1} step={0.05} value={segStyle.shadowOpacity}
                    onChange={(e) => updateSegStyle({ shadowOpacity: Number(e.target.value) })}
                    className="w-full h-4 accent-primary" />
                  <span className="text-[9px] text-text-secondary">{Math.round(segStyle.shadowOpacity * 100)}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-text-secondary block">Blur</label>
                  <input type="range" min={0} max={30} step={1} value={segStyle.shadowBlur}
                    onChange={(e) => updateSegStyle({ shadowBlur: Number(e.target.value) })}
                    className="w-full h-4 accent-primary" />
                  <span className="text-[9px] text-text-secondary">{segStyle.shadowBlur}px</span>
                </div>
                <div>
                  <label className="text-[9px] text-text-secondary block">Angle</label>
                  <input type="range" min={0} max={360} step={1} value={segStyle.shadowAngle}
                    onChange={(e) => updateSegStyle({ shadowAngle: Number(e.target.value) })}
                    className="w-full h-4 accent-primary" />
                  <span className="text-[9px] text-text-secondary">{segStyle.shadowAngle}&deg;</span>
                </div>
              </div>
            </div>
          </details>

          <hr className="border-border" />

          {/* Background box */}
          <div className="text-[10px] font-medium text-text-secondary">Background box</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-text-secondary block">Color</label>
              <div className="flex items-center gap-1">
                <input type="color" value={ds.bgColor}
                  onChange={(e) => updateDisplayStyle({ bgColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-border shrink-0" />
                <input type="text" value={ds.bgColor}
                  onChange={(e) => updateDisplayStyle({ bgColor: e.target.value })}
                  className="flex-1 rounded border border-border px-1 py-0.5 text-[9px] bg-white font-mono" />
              </div>
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block">Opacity</label>
              <div className="flex items-center gap-1">
                <input type="range" min={0} max={1} step={0.05} value={ds.bgOpacity}
                  onChange={(e) => updateDisplayStyle({ bgOpacity: Number(e.target.value) })}
                  className="flex-1 h-4 accent-primary" />
                <span className="text-[8px] text-text-secondary w-6">{Math.round(ds.bgOpacity * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-text-secondary block">Radius</label>
              <input type="range" min={0} max={30} step={1} value={ds.borderRadius}
                onChange={(e) => updateDisplayStyle({ borderRadius: Number(e.target.value) })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{ds.borderRadius}px</span>
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block">Pad X</label>
              <input type="range" min={0} max={40} step={1} value={ds.paddingX}
                onChange={(e) => updateDisplayStyle({ paddingX: Number(e.target.value) })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{ds.paddingX}px</span>
            </div>
            <div>
              <label className="text-[9px] text-text-secondary block">Pad Y</label>
              <input type="range" min={0} max={30} step={1} value={ds.paddingY}
                onChange={(e) => updateDisplayStyle({ paddingY: Number(e.target.value) })}
                className="w-full h-4 accent-primary" />
              <span className="text-[9px] text-text-secondary">{ds.paddingY}px</span>
            </div>
          </div>

          {/* Box shadow */}
          <details>
            <summary className="text-[10px] font-medium text-text-secondary cursor-pointer select-none">Box shadow</summary>
            <div className="mt-2 space-y-2 pl-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-text-secondary block">Offset X</label>
                  <input type="range" min={-20} max={20} step={1} value={ds.boxShadow.offsetX}
                    onChange={(e) => updateDisplayStyle({ boxShadow: { ...ds.boxShadow, offsetX: Number(e.target.value) } })}
                    className="w-full h-4 accent-primary" />
                </div>
                <div>
                  <label className="text-[9px] text-text-secondary block">Offset Y</label>
                  <input type="range" min={-20} max={20} step={1} value={ds.boxShadow.offsetY}
                    onChange={(e) => updateDisplayStyle({ boxShadow: { ...ds.boxShadow, offsetY: Number(e.target.value) } })}
                    className="w-full h-4 accent-primary" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-text-secondary block">Blur</label>
                  <input type="range" min={0} max={30} step={1} value={ds.boxShadow.blur}
                    onChange={(e) => updateDisplayStyle({ boxShadow: { ...ds.boxShadow, blur: Number(e.target.value) } })}
                    className="w-full h-4 accent-primary" />
                </div>
                <div>
                  <label className="text-[9px] text-text-secondary block">Spread</label>
                  <input type="range" min={0} max={20} step={1} value={ds.boxShadow.spread}
                    onChange={(e) => updateDisplayStyle({ boxShadow: { ...ds.boxShadow, spread: Number(e.target.value) } })}
                    className="w-full h-4 accent-primary" />
                </div>
                <div>
                  <label className="text-[9px] text-text-secondary block">Opacity</label>
                  <input type="range" min={0} max={1} step={0.05} value={ds.boxShadow.opacity}
                    onChange={(e) => updateDisplayStyle({ boxShadow: { ...ds.boxShadow, opacity: Number(e.target.value) } })}
                    className="w-full h-4 accent-primary" />
                </div>
              </div>
              <div>
                <label className="text-[9px] text-text-secondary block">Color</label>
                <input type="color" value={ds.boxShadow.color}
                  onChange={(e) => updateDisplayStyle({ boxShadow: { ...ds.boxShadow, color: e.target.value } })}
                  className="w-8 h-8 rounded cursor-pointer border border-border" />
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
