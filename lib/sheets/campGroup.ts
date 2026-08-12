import { normalizeCampName, buildCampNameResolver } from './campName';

/**
 * Collapse the many labels one campaign appears under into a single identity.
 *
 * The naming is structured — big category → specific category → countries →
 * free-text description — and only that last part varies for the same campaign:
 *     [12.04] Test potential KW Apr
 *     [12.04] Test potential KW Apr - test till Sep
 *     TP - Competitor - Exact 02 (CPI 71) … (CPI 66) … (CPI 30)
 * Keying on the raw name reports one campaign as several rows, each holding a
 * slice of its spend. normalizeCampName alone only strips the "(CPI nn)" form.
 *
 * The country part must NOT collapse: "… - Tier 1 - UK" and "… - Tier 1 - US"
 * are different campaigns, and both sit at a note boundary just like a
 * description does. Nothing in the string itself separates the two cases
 * reliably — "TP - Feature - Accounting - Tier 1 - US no ins, excl" is a
 * DESCRIPTION mentioning US, not a US split.
 *
 * So identity comes from Camp_Links, which is the authoritative list of real
 * campaigns: a label folds into a Camp_Links entry when it merely extends it at
 * a note boundary. Geo variants each have their own Camp_Links row, so they stay
 * apart; descriptions have none, so they fold.
 *
 * Labels absent from Camp_Links fall back to matching among themselves, and
 * failing that keep their own normalised name — never a blind prefix collapse
 * against the authoritative list.
 */
export interface CampGrouper {
  /** Stable lowercase key identifying the campaign a label belongs to. */
  key(camp: string): string;
  /** Display name for a key — the shortest label seen for that campaign. */
  label(key: string): string;
  /** How many labels folded into an existing campaign (diagnostics). */
  mergedCount: number;
}

export function buildCampGrouper(
  names: Iterable<string>,
  /** Camp_Links camp names — the authority on what a real campaign is. */
  canonicalNames: Iterable<string> = [],
): CampGrouper {
  const all = Array.from(names).filter(Boolean);
  const authoritative = Array.from(canonicalNames).filter(Boolean);
  const byLinks = buildCampNameResolver(authoritative);

  // Pass 1 — fold each label onto its Camp_Links campaign.
  const resolved = new Map<string, string>(); // raw label → key
  const unresolved: string[] = [];
  for (const n of all) {
    const base = byLinks.resolve(n);
    if (base) resolved.set(n, base.toLowerCase());
    else unresolved.push(n);
  }

  // Pass 2 — labels Camp_Links doesn't know about can still fold into each
  // other. The candidate bases are the SHORTEST distinct names among them, so
  // "[X] Foo - note" finds "[X] Foo" even though neither is in Camp_Links.
  // Restricted to this leftover set, so it can never pull a real geo variant
  // onto a shorter sibling from the authoritative list.
  const leftoverBases = Array.from(new Set(unresolved.map((n) => normalizeCampName(n))))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);
  const seen = new Set<string>();
  const shortBases: string[] = [];
  for (const b of leftoverBases) {
    const lc = b.toLowerCase();
    // Skip a name that already extends a shorter leftover — it isn't a base.
    const extendsShorter = shortBases.some(
      (s) => lc.length > s.length && lc.startsWith(s) && /^\s*[-–(]/.test(lc.slice(s.length)),
    );
    if (extendsShorter) continue;
    if (seen.has(lc)) continue;
    seen.add(lc);
    shortBases.push(lc);
  }
  const byLeftover = buildCampNameResolver(shortBases);
  for (const n of unresolved) {
    const base = byLeftover.resolve(n);
    resolved.set(n, (base ?? normalizeCampName(n)).toLowerCase());
  }

  const labels = new Map<string, string>();
  const perKey = new Map<string, number>();
  for (const n of all) {
    const k = resolved.get(n)!;
    perKey.set(k, (perKey.get(k) ?? 0) + 1);
    const cur = labels.get(k);
    // Notes only lengthen a name, so the shortest label is closest to the real one.
    if (cur === undefined || n.length < cur.length) labels.set(k, n);
  }
  let mergedCount = 0;
  perKey.forEach((v) => {
    if (v > 1) mergedCount += v - 1;
  });

  const cache = new Map<string, string>();
  return {
    mergedCount,
    key(camp) {
      const known = resolved.get(camp);
      if (known !== undefined) return known;
      // A camp asked about but absent from the indexed rows (e.g. a pinned camp
      // with no spend) still needs to land on the same key.
      const cached = cache.get(camp);
      if (cached !== undefined) return cached;
      const base = byLinks.resolve(camp) ?? byLeftover.resolve(camp) ?? normalizeCampName(camp);
      const k = base.toLowerCase();
      cache.set(camp, k);
      return k;
    },
    label: (k) => labels.get(k) ?? k,
  };
}
