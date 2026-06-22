'use client';

import { create } from 'zustand';

// Generic scoped notes, persisted server-side in the `App_Notes` sheet tab (via
// /api/notes) so they survive reloads, are shared across users/devices, and are
// only removed when emptied. Keyed by `scope` (page) + free-form `key` (keyword
// term, camp name). Local state is optimistic; writes are debounced per row.
// Bid Recommendations uses its own bidNoteStore — this is for underbid/overbid/etc.

const SEP = '||';
export function noteKeyOf(scope: string, key: string): string {
  return `${scope}${SEP}${key}`;
}

interface NotesState {
  notes: Record<string, string>;
  loaded: boolean;
  /** truthy while a save is in flight/pending, for the saving indicator. */
  saving: Record<string, boolean>;
  load: () => Promise<void>;
  setNote: (scope: string, key: string, note: string) => void;
}

// Per-row debounce timers (module scope — not part of persisted state).
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const SAVE_DELAY = 700;

async function postNote(scope: string, key: string, note: string) {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, key, note }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg?.error || `Save failed (${res.status})`);
  }
}

export const useNotesStore = create<NotesState>()((set) => ({
  notes: {},
  loaded: false,
  saving: {},
  load: async () => {
    try {
      const res = await fetch('/api/notes');
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = (await res.json()) as { notes?: Record<string, string> };
      set({ notes: data.notes ?? {}, loaded: true });
    } catch {
      // Leave notes empty on failure; the table still works without them.
      set({ loaded: true });
    }
  },
  setNote: (scope, key, note) => {
    const composite = noteKeyOf(scope, key);
    // Optimistic local update.
    set((s) => {
      const next = { ...s.notes };
      if (note.trim() === '') delete next[composite];
      else next[composite] = note;
      return { notes: next, saving: { ...s.saving, [composite]: true } };
    });
    // Debounced server write.
    const existing = timers.get(composite);
    if (existing) clearTimeout(existing);
    timers.set(
      composite,
      setTimeout(async () => {
        timers.delete(composite);
        try {
          await postNote(scope, key, note);
        } catch {
          // Swallow — optimistic value stays; next edit retries.
        } finally {
          set((s) => {
            const sv = { ...s.saving };
            delete sv[composite];
            return { saving: sv };
          });
        }
      }, SAVE_DELAY),
    );
  },
}));
