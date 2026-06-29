// ============================================================
// 🪝 useVideoStorage — Hook สำหรับจัดการวิดีโอแบบ local-first
// ============================================================
// 
// flow:
//   เมื่อ user เลือกวิดีโอ → save ลง IndexedDB + สร้าง Object URL
//   เมื่อเปิด project เก่า → โหลดจาก IndexedDB → สร้าง Object URL
//   เมื่อ user ลบ project → ลบวิดีโอออกจาก IndexedDB
// ============================================================

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSubtitleStore } from '@/lib/store/subtitle-store';
import {
  saveVideoLocally,
  loadVideoLocally,
  removeVideoLocally,
} from '@/lib/local-video-storage';

export function useVideoStorage() {
  const store = useSubtitleStore();
  const urlRef = useRef<string | null>(null);

  /**
   * บันทึกวิดีโอจาก File → IndexedDB + สร้าง Object URL
   * เรียกจาก handleFileSelect
   */
  const storeVideo = useCallback(
    async (projectId: string, file: File) => {
      // Revoke URL เก่า
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      try {
        // บันทึกไฟล์ลง IndexedDB
        await saveVideoLocally(projectId, file);

        // สร้าง Object URL ใหม่
        const url = URL.createObjectURL(file);
        urlRef.current = url;

        // อัปเดต store
        store.setVideoFile(file);
        // setVideoUrl จะถูกตั้งจาก store.setVideoFile อยู่แล้ว
        // แต่ถ้าต้องการ force ให้ sync:
        store.setVideoUrl(url);

        return url;
      } catch (err) {
        console.error('[useVideoStorage] Failed to store video:', err);
        // fallback: ใช้ Object URL เฉย ๆ โดยไม่เก็บ IndexedDB
        const url = URL.createObjectURL(file);
        urlRef.current = url;
        store.setVideoFile(file);
        return url;
      }
    },
    [store],
  );

  /**
   * โหลดวิดีโอจาก IndexedDB (สำหรับเปิด project เก่า)
   */
  const loadVideo = useCallback(
    async (projectId: string) => {
      const video = await loadVideoLocally(projectId);
      if (!video) {
        console.warn('[useVideoStorage] No local video found for project:', projectId);
        return null;
      }

      // revoke URL เก่า
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
      urlRef.current = video.videoUrl;

      // จำลอง File object (แค่บาง property)
      const mockFile = new File([], video.fileName, { type: 'video/mp4' });
      Object.defineProperty(mockFile, 'size', { value: video.fileSize });

      store.setVideoUrl(video.videoUrl);
      // เก็บ fileName ผ่าน videoFile แม้จะเป็น mock
      store.setVideoFile(mockFile);

      return video.videoUrl;
    },
    [store],
  );

  /**
   * ลบวิดีโอออกจาก IndexedDB + revoke URL
   */
  const removeVideo = useCallback(
    async (projectId: string) => {
      await removeVideoLocally(projectId);
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      store.resetProject();
    },
    [store],
  );

  // Cleanup เมื่อ component unmount
  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    };
  }, []);

  return { storeVideo, loadVideo, removeVideo };
}
