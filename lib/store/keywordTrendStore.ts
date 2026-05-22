'use client';

import { create } from 'zustand';

export type KeywordTrendSurface = 'all' | 'organic' | 'paid';

interface KeywordTrendState {
  open: boolean;
  keyword: string | null;
  country?: string;
  surface: KeywordTrendSurface;
  openKeyword: (keyword: string, opts?: { country?: string; surface?: KeywordTrendSurface }) => void;
  close: () => void;
}

export const useKeywordTrendStore = create<KeywordTrendState>((set) => ({
  open: false,
  keyword: null,
  country: undefined,
  surface: 'all',
  openKeyword: (keyword, opts) =>
    set({
      open: true,
      keyword,
      country: opts?.country,
      surface: opts?.surface ?? 'all',
    }),
  close: () => set({ open: false }),
}));
