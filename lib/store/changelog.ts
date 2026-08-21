import { noteKeyOf } from './notesStore';

// A log of what was CHANGED in the account, and what was observed as a result.
//
// Why this exists as its own thing rather than more camp notes: the changes that
// move the numbers most are not scoped to one campaign. Raising the Brand CPI cap
// from $15 to $35, excluding Israel, switching the Shopify export format — each
// of those shifted a whole screen, and none of them had anywhere to be recorded.
// A week later the CPI has moved and nothing says whether that was a decision or
// the auction.
//
// Stored in the same `App_Notes` tab as every other note (scope 'changelog'), so
// it needs no new plumbing, survives devices, and stays readable in the sheet.
// The row key carries the EVENT date, which is not the same as the write date —
// you log Tuesday's bid change on Wednesday, and the chart has to mark Tuesday.

export const CHANGELOG_SCOPE = 'changelog';

/** What the entry is about, so the affected screen can surface it. */
export type ChangeTagKind = 'account' | 'category' | 'country' | 'camp' | 'keyword';

export const TAG_LABEL: Record<ChangeTagKind, string> = {
  account: 'Toàn tài khoản',
  category: 'Category',
  country: 'Nước',
  camp: 'Camp',
  keyword: 'Keyword',
};

export interface ChangeTag {
  kind: ChangeTagKind;
  /** Empty for 'account'. */
  value: string;
}

export interface ChangeEntry {
  /** Row key inside App_Notes — stable, used for edit/delete. */
  id: string;
  /** ISO date the change actually happened. */
  date: string;
  tag: ChangeTag;
  /** What was changed / observed. */
  text: string;
  /** When the row was last written, from the sheet. */
  writtenAt: string | null;
}

// Single '|' as the field separator: the note store already uses '||' between
// scope and key, so the key itself must not contain it.
const F = '|';

/** `<date>|<kind>|<value>|<nonce>` — event date first so keys sort naturally. */
export function makeEntryId(date: string, tag: ChangeTag): string {
  const nonce = Math.random().toString(36).slice(2, 8);
  return [date, tag.kind, tag.value.replace(/\|/g, '/'), nonce].join(F);
}

function parseId(id: string): { date: string; tag: ChangeTag } | null {
  const parts = id.split(F);
  if (parts.length < 3) return null;
  const [date, kind, value] = parts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const kinds: ChangeTagKind[] = ['account', 'category', 'country', 'camp', 'keyword'];
  const k = (kinds as string[]).includes(kind) ? (kind as ChangeTagKind) : 'account';
  return { date, tag: { kind: k, value: value ?? '' } };
}

/** Read every changelog row out of the generic notes maps. */
export function readChangelog(
  notes: Record<string, string>,
  updatedAt: Record<string, string>,
): ChangeEntry[] {
  const prefix = `${CHANGELOG_SCOPE}||`;
  const out: ChangeEntry[] = [];
  for (const [composite, text] of Object.entries(notes)) {
    if (!composite.startsWith(prefix) || !text?.trim()) continue;
    const id = composite.slice(prefix.length);
    const meta = parseId(id);
    if (!meta) continue;
    out.push({
      id,
      date: meta.date,
      tag: meta.tag,
      text: text.trim(),
      writtenAt: updatedAt[composite] ?? null,
    });
  }
  // Newest change first; ties broken by write time so same-day entries keep the
  // order they were logged in.
  out.sort((a, b) => b.date.localeCompare(a.date) || (b.writtenAt ?? '').localeCompare(a.writtenAt ?? ''));
  return out;
}

export const changelogNoteKey = (id: string) => noteKeyOf(CHANGELOG_SCOPE, id);

/** Entries relevant to one thing, newest first. 'account' entries always match:
 *  a tenant-wide change affects every screen. */
export function entriesFor(
  entries: ChangeEntry[],
  kind: Exclude<ChangeTagKind, 'account'>,
  value: string,
): ChangeEntry[] {
  const v = value.trim().toLowerCase();
  if (!v) return [];
  return entries.filter(
    (e) =>
      e.tag.kind === 'account' ||
      (e.tag.kind === kind && e.tag.value.trim().toLowerCase() === v),
  );
}

/** Entries whose event date falls inside a range — for chart markers. */
export function entriesInRange(entries: ChangeEntry[], from: string, to: string): ChangeEntry[] {
  return entries.filter((e) => e.date >= from && e.date <= to);
}
