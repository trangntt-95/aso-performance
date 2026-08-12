'use client';

import { useNotesStore, noteKeyOf } from '@/lib/store/notesStore';

// Editable note cell auto-saved to the App_Notes sheet tab (server-side, shared
// across users). Optimistic + debounced; shows a tiny "lưu…" while in flight.
// `scope` groups notes by page ('underbid' / 'camp' / …); `noteId` is the row key
// (keyword term, campaign id).
export function NoteCell({
  scope,
  noteId,
  className,
  fallbackKeys,
}: {
  scope: string;
  noteId: string;
  className?: string;
  /** Already-composed note keys to read from when `scope||noteId` is empty.
   *  Used for camp notes, which used to live under per-page scopes: the old
   *  text still shows, and the first edit rewrites it to the unified key. */
  fallbackKeys?: string[];
}) {
  const composite = noteKeyOf(scope, noteId);
  const note = useNotesStore((s) => {
    const primary = s.notes[composite];
    if (primary) return primary;
    for (const k of fallbackKeys ?? []) {
      if (s.notes[k]) return s.notes[k];
    }
    return '';
  });
  const saving = useNotesStore((s) => !!s.saving[composite]);
  const setNote = useNotesStore((s) => s.setNote);
  return (
    <td className={className ?? 'px-2 py-1.5 align-top'}>
      <textarea
        value={note}
        onChange={(e) => setNote(scope, noteId, e.target.value)}
        placeholder="Ghi chú…"
        rows={2}
        className="w-40 min-w-[9rem] resize-y rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {saving && <span className="text-[9px] text-slate-400">lưu…</span>}
    </td>
  );
}
