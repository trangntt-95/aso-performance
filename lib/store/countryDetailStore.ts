'use client';

import { create } from 'zustand';

interface CountryDetailState {
  open: boolean;
  country: string | null;
  window: 'L3' | 'L7' | 'L14' | 'L30' | 'L90';
  openCountry: (country: string, window: CountryDetailState['window']) => void;
  close: () => void;
}

export const useCountryDetailStore = create<CountryDetailState>((set) => ({
  open: false,
  country: null,
  window: 'L7',
  openCountry: (country, window) => set({ open: true, country, window }),
  close: () => set({ open: false }),
}));
