import type { Category, KeywordRow, SnapshotRow } from './types';
import { normKw } from './kwNorm';

// Manual keyword → category fixes for cases the Apps Script classifier gets
// wrong. EXACT (normalized) keyword match only, so close variants and typos are
// deliberately NOT caught.
//
// "profit calculator" (full phrase) describes a feature of the app → Feature.
// But "profit calc" and its typos are a competitor app name → must stay
// Competitor (left untouched here).
const EXACT_CATEGORY_OVERRIDES: Record<string, Category> = {
  'profit calculator': 'Feature',
};

export function overrideCategoryExact<T extends KeywordRow | SnapshotRow>(rows: T[]): T[] {
  return rows.map((r) => {
    const target = EXACT_CATEGORY_OVERRIDES[normKw(r.searchTerm)];
    return target && r.category !== target ? { ...r, category: target } : r;
  });
}
