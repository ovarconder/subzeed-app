'use client';

import { useState } from 'react';
import type { TextSegment, TextSegmentStyle, FontWeight } from '@/lib/types';
import { DEFAULT_SEGMENT_STYLE } from '@/lib/types';

// ============================================================
// 🎨 Segment Style Editor Component
// ============================================================
// ใช้สำหรับแก้ไขสไตล์ของแต่ละ segment (ส่วนย่อยของข้อความ)
// รองรับ: สีข้อความ, opacity, stroke, shadow, font-weight
// ============================================================

interface SegmentStyleEditorProps {
  segments: TextSegment[];
  onChange: (segments: TextSegment[]) => void;
}

export function SegmentStyleEditor({ segments, onChange }: SegmentStyleEditorProps) {
  const [selectedSegIdx, setSelectedSegIdx] = useState(0);
  const currentSeg = segments[selectedSegIdx] ?? segments[0];
  const currentStyle = currentSeg?.style ?? DEFAULT_SEGMENT_STYLE;

  if (!segments || segments.length === 0) {
    return (
      <div className="p-3 text-center text-text-secondary text-xs">
        ไม่มี segment ให้แก้ไข
      </div>
    );
  }

  const updateStyle = (updates: Partial<TextSegmentStyle>) => {
    const newSegments = segments.map((seg, i) => {
      if (i === selectedSegIdx) {
        return { ...seg, style: { ...seg.style, ...updates } };
      }
      return seg;
    });
    onChange(newSegments);
  };

  const updateSegmentText = (text: string) => {
    const newSegments = segments.map((seg, i) => {
      if (i === selectedSegIdx) {
        return { ...seg, text };
      }
      return seg;
    });
    onChange(newSegments);
  };

  const addSegment = () => {
    const newSeg: TextSegment = {
      id: `seg-${Date.now()}`,
      text: 'ข้อความ',
      style: { ...DEFAULT_SEGMENT_STYLE },
    };
    onChange([...segments, newSeg]);
    setSelectedSegIdx(segments.length);
  };

  const removeSegment = (idx: number) => {
    if (segments.length <= 1) return; // ต้องมีอย่างน้อย 1 segment
    const newSegments = segments.filter((_, i) => i !== idx);
    onChange(newSegments);
    if (selectedSegIdx >= newSegments.length) {
      setSelectedSegIdx(newSegments.length - 1);
    }
  };

  return (
    <div className="space-y-3 p-3 bg-white rounded-lg border border-border">
      {/* ─── Segment Selector Tabs ─────────────────────── */}
      <div className="flex items-center gap-1 flex-wrap">
        {segments.map((seg, i) => (
          <button
            key={seg.id}
            onClick={() => setSelectedSegIdx(i)}
            className={`text-[10px] px-2 py-1 rounded transition-colors ${
              i === selectedSegIdx
                ? 'bg-primary text-white'
                : 'bg-surface text-text-secondary hover:bg-surface/80'
            }`}
          >
            {seg.text.slice(0, 8)}{seg.text.length > 8 ? '…' : ''}
          </button>
        ))}
        <button
          onClick={addSegment}
          className="text-[10px] px-2 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
          title="เพิ่ม segment ใหม่"
        >
          + เพิ่ม
        </button>
      </div>

      <hr className="border-border" />

      {/* ─── Text Content ──────────────────────────────── */}
      <div>
        <label className="text-[10px] text-text-secondary font-medium block mb-1">
          ข้อความ (segment ที่ {selectedSegIdx + 1})
        </label>
        <input
          type="text"
          value={currentSeg?.text ?? ''}
          onChange={(e) => updateSegmentText(e.target.value)}
          className="w-full rounded border border-border px-2 py-1 text-xs bg-white"
        />
      </div>

      {/* ─── Font Weight ──────────────────────────────── */}
      <div>
        <label className="text-[10px] text-text-secondary font-medium block mb-1">
          รูปแบบตัวอักษร
        </label>
        <div className="flex gap-1">
          {([
            { value: 'normal', label: 'ปกติ' },
            { value: 'bold', label: 'B' },
            { value: 'italic', label: 'I' },
            { value: 'bold-italic', label: 'BI' },
          ] as { value: FontWeight; label: string }[]).map((fw) => (
            <button
              key={fw.value}
              onClick={() => updateStyle({ fontWeight: fw.value })}
              className={`text-[10px] px-3 py-1.5 rounded transition-colors ${
                currentStyle.fontWeight === fw.value
                  ? 'bg-primary text-white'
                  : 'bg-surface text-text-secondary hover:bg-surface/80'
              } ${fw.value.includes('bold') ? 'font-bold' : ''} ${fw.value.includes('italic') ? 'italic' : ''}`}
            >
              {fw.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Fill (Text Color + Opacity) ──────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-text-secondary font-medium block mb-1">
            สีข้อความ (Fill)
          </label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={currentStyle.color}
              onChange={(e) => updateStyle({ color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-border"
            />
            <input
              type="text"
              value={currentStyle.color}
              onChange={(e) => updateStyle({ color: e.target.value })}
              className="flex-1 rounded border border-border px-2 py-1 text-[10px] bg-white font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-text-secondary font-medium block mb-1">
            ความทึบ (Opacity)
          </label>
          <div className="flex items-center gap-1">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={currentStyle.opacity}
              onChange={(e) => updateStyle({ opacity: Number(e.target.value) })}
              className="flex-1 h-4 accent-primary"
            />
            <span className="text-[10px] text-text-secondary w-8 text-right">
              {Math.round(currentStyle.opacity * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* ─── Stroke ────────────────────────────────────── */}
      <details className="bg-surface rounded p-2">
        <summary className="text-[10px] font-medium text-text-secondary cursor-pointer select-none">
          🖊️ Stroke (ขอบ)
        </summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-[10px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={currentStyle.strokeActive}
              onChange={(e) => updateStyle({ strokeActive: e.target.checked })}
              className="accent-primary w-3 h-3"
            />
            เปิดใช้ Stroke
          </label>
          {currentStyle.strokeActive && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">สี Stroke</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={currentStyle.strokeColor}
                      onChange={(e) => updateStyle({ strokeColor: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer border border-border"
                    />
                    <input
                      type="text"
                      value={currentStyle.strokeColor}
                      onChange={(e) => updateStyle({ strokeColor: e.target.value })}
                      className="flex-1 rounded border border-border px-2 py-1 text-[10px] bg-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">ความหนา</label>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={0.5}
                    value={currentStyle.strokeWidth}
                    onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })}
                    className="w-full h-4 accent-primary"
                  />
                  <span className="text-[10px] text-text-secondary">{currentStyle.strokeWidth}px</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-text-secondary block mb-1">ความทึบ Stroke</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={currentStyle.strokeOpacity}
                  onChange={(e) => updateStyle({ strokeOpacity: Number(e.target.value) })}
                  className="w-full h-4 accent-primary"
                />
                <span className="text-[10px] text-text-secondary">{Math.round(currentStyle.strokeOpacity * 100)}%</span>
              </div>
            </>
          )}
        </div>
      </details>

      {/* ─── Shadow ──────────────────────────────────── */}
      <details className="bg-surface rounded p-2">
        <summary className="text-[10px] font-medium text-text-secondary cursor-pointer select-none">
          🌓 Shadow (เงา)
        </summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-[10px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={currentStyle.shadowActive}
              onChange={(e) => updateStyle({ shadowActive: e.target.checked })}
              className="accent-primary w-3 h-3"
            />
            เปิดใช้ Shadow
          </label>
          {currentStyle.shadowActive && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">สีเงา</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={currentStyle.shadowColor}
                      onChange={(e) => updateStyle({ shadowColor: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer border border-border"
                    />
                    <input
                      type="text"
                      value={currentStyle.shadowColor}
                      onChange={(e) => updateStyle({ shadowColor: e.target.value })}
                      className="flex-1 rounded border border-border px-2 py-1 text-[10px] bg-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">ความทึบเงา</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={currentStyle.shadowOpacity}
                    onChange={(e) => updateStyle({ shadowOpacity: Number(e.target.value) })}
                    className="w-full h-4 accent-primary"
                  />
                  <span className="text-[10px] text-text-secondary">{Math.round(currentStyle.shadowOpacity * 100)}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">Offset X (px)</label>
                  <input
                    type="range"
                    min={-20}
                    max={20}
                    step={1}
                    value={currentStyle.shadowOffsetX}
                    onChange={(e) => updateStyle({ shadowOffsetX: Number(e.target.value) })}
                    className="w-full h-4 accent-primary"
                  />
                  <span className="text-[10px] text-text-secondary">{currentStyle.shadowOffsetX}px</span>
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">Offset Y (px)</label>
                  <input
                    type="range"
                    min={-20}
                    max={20}
                    step={1}
                    value={currentStyle.shadowOffsetY}
                    onChange={(e) => updateStyle({ shadowOffsetY: Number(e.target.value) })}
                    className="w-full h-4 accent-primary"
                  />
                  <span className="text-[10px] text-text-secondary">{currentStyle.shadowOffsetY}px</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">Blur (px)</label>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={currentStyle.shadowBlur}
                    onChange={(e) => updateStyle({ shadowBlur: Number(e.target.value) })}
                    className="w-full h-4 accent-primary"
                  />
                  <span className="text-[10px] text-text-secondary">{currentStyle.shadowBlur}px</span>
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">องศา</label>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={currentStyle.shadowAngle}
                    onChange={(e) => updateStyle({ shadowAngle: Number(e.target.value) })}
                    className="w-full h-4 accent-primary"
                  />
                  <span className="text-[10px] text-text-secondary">{currentStyle.shadowAngle}°</span>
                </div>
              </div>
            </>
          )}
        </div>
      </details>

      {/* ─── Delete Segment ─────────────────────────────── */}
      {segments.length > 1 && (
        <button
          onClick={() => removeSegment(selectedSegIdx)}
          className="w-full text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 py-1.5 rounded transition-colors"
        >
          🗑️ ลบ segment นี้
        </button>
      )}
    </div>
  );
}
