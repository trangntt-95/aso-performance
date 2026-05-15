'use client';

import { create } from 'zustand';

interface KeywordTrendState {
  open: boolean;
  keyword: string | null;
  country?: string;
  openKeyword: (keyword: string, country?: string) => void;
  close: () => void;
}

export const useKeywordTrendStore = create<KeywordTrendState>((set) => ({
  open: false,
  keyword: null,
  country: undefined,
  openKeyword: (keyword, country) => set({ open: true, keyword, country }),
  close: () => set({ open: false }),
}));
