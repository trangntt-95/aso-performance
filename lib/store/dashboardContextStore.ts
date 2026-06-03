'use client';

import { create } from 'zustand';

/**
 * Snapshot of what the user is currently looking at on the dashboard.
 * Written by pages (mainly Overview) and read by ChatWidget so the AI
 * assistant can scope its answers to the active view instead of guessing.
 */
export interface DashboardContext {
  page?: string;
  window?: string;
  surface?: string;
  country?: string;
  keyword?: string;
  category?: string;
  date?: string; // pinned day when in date mode
}

interface DashboardContextState {
  context: DashboardContext;
  setContext: (ctx: DashboardContext) => void;
  clearContext: () => void;
}

export const useDashboardContext = create<DashboardContextState>((set) => ({
  context: {},
  setContext: (context) => set({ context }),
  clearContext: () => set({ context: {} }),
}));
