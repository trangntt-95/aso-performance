'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, Search, X } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle, CATEGORY_ORDER } from '@/lib/utils/colors';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { PaidStatusBadge } from '@/components/shared/PaidStatusBadge';
import { SurfaceIcon } from '@/components/shared/SurfaceIcon';
import { formatDeltaPct, formatNumber, formatPercent, formatPos, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type {
  Category,
  KeywordRow,
  KwAddedManualRow,
  MasterKwRow,
  SnapshotRow,
  SurfaceLabel,
} from '@/lib/sheets/types';
import { buildPaidStatusIndex, resolvePaidStatus, type PaidStatus } from '@/lib/sheets/paidStatus';

interface KeywordSummary extends PaidStatus {
  category: string;
  searchTerm: string;
  surface: SurfaceLabel;
  l7: KeywordRow | null;
  l30: KeywordRow | null;
  l90: KeywordRow | null;
  /** L365 snapshot — catches long-tail keywords with no traffic in the last 90d. */
  l365: SnapshotRow | null;
  countries: string[];
}

function buildSummaries(
  category: string | null,
  allL7: KeywordRow[],
  allL30: KeywordRow[],
  allL90: KeywordRow[],
  allL365: SnapshotRow[],
  countryL7: KeywordRow[],
  masterKwLookup: MasterKwRow[],
  kwAddedManual: KwAddedManualRow[],
  negativeKw: string[],
  pausedKw: MasterKwRow[],
): KeywordSummary[] {
  // category === null → all categories (flat view); otherwise scope to one.
  const inCategory = <T extends { category: string }>(rows: T[]) =>
    category === null ? rows : rows.filter((r) => r.category === category);
  const l7 = inCategory(allL7);
  const l30 = inCategory(allL30);
  const l90 = inCategory(allL90);
  const l365 = inCategory(allL365);

  const paidIndex = buildPaidStatusIndex(masterKwLookup, kwAddedManual, negativeKw, pausedKw);

  const keyMap = new Map<string, KeywordSummary>();
  const ensure = (term: string, surface: SurfaceLabel, cat: string) => {
    const key = `${cat}||${term}||${surface}`;
    if (!keyMap.has(key)) {
      keyMap.set(key, {
        category: cat,
        searchTerm: term,
        surface,
        l7: null,
        l30: null,
        l90: null,
        l365: null,
        countries: [],
        ...resolvePaidStatus(term, paidIndex),
      });
    }
    return keyMap.get(key)!;
  };

  l7.forEach((r) => {
    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
    ensure(r.searchTerm, surface, r.category).l7 = r;
  });
  l30.forEach((r) => {
    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
    ensure(r.searchTerm, surface, r.category).l30 = r;
  });
  l90.forEach((r) => {
    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
    ensure(r.searchTerm, surface, r.category).l90 = r;
  });
  l365.forEach((r) => {
    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
    ensure(r.searchTerm, surface, r.category).l365 = r;
  });

  const countriesByTerm = new Map<string, Set<string>>();
  inCategory(countryL7).forEach((r) => {
    if (!r.country) return;
    const k = `${r.category}||${r.searchTerm}`;
    if (!countriesByTerm.has(k)) countriesByTerm.set(k, new Set());
    countriesByTerm.get(k)!.add(r.country);
  });

  keyMap.forEach((summary) => {
    const k = `${summary.category}||${summary.searchTerm}`;
    summary.countries = Array.from(countriesByTerm.get(k) ?? new Set<string>()).sort();
  });

  return Array.from(keyMap.values()).sort((a, b) => {
    const ua = a.l7?.usersL ?? a.l30?.usersL ?? a.l90?.usersL ?? a.l365?.users ?? 0;
    const ub = b.l7?.usersL ?? b.l30?.usersL ?? b.l90?.usersL ?? b.l365?.users ?? 0;
    return ub - ua;
  });
}

// Which metrics each window cell shows. Toggled at the top of the table so the
// dense L7/L30/L90/L365 grid can be trimmed to just what you're looking at.
type MetricKey = 'users' | 'install' | 'cr' | 'pos';
const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'users', label: 'Users' },
  { key: 'install', label: 'Install' },
  { key: 'cr', label: 'CR' },
  { key: 'pos', label: 'Position' },
];

// One metric line: fixed-width label + value, vertically stacked so columns
// line up and scan cleanly across windows.
function MetricLine({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] text-slate-400 w-4 shrink-0">{label}</span>
      <span className={strong ? 'text-slate-900 font-medium' : 'text-slate-600'}>{children}</span>
    </div>
  );
}

function SnapshotCell({ row, metrics }: { row: SnapshotRow | null; metrics: Set<MetricKey> }) {
  if (!row) {
    return <td className="px-2 py-1.5 text-center text-slate-300">—</td>;
  }
  return (
    <td className="px-2 py-1.5 text-[11px] align-top">
      <div className="flex flex-col gap-0.5 font-mono tabular-nums">
        {metrics.has('users') && <MetricLine label="U" strong>{formatNumber(row.users, { compact: true })}</MetricLine>}
        {metrics.has('install') && <MetricLine label="I">{formatNumber(row.getApp, { compact: true })}</MetricLine>}
        {metrics.has('cr') && <MetricLine label="CR">{formatPercent(row.cr)}</MetricLine>}
        {metrics.has('pos') && <MetricLine label="P">{formatPos(row.pos)}</MetricLine>}
      </div>
    </td>
  );
}

function MetricsCell({ row, metrics }: { row: KeywordRow | null; metrics: Set<MetricKey> }) {
  if (!row) {
    return <td className="px-2 py-1.5 text-center text-slate-300">—</td>;
  }
  const tone = deltaTone(row.deltaUsersPct);
  return (
    <td className="px-2 py-1.5 text-[11px] align-top">
      <div className="flex flex-col gap-0.5 font-mono tabular-nums">
        {metrics.has('users') && (
          <div className="flex items-baseline gap-1">
            <span className="text-[9px] text-slate-400 w-4 shrink-0">U</span>
            <span className="text-slate-900 font-medium">{formatNumber(row.usersL, { compact: true })}</span>
            <span
              className={cn(
                'text-[10px]',
                tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-red-700' : 'text-slate-400',
              )}
            >
              {formatDeltaPct(row.deltaUsersPct)}
            </span>
          </div>
        )}
        {metrics.has('install') && <MetricLine label="I">{formatNumber(row.getAppL, { compact: true })}</MetricLine>}
        {metrics.has('cr') && <MetricLine label="CR">{formatPercent(row.crL)}</MetricLine>}
        {metrics.has('pos') && <MetricLine label="P">{formatPos(row.posL)}</MetricLine>}
      </div>
    </td>
  );
}

type SurfaceFilter = 'all' | 'organic' | 'paid';
type PaidFilter = 'all' | 'in_paid' | 'manual' | 'paused' | 'not_in_paid';
type MetricWindow = 'l7' | 'l30' | 'l90';

export function CategoryDrilldown({ category }: { category?: string }) {
  // No category prop → flat "all categories" view with a category filter.
  const allMode = !category;
  const { data, isLoading, error } = useSheetData();
  const s = allMode ? null : categoryStyle(category as Category);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [paidFilter, setPaidFilter] = useState<PaidFilter>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [metricWindow, setMetricWindow] = useState<MetricWindow>('l7');
  const [metrics, setMetrics] = useState<Set<MetricKey>>(
    () => new Set<MetricKey>(['users', 'install', 'cr', 'pos']),
  );
  // Toggle a metric on/off — never let the last one go (table would be empty).
  const toggleMetric = (k: MetricKey) =>
    setMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size > 1) next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
  const [minUsers, setMinUsers] = useState<string>('');
  const [minInstall, setMinInstall] = useState<string>('');
  const [maxPos, setMaxPos] = useState<string>('');

  const summaries = useMemo(() => {
    if (!data) return [];
    return buildSummaries(
      category ?? null,
      data.allL7,
      data.allL30,
      data.allL90,
      data.allL365 ?? [],
      data.countryL7,
      data.masterKwLookup ?? [],
      data.kwAddedManual ?? [],
      data.negativeKw ?? [],
      data.pausedKw ?? [],
    );
  }, [data, category]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach((r) => r.countries.forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }, [summaries]);

  // Categories present in the data, ordered by CATEGORY_ORDER (flat view only).
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach((r) => set.add(r.category));
    const order = CATEGORY_ORDER as readonly string[];
    const ordered = order.filter((c) => set.has(c));
    const extras = Array.from(set).filter((c) => !order.includes(c)).sort();
    return [...ordered, ...extras];
  }, [summaries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minU = minUsers.trim() === '' ? null : Number(minUsers);
    const minG = minInstall.trim() === '' ? null : Number(minInstall);
    const maxP = maxPos.trim() === '' ? null : Number(maxPos);
    return summaries.filter((r) => {
      if (allMode && categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (surfaceFilter !== 'all' && r.surface !== surfaceFilter) return false;
      if (paidFilter === 'in_paid' && r.source !== 'master') return false;
      if (paidFilter === 'manual' && r.source !== 'manual') return false;
      if (paidFilter === 'paused' && r.source !== 'paused') return false;
      // not_in_paid INCLUDES paused (camp tắt = đang không bid) but excludes negatives.
      if (paidFilter === 'not_in_paid' && (r.inPaid || r.negative)) return false;
      if (countryFilter !== 'all' && !r.countries.includes(countryFilter)) return false;
      if (q) {
        const hay = `${r.searchTerm} ${(r.l7?.english ?? r.l30?.english ?? r.l90?.english ?? r.l365?.english ?? '')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Numeric thresholds — pulled from the chosen metric window (L7/L30/L90).
      // Row without that window is filtered out only when a numeric filter is set
      // (so the table doesn't collapse when no filter is active).
      const metric = r[metricWindow];
      if (minU !== null && Number.isFinite(minU)) {
        if (!metric || metric.usersL < minU) return false;
      }
      if (minG !== null && Number.isFinite(minG)) {
        if (!metric || metric.getAppL < minG) return false;
      }
      if (maxP !== null && Number.isFinite(maxP)) {
        if (!metric || metric.posL === null || metric.posL > maxP) return false;
      }
      return true;
    });
  }, [summaries, search, allMode, categoryFilter, surfaceFilter, paidFilter, countryFilter, metricWindow, minUsers, minInstall, maxPos]);

  const dirty =
    search !== '' ||
    (allMode && categoryFilter !== 'all') ||
    surfaceFilter !== 'all' ||
    paidFilter !== 'all' ||
    countryFilter !== 'all' ||
    minUsers !== '' ||
    minInstall !== '' ||
    maxPos !== '';
  const resetAll = () => {
    setSearch('');
    setCategoryFilter('all');
    setSurfaceFilter('all');
    setPaidFilter('all');
    setCountryFilter('all');
    setMinUsers('');
    setMinInstall('');
    setMaxPos('');
  };

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
      {!allMode && (
        <div className="flex items-center gap-3">
          <Link href="/categories" className="text-xs text-slate-500 inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" />
            Back to dictionary
          </Link>
        </div>
      )}
      <div className="flex items-center gap-3">
        {allMode ? (
          <span className="text-sm font-semibold text-slate-900">All keywords</span>
        ) : (
          <span className={cn('inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-semibold', s!.bg, s!.text)}>
            <span>{s!.emoji}</span>
            {category}
          </span>
        )}
        {!isLoading && (
          <span className="text-xs text-slate-500">
            {filtered.length}
            {filtered.length !== summaries.length ? ` / ${summaries.length}` : ''}{' '}
            keyword × surface combination{summaries.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Filters */}
      {!isLoading && summaries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm keyword hoặc bản dịch English…"
              className="pl-7 h-7 text-xs"
            />
          </div>
          {allMode && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="Category"
            >
              <option value="all">Category: All</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <select
            value={surfaceFilter}
            onChange={(e) => setSurfaceFilter(e.target.value as SurfaceFilter)}
            className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="Surface"
          >
            <option value="all">Surface: All</option>
            <option value="organic">Organic</option>
            <option value="paid">Paid</option>
          </select>
          <select
            value={paidFilter}
            onChange={(e) => setPaidFilter(e.target.value as PaidFilter)}
            className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="Paid status"
          >
            <option value="all">Paid status: All</option>
            <option value="in_paid">📌 In Paid (Master)</option>
            <option value="manual">✍️ Added (manual)</option>
            <option value="paused">⏸ Paused camp</option>
            <option value="not_in_paid">❌ Not in Paid (gồm ⏸)</option>
          </select>
          {countries.length > 0 && (
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="Country (L7)"
            >
              <option value="all">Country: All</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {/* Numeric thresholds — read from the window selected on the right. */}
          <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Min</span>
            <span className="text-[10px] text-slate-700 font-medium">U≥</span>
            <Input
              type="number"
              min="0"
              value={minUsers}
              onChange={(e) => setMinUsers(e.target.value)}
              placeholder="0"
              className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1"
            />
            <span className="text-[10px] text-slate-700 font-medium ml-1">I≥</span>
            <Input
              type="number"
              min="0"
              value={minInstall}
              onChange={(e) => setMinInstall(e.target.value)}
              placeholder="0"
              className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1"
            />
            <span className="text-[10px] text-slate-700 font-medium ml-1">P≤</span>
            <Input
              type="number"
              min="1"
              value={maxPos}
              onChange={(e) => setMaxPos(e.target.value)}
              placeholder="∞"
              className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1"
            />
            <select
              value={metricWindow}
              onChange={(e) => setMetricWindow(e.target.value as MetricWindow)}
              className="h-6 px-1 text-[10px] rounded bg-slate-50 text-slate-700 border-0 focus:outline-none"
              title="Window dùng cho min/max thresholds"
            >
              <option value="l7">L7</option>
              <option value="l30">L30</option>
              <option value="l90">L90</option>
            </select>
          </div>
          {dirty && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={resetAll}>
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
          <CopyKeywordsButton
            keywords={filtered.map((r) => r.searchTerm)}
            label={paidFilter === 'not_in_paid' ? 'Copy Not-in-Paid kw' : 'Copy keywords'}
            className="ml-auto"
          />
        </div>
      )}

      {/* Metric toggle — pick which of Users / Install / CR / Position show in each window cell. */}
      {!isLoading && summaries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-500 mr-0.5">Hiện metrics:</span>
          {METRIC_OPTIONS.map(({ key, label }) => {
            const on = metrics.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleMetric(key)}
                aria-pressed={on}
                className={cn(
                  'px-2 py-0.5 rounded-full border font-medium transition',
                  on
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg bg-white py-16 text-center text-sm text-slate-500">
          {summaries.length === 0 ? 'No keywords in this category yet.' : 'Không có keyword khớp filter.'}
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-auto max-h-[75vh]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10 shadow-sm [&_th]:bg-slate-50">
              <tr>
                {allMode && <th className="px-3 py-2 text-left font-medium min-w-[7rem]">Category</th>}
                <th className="px-3 py-2 text-left font-medium min-w-[14rem]">Keyword</th>
                <th className="px-2 py-2 text-left font-medium">L7</th>
                <th className="px-2 py-2 text-left font-medium">L30</th>
                <th className="px-2 py-2 text-left font-medium">L90</th>
                <th className="px-2 py-2 text-left font-medium">L365</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const english =
                  row.l7?.english ?? row.l30?.english ?? row.l90?.english ?? row.l365?.english ?? '';
                // Show translation only when source kw is non-English: either
                // non-ASCII script (Thai/Chinese/accented Latin) OR the kw lives
                // in the Language category (catches ASCII non-EN like steuern).
                // Skip when translation equals the kw (typo "fixes" like
                // "trueprfot → trueprfoot" — same text, not a real translation).
                const isNonEnglishKw =
                  /[^\x00-\x7F]/.test(row.searchTerm) || row.category === 'Language';
                const cs = categoryStyle(row.category as Category);
                const showTranslation =
                  !!english &&
                  isNonEnglishKw &&
                  english.trim().toLowerCase() !== row.searchTerm.trim().toLowerCase();
                return (
                <tr key={`${row.searchTerm}-${row.surface}`} className="border-t hover:bg-slate-50">
                  {allMode && (
                    <td className="px-3 py-1.5 align-top">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap',
                          cs.bg,
                          cs.text,
                        )}
                      >
                        <span>{cs.emoji}</span>
                        {row.category}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-1.5 align-top">
                    <div className="flex items-center gap-2 min-w-0">
                      <SurfaceIcon surface={row.surface} />
                      <KeywordLink
                        keyword={row.searchTerm}
                        className="font-medium text-sm truncate block"
                      />
                    </div>
                    {showTranslation && (
                      <div
                        className="text-[10px] text-slate-500 italic mt-0.5 truncate"
                        title={english}
                      >
                        → {english}
                      </div>
                    )}
                    {row.countries.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {row.countries.slice(0, 6).join(', ')}
                        {row.countries.length > 6 && ` +${row.countries.length - 6}`}
                      </div>
                    )}
                  </td>
                  <MetricsCell row={row.l7} metrics={metrics} />
                  <MetricsCell row={row.l30} metrics={metrics} />
                  <MetricsCell row={row.l90} metrics={metrics} />
                  <SnapshotCell row={row.l365} metrics={metrics} />
                  <td className="px-2 py-1.5 align-top">
                    <PaidStatusBadge status={row} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            U = Users · I = Install · CR = conversion · P = avg position
          </div>
        </div>
      )}
    </div>
  );
}
