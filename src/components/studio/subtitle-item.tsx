'use client';

import { useState, useRef, useEffect } from 'react';
import type { SubtitleEntry, TextSegment, SubtitleDisplayStyle } from '@/lib/types';
import { textToSegments, DEFAULT_DISPLAY_STYLE } from '@/lib/types';

interface SubtitleItemProps {
  sub: SubtitleEntry;
  index: number;
  isSelected: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSelect: () => void;
  onUpdate: (updates: Partial<SubtitleEntry>) => void;
  onDelete: () => void;
}

/**
 * SubtitleItem — แสดง 1 รายการใน sidebar
 * - คลิกเพื่อเลือก
 * - คลิกข้อความเพื่อแก้ไข (inline edit)
 * - Enter = บันทึก, Escape = ยกเลิก
 * - 👆 ลากเพื่อเปลี่ยนตำแหน่ง Y บนวิดีโอ
 */
export function SubtitleItem({
  sub, index, isSelected, videoRef, onSelect, onUpdate, onDelete,
}: SubtitleItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(sub.text);
  const [editingTime, setEditingTime] = useState<'start' | 'end' | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      className={`group p-3 cursor-pointer hover:bg-surface text-sm transition-colors relative ${
        isSelected ? 'bg-primary-light border-l-2 border-primary' : 'border-l-2 border-transparent'
      }`}
      onClick={onSelect}
    >
      {/* Header: # + timestamp */}
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
          <span className="text-text-disabled">→</span>
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

      {/* Text + Y-position row */}
      <div className="flex items-start gap-2">
        {/* Y-position drag handle */}
        <div className="flex flex-col items-center pt-0.5 gap-0.5">
          <button
            className="text-[9px] text-text-secondary/50 hover:text-text-secondary cursor-grab active:cursor-grabbing select-none"
            title="ลากเพื่อเปลี่ยนตำแหน่งแนวตั้งบนวิดีโอ"
            onMouseDown={(e) => {
              e.stopPropagation();
              // Y-position via slider-like up/down
            }}
          >
            ⠿
          </button>
          <span className="text-[8px] text-text-secondary/50 font-mono">{sub.y_offset}%</span>
        </div>

        {/* Text content */}
        {editing ? (
          <input ref={inputRef} type="text" value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSaveText} onKeyDown={handleKeyDown}
            className="flex-1 rounded border border-primary px-2 py-1 text-sm bg-white"
            onClick={(e) => e.stopPropagation()} />
        ) : (
          <div className="flex-1 line-clamp-2 cursor-text hover:bg-white/50 rounded px-1 -mx-1 py-0.5 text-text-primary"
            onClick={handleStartEdit} title="คลิกเพื่อแก้ไขข้อความ">
            {sub.text}
          </div>
        )}
      </div>

      {/* Style indicator */}
      {isSelected && (
        <div className="flex gap-1 mt-1 justify-end">
          <button className="text-[9px] text-text-secondary/60 hover:text-primary px-1 py-0.5"
            onClick={(e) => {
              e.stopPropagation();
              // increase Y
              const newY = Math.min(95, (sub.y_offset || 90) + 5);
              onUpdate({ y_offset: newY });
            }}
            title="เลื่อนขึ้น ↑">
            ↑ Y
          </button>
          <button className="text-[9px] text-text-secondary/60 hover:text-primary px-1 py-0.5"
            onClick={(e) => {
              e.stopPropagation();
              const newY = Math.max(10, (sub.y_offset || 90) - 5);
              onUpdate({ y_offset: newY });
            }}
            title="เลื่อนลง ↓">
            ↓ Y
          </button>
          <button className="text-[9px] text-text-secondary hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); if (videoRef.current) { videoRef.current.currentTime = Math.max(0, sub.start - 2); videoRef.current.play(); } }}
            title="เล่นก่อนหน้านี้ 2 วิ">
            ◀ เล่นก่อน
          </button>
          <button className="text-[9px] text-text-secondary hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); if (confirm('ลบซับไตเติลนี้?')) onDelete(); }}
            title="ลบ">
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}
