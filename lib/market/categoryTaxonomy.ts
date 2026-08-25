import { normalizeCampName } from '@/lib/sheets/campName';

// The one place that decides what a category is called.
//
// Four vocabularies for the same idea had grown up in this codebase, and three
// near-identical translation tables between them (campLink.ts, currentBid.ts,
// CategoryDrilldown.tsx). They disagreed in ways that were invisible until you
// joined two tables on the label and silently got nothing back:
//
//   Camp_Links / Master KW Lookup : Brandname · Others & Test · Category · Noise
//   Max bid cap                   : Brand · … · Others · Test   (no 'Category')
//   All_L* (keyword tabs)         : Brand · … · Others   (no CPM, no Test)
//
// 'Max bid cap' is the canonical set, because it is the grain bids are actually
// set at and the yardstick every money table is judged against. A paid-spend row
// labelled 'Brandname' could never find its 'Brand' yardstick, so three of the
// eight rows on the category CPI table showed no cap and no recommended bid at
// all — not because the sheet lacked them, but because the names didn't meet.
//
// ── What this module does NOT do ────────────────────────────────────────────
// It does not touch the keyword side. Category share reads the All_L* Category
// column, which answers "what is this keyword about"; the money tables answer
// "which campaign bought it". Those are different questions and 'Test' is the
// proof: a Profit keyword being trialled is still about profit, so Category share
// has no Test slice, while the paid tables must keep one — "$376 went to
// experiments" is a real answer that vanishes if it is scattered semantically.
//
// So the two sides share this vocabulary without sharing the same set of slices.
// Test and CPM show up only on the money side. That is a property of the
// question, not a mapping bug, and it is the reason this file stops here instead
// of rewriting keyword categories too.

/** The canonical set, matching the 'Max bid cap' sheet's Category column. */
export const CANONICAL_CATEGORIES = [
  'Brand',
  'Profit',
  'Competitor',
  'CPM',
  'Feature',
  'Language',
  'Others',
  'Test',
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

/**
 * Every raw label seen in Camp_Links or Master KW Lookup, mapped to the canonical
 * set. A label can map to MORE than one because 'Others & Test' is a single camp
 * group in those sheets and two separate categories in 'Max bid cap'.
 *
 * 'Category' / 'Cateogry' (a long-standing typo in the account) / 'CatePage' are
 * the broad Shopify-category campaigns — Analytics App, Finance App, Marketing.
 * The canonical set has no slot for them, so they land in Others, which is what
 * Others is for. They are still listed individually in each row's campaign
 * drill-down, so the spend stays findable.
 */
const RAW_TO_CANONICAL: Record<string, CanonicalCategory[]> = {
  brand: ['Brand'],
  brandname: ['Brand'],
  'brand name': ['Brand'],
  profit: ['Profit'],
  competitor: ['Competitor'],
  cpm: ['CPM'],
  feature: ['Feature'],
  language: ['Language'],
  languages: ['Language'],
  lang: ['Language'],
  other: ['Others'],
  others: ['Others'],
  test: ['Test'],
  testing: ['Test'],
  'others & test': ['Others', 'Test'],
  'others and test': ['Others', 'Test'],
  category: ['Others'],
  cateogry: ['Others'],
  catepage: ['Others'],
  'cate page': ['Others'],
  noise: ['Others'],
};

const norm = (raw: string): string => (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Every canonical category a raw label can stand for. Use this for LOOKUPS —
 * "which bid-cap rows may this camp be compared against" — where an ambiguous
 * label should reach all its candidates rather than being forced into one.
 */
export function canonicalCategoriesFor(raw: string): CanonicalCategory[] {
  return RAW_TO_CANONICAL[norm(raw)] ?? [];
}

// A campaign that is an experiment. Two shapes, both live in the account:
// a dated prefix ("[12.04] Test potential KW Apr") and the word test anywhere
// ("Test Analytics app recommended by Shopify"). 'testing' needs spelling out
// because \btest\b does not match it.
const DATED_TEST_PREFIX = /^\s*\[\d{1,2}[.,]\d{1,2}\]/;
const TEST_WORD = /\btest(?:ing|s)?\b/i;

// An explicitly-Others campaign. Checked FIRST, because several of them carry
// the word "test" in a trailing note ("TP - Others - Test low bid") and would
// otherwise be counted as experiments.
const OTHERS_CAMP = /^tp\s*[-_]\s*others?\b/i;

/**
 * The single canonical category to FILE a campaign under — for tables that split
 * money, where a camp must land in exactly one bucket or the total stops adding
 * up.
 *
 * `campName` only matters for the ambiguous 'Others & Test' label, which it
 * splits by how the campaign is named. Returns null when the label is unknown,
 * so callers can say "category unclear" rather than quietly picking Others and
 * making an unclassified camp look deliberately filed.
 */
export function canonicalCategoryOf(raw: string, campName = ''): CanonicalCategory | null {
  const options = canonicalCategoriesFor(raw);
  if (options.length === 0) return null;
  if (options.length === 1) return options[0];

  const name = normalizeCampName(campName).replace(/^!+\s*/, '');
  if (OTHERS_CAMP.test(name)) return 'Others';
  if (DATED_TEST_PREFIX.test(name) || TEST_WORD.test(name)) return 'Test';
  // Labelled 'Others & Test' but named like neither. Others is the safer half:
  // it claims less. Calling an unrecognised camp an experiment would inflate the
  // test budget with campaigns nobody chose to file as tests.
  return 'Others';
}
