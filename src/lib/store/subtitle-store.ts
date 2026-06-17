'use client';

import { create } from 'zustand';
import type { SubtitleEntry, Project, SubscriptionTier } from '@/lib/types';

interface SubtitleState {
  // Current project
  currentProject: Project | null;
  subtitles: SubtitleEntry[];

  // User info
  userTier: SubscriptionTier;
  quotaUsed: number;
  quotaTotal: number;

  // Video
  videoFile: File | null;
  videoUrl: string | null;
  isProcessing: boolean;
  processingProgress: number;

  // UI
  selectedSubtitleId: string | null;
  isPlaying: boolean;
  currentTime: number;

  // Actions
  setCurrentProject: (project: Project | null) => void;
  setSubtitles: (subtitles: SubtitleEntry[]) => void;
  addSubtitle: (subtitle: SubtitleEntry) => void;
  updateSubtitle: (id: string, updates: Partial<SubtitleEntry>) => void;
  removeSubtitle: (id: string) => void;
  reorderSubtitles: (subtitles: SubtitleEntry[]) => void;
  selectSubtitle: (id: string | null) => void;

  setVideoFile: (file: File | null) => void;
  setVideoUrl: (url: string | null) => void;
  setIsProcessing: (val: boolean) => void;
  setProcessingProgress: (val: number) => void;

  setUserTier: (tier: SubscriptionTier) => void;
  setQuota: (used: number, total: number) => void;

  setIsPlaying: (val: boolean) => void;
  setCurrentTime: (val: number) => void;

  // Reset
  resetProject: () => void;
}

const initialState = {
  currentProject: null,
  subtitles: [],
  userTier: 'free' as SubscriptionTier,
  quotaUsed: 0,
  quotaTotal: 20,
  videoFile: null,
  videoUrl: null,
  isProcessing: false,
  processingProgress: 0,
  selectedSubtitleId: null,
  isPlaying: false,
  currentTime: 0,
};

export const useSubtitleStore = create<SubtitleState>((set) => ({
  ...initialState,

  setCurrentProject: (project) =>
    set({
      currentProject: project,
      subtitles: project?.subtitles ?? [],
    }),

  setSubtitles: (subtitles) => set({ subtitles }),

  addSubtitle: (subtitle) =>
    set((state) => ({
      subtitles: [...state.subtitles, subtitle].sort((a, b) => a.start - b.start),
    })),

  updateSubtitle: (id, updates) =>
    set((state) => ({
      subtitles: state.subtitles.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  removeSubtitle: (id) =>
    set((state) => ({
      subtitles: state.subtitles.filter((s) => s.id !== id),
    })),

  reorderSubtitles: (subtitles) => set({ subtitles }),

  selectSubtitle: (id) => set({ selectedSubtitleId: id }),

  setVideoFile: (file) => {
    // Revoke old URL
    if (file) {
      const url = URL.createObjectURL(file);
      return set({ videoFile: file, videoUrl: url });
    }
    return set({ videoFile: null, videoUrl: null });
  },

  setVideoUrl: (url) => set({ videoUrl: url }),
  setIsProcessing: (val) => set({ isProcessing: val }),
  setProcessingProgress: (val) => set({ processingProgress: val }),

  setUserTier: (tier) => set({ userTier: tier }),
  setQuota: (used, total) => set({ quotaUsed: used, quotaTotal: total }),

  setIsPlaying: (val) => set({ isPlaying: val }),
  setCurrentTime: (val) => set({ currentTime: val }),

  resetProject: () =>
    set({
      currentProject: null,
      subtitles: [],
      videoFile: null,
      videoUrl: null,
      isProcessing: false,
      processingProgress: 0,
      selectedSubtitleId: null,
    }),
}));
