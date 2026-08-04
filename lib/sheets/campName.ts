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
  const cache = new Map<string, string | null>();

  return {
    resolve(name) {
      const lc = normalizeCampName(name).toLowerCase();
      const cached = cache.get(lc);
      if (cached !== undefined) return cached;

      let out: string | null = byLc.get(lc) ?? null;
      if (out === null) {
        for (const base of lcByLen) {
          if (lc.length > base.length && lc.startsWith(base) && NOTE_BOUNDARY.test(lc.slice(base.length))) {
            out = byLc.get(base)!;
            break;
          }
        }
      }
      cache.set(lc, out);
      return out;
    },
  };
}
