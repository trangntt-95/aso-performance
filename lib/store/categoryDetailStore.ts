'use client';

import { create } from 'zustand';

export type CategoryWindow = 'L3' | 'L7' | 'L14' | 'L30' | 'L90';
export type CategoryDetailSurface = 'all' | 'organic' | 'paid';

interface CategoryDetailContext {
  country?: string | null;
  surface?: CategoryDetailSurface;
}

interface CategoryDetailState {
  open: boolean;
  category: string | null;
  window: CategoryWindow;
  // Inherited from the page's active filters so the deep-dive matches the page.
  country: string | null;
  surface: CategoryDetailSurface;
  openCategory: (category: string, window: CategoryWindow, ctx?: CategoryDetailContext) => void;
  close: () => void;
}

export const useCategoryDetailStore = create<CategoryDetailState>((set) => ({
  open: false,
  category: null,
  window: 'L7',
  country: null,
  surface: 'all',
  openCategory: (category, window, ctx) =>
    set({
      open: true,
      category,
      window,
      country: ctx?.country ?? null,
      surface: ctx?.surface ?? 'all',
    }),
  close: () => set({ open: false }),
}));
