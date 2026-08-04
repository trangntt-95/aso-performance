import type { Category, KeywordRow, SnapshotRow } from './types';
import { normKw } from './kwNorm';

// Manual keyword → category fixes for cases the Apps Script classifier gets
// wrong. Two layers, EXACT first then PATTERN (exact wins on conflict).
//
// EXACT (normalized) keyword match — surgical, no variants/typos caught.
const EXACT_CATEGORY_OVERRIDES: Record<string, Category> = {};

// PATTERN overrides — regex on the normalized (lowercase, single-spaced) term.
// First match wins, so order matters. Kept intentionally tight to avoid
// over-classifying unrelated terms.
const PATTERN_CATEGORY_OVERRIDES: { test: RegExp; category: Category }[] = [
  // TrueProfit brand: "true p", "true profit", "trueprofit" (\s* allows the
  // no-space form). \btrue anchors on a word start so "construe policy" etc.
  // can't match.
  { test: /\btrue\s*p/, category: 'Brand' },
  // Any keyword containing the word "profit" → Profit (beats the generic
  // "tracker"/"calculator" reads, so "profit tracker" / "profit calculator" land
  // in Profit too). \b anchors on a word start: catches "profit", "profits",
  // "net profit", "profit margin" but not "nonprofit" — and "trueprofit" is
  // already claimed by the Brand rule above.
  { test: /\bprofit/, category: 'Profit' },
  // "tracker" is an app-feature term (expense/order tracker …) → Feature.
  { test: /\btracker/, category: 'Feature' },
];

function overrideCategory(term: string): Category | null {
  const k = normKw(term);
  const exact = EXACT_CATEGORY_OVERRIDES[k];
  if (exact) return exact;
  for (const { test, category } of PATTERN_CATEGORY_OVERRIDES) {
    if (test.test(k)) return category;
  }
  return null;
}

export function overrideCategoryExact<T extends KeywordRow | SnapshotRow>(rows: T[]): T[] {
  return rows.map((r) => {
    const target = overrideCategory(r.searchTerm);
    return target && r.category !== target ? { ...r, category: target } : r;
  });
}
