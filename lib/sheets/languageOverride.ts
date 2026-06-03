import type { KeywordRow, MasterKwRow, SnapshotRow } from './types';

// Keywords classified EXCLUSIVELY as 'Language' in Master KW Lookup. Catches
// ASCII non-English terms (steuern, finanze, inventario, analitica…) that the
// parser's non-ASCII regex can't detect. Strict "only Language" rule avoids
// over-classifying ambiguous English KPIs (dashboard, roas, attribution) that
// Master tags across multiple categories.
export function languageOnlyKeywords(master: MasterKwRow[]): Set<string> {
  const cats = new Map<string, Set<string>>();
  for (const r of master) {
    const k = r.keyword.toLowerCase();
    if (!cats.has(k)) cats.set(k, new Set());
    if (r.category) cats.get(k)!.add(r.category);
  }
  const out = new Set<string>();
  cats.forEach((set, kw) => {
    if (set.size === 1 && set.has('Language')) out.add(kw);
  });
  return out;
}

export function overrideToLanguage<T extends KeywordRow | SnapshotRow>(
  rows: T[],
  langKws: Set<string>,
): T[] {
  if (langKws.size === 0) return rows;
  return rows.map((r) =>
    r.category !== 'Language' && langKws.has(r.searchTerm.toLowerCase())
      ? { ...r, category: 'Language' as const }
      : r,
  );
}
