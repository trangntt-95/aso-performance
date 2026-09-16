'use client';

import { buildCampNameResolver, normalizeCampName } from '@/lib/sheets/campName';
import { buildCampGrouper } from '@/lib/sheets/campGroup';
import { noteKeyOf } from '@/lib/store/notesStore';
import { readKeywordNote } from '@/lib/store/keywordNotes';
import type { CampLinkRow } from '@/lib/sheets/types';

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
//
// ── 14/09/2026: tên vẫn chưa đủ ──
// Ba bảng gọi cùng một campaign bằng ba tên: Overbid lấy tên ngắn nhất trong
// các dòng gộp, Camp Health lấy nhãn của grouper, panel Brand lấy tên trong
// Camp_Links; camp đổi tier trong tên ("Tier 1 - ES" → "Tier 2 - ES") hay
// mang ghi chú tự do ("- watch out bid cao") thì normalizeCampName không đưa
// về cùng một chuỗi. Trang note ở Camp Health, mở Overbid thấy ô trống, và
// hạ bid cùng một camp hai lần.
//
// Nên danh tính chính là CAMPAIGN ID của Camp_Links (qua resolver có lớp bỏ
// tier), tên chỉ dùng khi camp không có trong Camp_Links. Mọi khoá theo tên
// từng ghi (raw, tên gốc Camp_Links, các alias, hai scope cũ) được đọc làm
// đường lùi, và lần sửa kế tiếp ghi về khoá id. Xem buildCampNoteResolver.

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

/**
 * Keyword notes that belong to a campaign, via the camps pinned on the Underbid
 * page.
 *
 * Underbid notes are keyed by KEYWORD, so they can't be merged into the campaign
 * note — one keyword usually runs in several campaigns, and a campaign collects
 * many keywords. But once a keyword has a camp pinned, the link is explicit, and
 * that context belongs next to the campaign: "raised the bid on this keyword"
 * explains what a camp's numbers did afterwards.
 *
 * Read-only and shown BESIDE the campaign note rather than merged into it —
 * they're different statements, and writing them into one box would have each
 * overwrite the other.
 */
export interface KeywordNoteForCamp {
  keyword: string;
  note: string;
}

const UNDERBID_CAMP_SCOPE = 'underbid-camp';
const SEP = '||';

export function buildKeywordNotesByCamp(
  notes: Record<string, string>,
): Map<string, KeywordNoteForCamp[]> {
  const out = new Map<string, KeywordNoteForCamp[]>();
  const prefix = UNDERBID_CAMP_SCOPE + SEP;
  for (const [key, value] of Object.entries(notes)) {
    if (!key.startsWith(prefix) || !value) continue;
    const keyword = key.slice(prefix.length);
    if (!keyword) continue;
    const note = readKeywordNote(notes, keyword);
    for (const camp of value.split('\n').map((c) => c.trim()).filter(Boolean)) {
      const id = campNoteId(camp);
      const list = out.get(id);
      if (list) list.push({ keyword, note });
      else out.set(id, [{ keyword, note }]);
    }
  }
  out.forEach((list) => list.sort((a, b) => a.keyword.localeCompare(b.keyword)));
  return out;
}

// ── Danh tính camp qua Camp_Links ─────────────────────────────────────────────

export interface CampNoteIdentity {
  /** Khoá ghi: 'id:<campaignId>' khi Camp_Links biết camp này, không thì tên chuẩn hoá. */
  id: string;
  /** Khoá đọc dự phòng: mọi khoá theo tên từng ghi, mới → cũ. */
  fallbackKeys: string[];
  /** Mọi id theo TÊN của camp (raw, tên Camp_Links, alias) — để tra note keyword
   *  gắn camp (Underbid ghim camp theo tên). */
  nameIds: string[];
}

export interface CampNoteResolver {
  identity(camp: string, aliases?: string[]): CampNoteIdentity;
  /** Thời điểm note mới nhất trên MỌI khoá của camp, ms. */
  noteAt(updatedAt: Record<string, string>, camp: string, aliases?: string[]): number | null;
  /** Nội dung note: khoá id trước, rồi lần lượt các khoá tên. */
  read(notes: Record<string, string>, camp: string, aliases?: string[]): string;
}

export function buildCampNoteResolver(
  campLinks: readonly CampLinkRow[],
  /**
   * Mọi tên camp đang thấy trong dữ liệu (export theo ngày). Camp không có
   * trong Camp_Links vẫn gộp được với nhau khi một tên chỉ dài hơn tên kia ở
   * ranh giới ghi chú — cùng lớp 4 mà Camp Health dùng (buildCampGrouper), để
   * khoá note và nhãn bảng không tách cùng một camp ra hai.
   */
  observedNames: Iterable<string> = [],
): CampNoteResolver {
  const resolver = buildCampNameResolver(campLinks.map((c) => c.camp));
  const grouper = buildCampGrouper(observedNames, campLinks.map((c) => c.camp));
  const linkByKey = new Map<string, CampLinkRow>();
  for (const c of campLinks) {
    const k = normalizeCampName(c.camp).toLowerCase();
    if (k && !linkByKey.has(k)) linkByKey.set(k, c);
  }
  const cache = new Map<string, CampNoteIdentity>();

  const identity = (camp: string, aliases: string[] = []): CampNoteIdentity => {
    const cacheKey = `${camp}\u0000${aliases.join('\u0000')}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const names = Array.from(new Set([camp, ...aliases].filter(Boolean)));
    // Tên gốc cho từng tên: Camp_Links trước; không có thì gốc theo bộ gộp tên
    // lạ (lớp 4) — "X - ghi chú" về "X" dù cả hai đều không có trong Camp_Links.
    const bases = Array.from(
      new Set(names.map((n) => resolver.resolve(n) ?? grouper.key(n) ?? normalizeCampName(n)).filter(Boolean)),
    );
    let link: CampLinkRow | undefined;
    for (const b of bases) {
      const l = linkByKey.get(b.toLowerCase());
      if (l && String(l.campaignId ?? '').trim()) {
        link = l;
        break;
      }
    }
    const nameIds = Array.from(new Set([...names, ...bases, ...(link ? [link.camp] : [])].map(campNoteId).filter(Boolean)));
    const id = link ? `id:${String(link.campaignId).trim()}` : nameIds[0] ?? campNoteId(camp);
    const fallbackKeys = Array.from(
      new Set([
        ...nameIds.map((n) => noteKeyOf(CAMP_NOTE_SCOPE, n)),
        ...legacyCampNoteKeys(camp, [...aliases, ...bases, ...(link ? [link.camp] : [])]),
      ]),
    ).filter((k) => k !== noteKeyOf(CAMP_NOTE_SCOPE, id));
    const out = { id, fallbackKeys, nameIds };
    cache.set(cacheKey, out);
    return out;
  };

  return {
    identity,
    noteAt(updatedAt, camp, aliases = []) {
      const k = identity(camp, aliases);
      let best: number | null = null;
      for (const key of [noteKeyOf(CAMP_NOTE_SCOPE, k.id), ...k.fallbackKeys]) {
        const ts = updatedAt[key];
        if (!ts) continue;
        const at = new Date(ts).getTime();
        if (!Number.isFinite(at)) continue;
        if (best === null || at > best) best = at;
      }
      return best;
    },
    read(notes, camp, aliases = []) {
      const k = identity(camp, aliases);
      const primary = notes[noteKeyOf(CAMP_NOTE_SCOPE, k.id)];
      if (primary) return primary;
      for (const key of k.fallbackKeys) if (notes[key]) return notes[key];
      return '';
    },
  };
}

/** Note keyword gắn camp, tra qua mọi id theo tên của camp. */
export function keywordNotesFor(
  byCamp: Map<string, KeywordNoteForCamp[]>,
  nameIds: readonly string[],
): KeywordNoteForCamp[] {
  const seen = new Set<string>();
  const out: KeywordNoteForCamp[] = [];
  for (const id of nameIds) {
    for (const n of byCamp.get(id) ?? []) {
      if (seen.has(n.keyword)) continue;
      seen.add(n.keyword);
      out.push(n);
    }
  }
  return out.sort((a, b) => a.keyword.localeCompare(b.keyword));
}
