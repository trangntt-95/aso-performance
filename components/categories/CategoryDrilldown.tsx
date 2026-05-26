'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle } from '@/lib/utils/colors';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { SurfaceIcon } from '@/components/shared/SurfaceIcon';
import { formatDeltaPct, formatNumber, formatPercent, formatPos, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { Category, KeywordRow, SurfaceLabel } from '@/lib/sheets/types';

interface KeywordSummary {
  searchTerm: string;
  surface: SurfaceLabel;
  l7: KeywordRow | null;
  l30: KeywordRow | null;
  l90: KeywordRow | null;
  countries: string[];
  inPaid: boolean;
}

function buildSummaries(
  category: string,
  allL7: KeywordRow[],
  allL30: KeywordRow[],
  allL90: KeywordRow[],
  countryL7: KeywordRow[],
): KeywordSummary[] {
  const inCategory = (rows: KeywordRow[]) => rows.filter((r) => r.category === category);
  const l7 = inCategory(allL7);
  const l30 = inCategory(allL30);
  const l90 = inCategory(allL90);

  const keyMap = new Map<string, KeywordSummary>();
  const ensure = (term: string, surface: SurfaceLabel) => {
    const key = `${term}||${surface}`;
    if (!keyMap.has(key)) {
      keyMap.set(key, {
        searchTerm: term,
        surface,
        l7: null,
        l30: null,
        l90: null,
        countries: [],
        inPaid: false,
      });
    }
    return keyMap.get(key)!;
  };

  l7.forEach((r) => {
    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
    ensure(r.searchTerm, surface).l7 = r;
  });
  l30.forEach((r) => {
    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
    ensure(r.searchTerm, surface).l30 = r;
  });
  l90.forEach((r) => {
    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
    ensure(r.searchTerm, surface).l90 = r;
  });

  const paidTerms = new Set(
    inCategory(allL90)
      .filter((r) => r.surface === 'search_ad')
      .map((r) => r.searchTerm),
  );

  const countriesByTerm = new Map<string, Set<string>>();
  inCategory(countryL7).forEach((r) => {
    if (!r.country) return;
    if (!countriesByTerm.has(r.searchTerm)) countriesByTerm.set(r.searchTerm, new Set());
    countriesByTerm.get(r.searchTerm)!.add(r.country);
  });

  keyMap.forEach((summary) => {
    summary.inPaid = paidTerms.has(summary.searchTerm);
    summary.countries = Array.from(countriesByTerm.get(summary.searchTerm) ?? new Set<string>()).sort();
  });

  return Array.from(keyMap.values()).sort((a, b) => {
    const ua = a.l7?.usersL ?? a.l30?.usersL ?? 0;
    const ub = b.l7?.usersL ?? b.l30?.usersL ?? 0;
    return ub - ua;
  });
}

function MetricsCell({ row }: { row: KeywordRow | null }) {
  if (!row) {
    return <td className="px-2 py-1.5 text-center text-slate-300">—</td>;
  }
  const tone = deltaTone(row.deltaUsersPct);
  return (
    <td className="px-2 py-1.5 text-[11px] align-top">
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        <span className="font-mono">U {formatNumber(row.usersL, { compact: true })}</span>
        <span
          className={cn(
            'font-mono',
            tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-red-700' : 'text-slate-500',
          )}
        >
          {formatDeltaPct(row.deltaUsersPct)}
        </span>
        <span className="font-mono text-slate-500">G {formatNumber(row.getAppL, { compact: true })}</span>
        <span className="font-mono text-slate-500">CR {formatPercent(row.crL)}</span>
        <span className="font-mono text-slate-500">P {formatPos(row.posL)}</span>
      </div>
    </td>
  );
}

export function CategoryDrilldown({ category }: { category: string }) {
  const { data, isLoading, error } = useSheetData();
  const s = categoryStyle(category as Category);

  const summaries = useMemo(() => {
    if (!data) return [];
    return buildSummaries(category, data.allL7, data.allL30, data.allL90, data.countryL7);
  }, [data, category]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <div className="font-semibold">Couldn’t load category data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link href="/categories" className="text-xs text-slate-500 inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="h-3 w-3" />
          Back to categories
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-semibold', s.bg, s.text)}>
          <span>{s.emoji}</span>
          {category}
        </span>
        {!isLoading && (
          <span className="text-xs text-slate-500">
            {summaries.length} keyword × surface combination{summaries.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : summaries.length === 0 ? (
        <div className="border rounded-lg bg-white py-16 text-center text-sm text-slate-500">
          No keywords in this category yet.
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium min-w-[14rem]">Keyword</th>
                <th className="px-2 py-2 text-left font-medium">L7</th>
                <th className="px-2 py-2 text-left font-medium">L30</th>
                <th className="px-2 py-2 text-left font-medium">L90</th>
                <th className="px-2 py-2 text-left font-medium">Paid?</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((row) => (
                <tr key={`${row.searchTerm}-${row.surface}`} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-1.5 align-top">
                    <div className="flex items-center gap-2 min-w-0">
                      <SurfaceIcon surface={row.surface} />
                      <KeywordLink
                        keyword={row.searchTerm}
                        className="font-medium text-sm truncate block"
                      />
                    </div>
                    {row.countries.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {row.countries.slice(0, 6).join(', ')}
                        {row.countries.length > 6 && ` +${row.countries.length - 6}`}
                      </div>
                    )}
                  </td>
                  <MetricsCell row={row.l7} />
                  <MetricsCell row={row.l30} />
                  <MetricsCell row={row.l90} />
                  <td className="px-2 py-1.5 align-top">
                    {row.inPaid ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 font-medium">
                        📌 In Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500">
                        ❌ Not in Paid
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            U = Users · G = Install · CR = conversion · P = avg position
          </div>
        </div>
      )}
    </div>
  );
}
