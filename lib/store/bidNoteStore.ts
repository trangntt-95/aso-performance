'use client';

import { create } from 'zustand';
import type { BidCapRow } from '@/lib/sheets/types';

// Per-row notes for the Bid Recommendations table, persisted server-side in the
// `Bid_Notes` sheet tab (via /api/bid-notes) so they survive reloads, are shared
// across users/devices, and are only removed when the user empties them.
// Local state is updated optimistically; writes are debounced per row.
export function bidRowKeyOf(row: Pick<BidCapRow, 'country' | 'category'>): string {
  return `${row.country}||${row.category}`;
}

interface BidNoteState {
  notes: Record<string, string>;
  loaded: boolean;
  /** non-null while a save is in flight or pending, for the saving indicator. */
  saving: Record<string, boolean>;
  load: () => Promise<void>;
  setNote: (country: string, category: string, note: string) => void;
}

// Per-row debounce timers (module scope — not part of persisted state).
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const SAVE_DELAY = 700;

async function postNote(country: string, category: string, note: string) {
  const res = await fetch('/api/bid-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country, category, note }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg?.error || `Save failed (${res.status})`);
  }
}

export const useBidNoteStore = create<BidNoteState>()((set) => ({
  notes: {},
  loaded: false,
  saving: {},
  load: async () => {
    try {
      const res = await fetch('/api/bid-notes');
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = (await res.json()) as { notes?: Record<string, string> };
      set({ notes: data.notes ?? {}, loaded: true });
    } catch {
      // Leave notes empty on failure; the table still works without them.
      set({ loaded: true });
    }
  },
  setNote: (country, category, note) => {
    const key = `${country}||${category}`;
    // Optimistic local update.
    set((s) => {
      const next = { ...s.notes };
      if (note.trim() === '') delete next[key];
      else next[key] = note;
      return { notes: next, saving: { ...s.saving, [key]: true } };
    });
    // Debounced server write.
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(async () => {
        timers.delete(key);
        try {
          await postNote(country, category, note);
        } catch {
          // Swallow — optimistic value stays; next edit retries.
        } finally {
          set((s) => {
            const sv = { ...s.saving };
            delete sv[key];
            return { saving: sv };
          });
        }
      }, SAVE_DELAY),
    );
  },
}));
