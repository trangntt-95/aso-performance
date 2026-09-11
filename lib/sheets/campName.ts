// Camp-name matching helper.
//
// Trang annotates campaign names in Shopify_daily / Master KW Lookup with
// trailing performance notes — "(CPI 17)", "- CPI 62", "- watch out",
// "(no ins)", "- cân nhắc off" — while Camp_Links / Paused_camp keep the
// un-annotated base name. Exact-string matching therefore fails for those camps
// (no URL, no geo, escapes the paused filter) even though it's the SAME campaign.
//
// Two layers handle this:
//   1. normalizeCampName strips the CPI performance tags (the most common note),
//      wherever they sit in the string, and collapses the leftover whitespace.
//      It PRESERVES geo parentheses like "(-IN, US)", "(US)", "(Brazil)" — those
//      distinguish genuinely different campaigns (verified live: stripping all
//      parens collapses "…Beprofit (-IN, US)" and "…Beprofit (US)" into one).
//   2. buildCampNameResolver matches an annotated name to a KNOWN base name by
//      exact match first, else the longest base name it extends at a note
//      boundary (" - free-text", " (note)"). Matching against the real name set
//      (not a blind strip) is what makes it safe: it can only ever map onto a
//      camp that actually exists, and longest-match avoids collapsing a specific
//      camp onto a shorter sibling (verified: 0 prefix-collisions among live
//      camp names). This is what recovers free-text notes normalizeCampName
//      deliberately leaves intact ("- cân nhắc off", "- good CPI 7").
//   3. Tier-agnostic fallback. Trang re-tiers a camp by editing its name
//      ("… Tier 1 - ES" → "… Tier 2 - ES") while Camp_Links keeps the old name,
//      so the same campaign id silently loses its URL and geo. Measured live
//      11/09/2026: 6 of 54 unresolved names were exactly this. When layers 1–2
//      fail, both sides get their tier token replaced by a placeholder and the
//      match is accepted ONLY if it lands on exactly one known camp — two
//      siblings that differ only by tier stay unresolved rather than guessed.

export function normalizeCampName(name: string): string {
  let x = (name ?? '').trim();
  // A camp can carry more than one tag; strip repeatedly until stable.
  for (let i = 0; i < 6; i++) {
    const y = x
      .replace(/\s*\([^()]*CPI[^()]*\)/gi, ' ') // "(CPI 17)" / "(CPI 71 - good ROAS)" anywhere
      .replace(/\s*[-–]\s*CPI\s*[\d.]+\s*$/i, '') // trailing "- CPI 62"
      .replace(/\s{2,}/g, ' ') // collapse the gap a mid-string strip leaves behind
      .trim();
    if (y === x) break;
    x = y;
  }
  return x;
}

// A note begins right after the base name: an optional space then a dash or an
// opening paren ("Base - note", "Base (note)"). A letter/digit here means the
// prefix is a partial word, not a real camp boundary — so it never matches.
const NOTE_BOUNDARY = /^\s*[-–(]/;

// "Tier 1", "Tier 1,5", "Tier 1.5", "Tier 1 Premium" → one placeholder, so a
// re-tiered name compares equal to its Camp_Links row.
const TIER_TOKEN = /tier\s*\d+(?:[.,]\d+)?(?:\s*premium)?/gi;
export function tierAgnostic(lcName: string): string {
  return lcName.replace(TIER_TOKEN, 'tier#').replace(/\s{2,}/g, ' ').trim();
}

export interface CampNameResolver {
  /** The canonical (note-stripped) base name this annotated name maps to, or
   *  null when no known camp matches. */
  resolve(name: string): string | null;
}

/**
 * Resolve annotated camp names against a set of KNOWN base names (Camp_Links /
 * Paused_camp). Matching is case-insensitive; the returned name keeps the
 * canonical casing so callers can key their own maps by normalizeCampName.
 */
export function buildCampNameResolver(canonical: readonly string[]): CampNameResolver {
  // lowercased base name -> original canonical (first occurrence wins).
  const byLc = new Map<string, string>();
  for (const c of canonical) {
    const n = normalizeCampName(c);
    if (!n) continue;
    const lc = n.toLowerCase();
    if (!byLc.has(lc)) byLc.set(lc, n);
  }
  // Longest first so the first startsWith hit is the most specific base name.
  const lcByLen = Array.from(byLc.keys()).sort((a, b) => b.length - a.length);
  // tier-agnostic form -> the lowercased base names that collapse onto it.
  const byTierless = new Map<string, string[]>();
  for (const lc of Array.from(byLc.keys())) {
    const t = tierAgnostic(lc);
    if (t === lc) continue; // no tier token: nothing to be agnostic about
    const arr = byTierless.get(t);
    if (arr) arr.push(lc);
    else byTierless.set(t, [lc]);
  }
  const tierlessByLen = Array.from(byTierless.keys()).sort((a, b) => b.length - a.length);
  const cache = new Map<string, string | null>();

  // Exact base name, else the longest base this name extends at a note boundary.
  const matchIn = (lc: string, exact: Map<string, unknown>, byLen: string[]): string | null => {
    if (exact.has(lc)) return lc;
    for (const base of byLen) {
      if (lc.length > base.length && lc.startsWith(base) && NOTE_BOUNDARY.test(lc.slice(base.length))) {
        return base;
      }
    }
    return null;
  };

  return {
    resolve(name) {
      const lc = normalizeCampName(name).toLowerCase();
      const cached = cache.get(lc);
      if (cached !== undefined) return cached;

      let out: string | null = null;
      const direct = matchIn(lc, byLc, lcByLen);
      if (direct !== null) {
        out = byLc.get(direct)!;
      } else {
        const tierless = tierAgnostic(lc);
        if (tierless !== lc) {
          const hit = matchIn(tierless, byTierless, tierlessByLen);
          const candidates = hit === null ? [] : byTierless.get(hit)!;
          // Unique or nothing: guessing between "Tier 1 - ES" and "Tier 3 - ES"
          // would attach the wrong campaign's URL, which is worse than none.
          if (candidates.length === 1) out = byLc.get(candidates[0])!;
        }
      }
      cache.set(lc, out);
      return out;
    },
  };
}
