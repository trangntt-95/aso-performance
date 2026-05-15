'use client';

import { create } from 'zustand';

export type CategoryWindow = 'L3' | 'L7' | 'L14' | 'L30' | 'L90';

interface CategoryDetailState {
  open: boolean;
  category: string | null;
  window: CategoryWindow;
  openCategory: (category: string, window: CategoryWindow) => void;
  close: () => void;
}

export const useCategoryDetailStore = create<CategoryDetailState>((set) => ({
  open: false,
  category: null,
  window: 'L7',
  openCategory: (category, window) => set({ open: true, category, window }),
  close: () => set({ open: false }),
}));
