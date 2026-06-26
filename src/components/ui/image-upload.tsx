'use client';

import { useCallback, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ============================================================
// 🖼️ ImageUpload — Drag & Drop + Browse + Preview
// ============================================================

interface Props {
  /** Current image path (relative to bucket root) */
  value: string;
  /** Called when upload succeeds with the new storage path */
  onChange: (path: string) => void;
  /** Bucket name in Supabase Storage (default: 'site-assets') */
  bucket?: string;
  /** Subfolder inside bucket (e.g. 'logos', 'backgrounds') */
  folder?: string;
  /** Label text shown above */
  label?: string;
  /** Acceptable MIME types (default: image/*) */
  accept?: string;
}

export default function ImageUpload({
  value,
  onChange,
  bucket = 'site-assets',
  folder = 'images',
  label,
  accept = 'image/*',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // ─── อัปโหลดไฟล์ไป Supabase Storage ──────────────────
  const uploadFile = useCallback(async (file: File) => {
    // Validate
    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('ไฟล์ต้องมีขนาดไม่เกิน 5MB');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // สร้าง path: folder/timestamp_random.ext
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const filePath = `${folder}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // ดึง public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl || '';
      setPreview(publicUrl);
      onChange(publicUrl);
    } catch (err: any) {
      console.error('[ImageUpload] Upload error:', err);
      setError(err?.message || 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }, [bucket, folder, onChange, supabase]);

  // ─── เลือกไฟล์ (Browse) ────────────────────────────────
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [uploadFile]);

  // ─── Drag & Drop ──────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  // ─── ลบรูป (reset) ────────────────────────────────────
  const handleRemove = () => {
    setPreview(null);
    onChange('');
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-text-secondary block">{label}</label>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center
          rounded-lg border-2 border-dashed p-4 min-h-[120px]
          cursor-pointer transition-colors
          ${dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-surface/50'
          }
        `}
      >
        {/* Preview */}
        {preview ? (
          <div className="relative w-full group">
            <img
              src={preview}
              alt="Preview"
              className="w-full max-h-32 object-contain rounded"
              onError={() => setPreview(null)}
            />
            {/* Overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded">
              <span className="text-white text-sm font-medium">คลิกเพื่อเปลี่ยนรูป</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-secondary">
            {/* Upload icon */}
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm">
              {uploading ? 'กำลังอัปโหลด...' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}
            </p>
            <p className="text-xs text-muted">PNG, JPG, WEBP ขนาดไม่เกิน 5MB</p>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Uploading spinner */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}

      {/* Current path + remove button */}
      {value && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-secondary truncate" title={value}>
            {value}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            className="text-xs text-danger hover:underline shrink-0"
          >
            ลบรูป
          </button>
        </div>
      )}
    </div>
  );
}
