'use client';

import { normalizeCampName } from '@/lib/sheets/campName';
import { noteKeyOf } from '@/lib/store/notesStore';

// One note per CAMPAIGN, shared by every table that shows campaigns.
//
// Overbid and Camp Health are two views of the same thing, so a note written in
// one has to be visible in the other. They used separate scopes ('overbid' /
// 'camp-health'), which never overwrote each other but did fragment the note:
// you'd write "đã hạ bid 20%" in Overbid, open Camp Health, see an empty box and
// write it again.
//
// Keying by the RAW camp name isn't enough either. The two tables label the same
// campaign differently — Overbid keeps the performance tag, Camp Health drops it
// — which splits 32 of the 235 shared camps:
//     overbid : TP - CPM - Payments, Currency (CPI 29)
//     health  : TP - CPM - Payments, Currency
// So the key is the note-stripped, lowercased name.
//
// Underbid deliberately stays out of this: it notes KEYWORDS, not campaigns.

export const CAMP_NOTE_SCOPE = 'camp';

/** Stable per-campaign note id, immune to the "(CPI 29)" style tags. */
export function campNoteId(camp: string): string {
  return normalizeCampName(camp).toLowerCase();
}

/**
 * Composite keys a camp's note may ALREADY live under, from before notes were
 * unified — the old scopes keyed by whatever raw name that table happened to
 * show. Read-only: they're offered as a fallback so nothing written previously
 * disappears, and the next edit rewrites to the unified key.
 */
export function legacyCampNoteKeys(camp: string, aliases: string[] = []): string[] {
  const names = Array.from(new Set([camp, ...aliases].filter(Boolean)));
  const keys: string[] = [];
  for (const scope of ['overbid', 'camp-health']) {
    for (const n of names) keys.push(noteKeyOf(scope, n));
  }
  return keys;
}

/** The unified key, plus the legacy ones to fall back to when it's empty. */
export function campNoteKeys(camp: string, aliases: string[] = []) {
  return {
    id: campNoteId(camp),
    scope: CAMP_NOTE_SCOPE,
    primary: noteKeyOf(CAMP_NOTE_SCOPE, campNoteId(camp)),
    legacy: legacyCampNoteKeys(camp, aliases),
  };
}

/**
 * The note text for a camp: the unified value if there is one, else the first
 * non-empty legacy value.
 */
export function readCampNote(
  notes: Record<string, string>,
  camp: string,
  aliases: string[] = [],
): string {
  const k = campNoteKeys(camp, aliases);
  const primary = notes[k.primary];
  if (primary) return primary;
  for (const key of k.legacy) {
    if (notes[key]) return notes[key];
  }
  return '';
}

/**
 * When the camp was last noted, in ms — the anchor the Impact-bid before/after
 * is measured around. Takes the NEWEST timestamp across the unified key and any
 * legacy one, so re-noting a camp in either table always moves the anchor
 * forward rather than resurrecting an older measurement.
 */
export function readCampNoteAt(
  updatedAt: Record<string, string>,
  camp: string,
  aliases: string[] = [],
): number | null {
  const k = campNoteKeys(camp, aliases);
  let best: number | null = null;
  for (const key of [k.primary, ...k.legacy]) {
    const ts = updatedAt[key];
    if (!ts) continue;
    const at = new Date(ts).getTime();
    if (!Number.isFinite(at)) continue;
    if (best === null || at > best) best = at;
  }
  return best;
}
