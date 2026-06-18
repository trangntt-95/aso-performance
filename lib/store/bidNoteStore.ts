'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BidCapRow } from '@/lib/sheets/types';

// Per-row manual notes for the Bid Recommendations table. Persisted to
// localStorage — survives reloads/redeploys, only ever cleared when the user
// edits a note to empty. Keyed by country × category (one bid row each).
export function bidRowKeyOf(row: Pick<BidCapRow, 'country' | 'category'>): string {
  return `${row.country}||${row.category}`;
}

interface BidNoteState {
  notes: Record<string, string>;
  setNote: (rowKey: string, note: string) => void;
}

export const useBidNoteStore = create<BidNoteState>()(
  persist(
    (set) => ({
      notes: {},
      setNote: (rowKey, note) =>
        set((s) => {
          const next = { ...s.notes };
          // Empty note → drop the key so storage stays clean.
          if (note.trim() === '') delete next[rowKey];
          else next[rowKey] = note;
          return { notes: next };
        }),
    }),
    { name: 'aso-bid-notes' },
  ),
);
