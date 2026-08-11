'use client';

// ============================================================
// 🧪 DEV TEST PAGE — burn subtitle 1 บรรทัด กับวิดีโอสั้น
// ============================================================
// ใช้ขั้นตอน 5 spike เพื่อพิสูจน์ว่า pipeline render ทำงาน ผ่านการ
// burn วิดีโอ 1 บรรทัด ไม่มี effect พิเศษ ก่อนเพิ่ม feature อื่น
// ============================================================

import { useRef, useState } from 'react';
import { renderSubtitleVideo } from '@/lib/subtitle-render/render-pipeline';
import type { RenderJobConfig } from '@/lib/subtitle-render/types';

export default function RenderTestPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleText, setSubtitleText] = useState('สวัสดีครับ ทดสอบซับ');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(3);
  const [fontFamily, setFontFamily] = useState('Arimo');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState('');

  const handleBurn = async () => {
    if (!videoFile) {
      alert('กรุณาเลือกวิดีโอ');
      return;
    }

    setIsRunning(true);
    setProgress('เริ่มต้น...');
    try {
      const config: RenderJobConfig = {
        videoSource: videoFile,
        cues: [
          { start, end, text: subtitleText },
        ],
        style: {
          fontFamily,
          fontSize: 36,
          position: 'bottom',
          y_offset: 0,
          defaultSegmentStyle: {
            color: '#FFFFFF',
            opacity: 1,
            strokeActive: false,
            shadowActive: false,
            strokeColor: '#000000',
            strokeWidth: 2,
            strokeOpacity: 1,
            shadowColor: '#000000',
            shadowOpacity: 0.5,
            shadowOffsetX: 2,
            shadowOffsetY: 2,
            shadowBlur: 4,
            shadowAngle: 0,
            fontWeight: 'normal',
          },
        },
        output: {
          format: 'mp4',
          quality: 'fast',
          fps: 30,
          useHardwareAccel: false,
          gifMaxWidth: 480,
          gifFrameSkip: 1,
        },
      };

      const blob = await renderSubtitleVideo(config, (e) => {
        setProgress(`${e.message} (${e.percent}%)`);
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'burn-output.mp4';
      a.click();
      setProgress('เสร็จสิ้น! ดาวน์โหลดแล้ว');
    } catch (err: any) {
      setProgress(`❌ ${err?.message || err}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">🧪 Render Spike (ขั้นตอน 5)</h1>

      <div className="space-y-4 bg-white p-6 rounded-lg shadow">
        <div>
          <label className="block text-sm font-medium mb-1">วิดีโอ (สั้นมาก ~5s)</label>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
          {videoFile && <p className="text-xs text-green-600 mt-1">✅ {videoFile.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">ข้อความซับ (1 บรรทัด)</label>
          <input
            value={subtitleText}
            onChange={(e) => setSubtitleText(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">เริ่ม (วิ)</label>
            <input
              type="number" value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">จบ (วิ)</label>
            <input
              type="number" value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">ฟอนต์</label>
          <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
            <option value="Arimo">Arimo</option>
            <option value="Kanit">Kanit</option>
            <option value="Itim">Itim</option>
            <option value="Prompt">Prompt</option>
            <option value="Sarabun">Sarabun</option>
            <option value="Mali">Mali</option>
            <option value="Noto Sans Thai">Noto Sans Thai</option>
          </select>
        </div>

        <button
          onClick={handleBurn}
          disabled={isRunning}
          className="w-full bg-blue-600 text-white font-medium py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isRunning ? 'กำลัง render...' : '🔥 Burn ลงวิดีโอ'}
        </button>

        {progress && <div className="text-xs mt-2 text-gray-600 break-words">{progress}</div>}
      </div>
    </main>
  );
}
