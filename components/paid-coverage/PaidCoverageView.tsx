'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle } from '@/lib/utils/colors';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { PaidStatusBadge } from '@/components/shared/PaidStatusBadge';
import { SurfaceIcon } from '@/components/shared/SurfaceIcon';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { normKw } from '@/lib/sheets/kwNorm';
import {
  buildPaidStatusIndex,
  resolvePaidStatus,
  type PaidStatus,
} from '@/lib/sheets/paidStatus';
import {
  buildCampGeoIndex,
  resolveCountryCoverage,
  type CountryCoverage,
} from '@/lib/sheets/campGeo';
import type {
  Category,
  KeywordRow,
  SheetPayload,
  SnapshotRow,
  SurfaceLabel,
} from '@/lib/sheets/types';

// ---------------------------------------------------------------------------
// Global paid-coverage view: EVERY keyword that ever showed traffic in any
// window (L7 ∪ L30 ∪ L90 ∪ L365, all categories) × its paid-bidding status.
// This is the "không sót keyword nào chưa bidding" page — the per-category
// drilldown can only show one category at a time.
// ---------------------------------------------------------------------------

interface WinStat {
  users: number;
  installs: number;
}

interface CoverageRow extends PaidStatus {
  keyword: string;
  english: string;
  category: Category;
  surfaces: SurfaceLabel[];
  l7: WinStat | null;
  l30: WinStat | null;
  l90: WinStat | null;
  l365: WinStat | null;
  /** Traffic countries (from Country_L90 ∪ Country_L365), users desc. */
  countries: { name: string; users: number }[];
  /** Geo coverage of the ACTIVE camps bidding this kw (master only). */
  coverage: CountryCoverage | null;
}

type StatusFilter = 'all' | 'not_in_paid' | 'paused' | 'in_paid' | 'manual' | 'negative' | 'geo_gap';
type Win = 'l7' | 'l30' | 'l90' | 'l365';

const WIN_LABEL: Record<Win, string> = { l7: 'L7', l30: 'L30', l90: 'L90', l365: 'L365' };

function buildRows(data: SheetPayload): CoverageRow[] {
  const paidIndex = buildPaidStatusIndex(
    data.masterKwLookup ?? [],
    data.kwAddedManual ?? [],
    data.negativeKw ?? [],
    data.pausedKw ?? [],
  );
  const geoIndex = buildCampGeoIndex(data.campLinks ?? []);

  interface Acc {
    keyword: string;
    english: string;
    category: Category;
    surfaces: Set<SurfaceLabel>;
    wins: Partial<Record<Win, WinStat>>;
  }
  const accMap = new Map<string, Acc>();
  const ensure = (term: string, english: string, category: Category): Acc => {
    const k = normKw(term);
    let acc = accMap.get(k);
    if (!acc) {
      acc = { keyword: term, english, category, surfaces: new Set(), wins: {} };
      accMap.set(k, acc);
    }
    if (!acc.english && english) acc.english = english;
    if (acc.category === 'Unknown' && category !== 'Unknown') acc.category = category;
    return acc;
  };
  const addWin = (acc: Acc, win: Win, users: number, installs: number, surface: SurfaceLabel) => {
    acc.surfaces.add(surface);
    const w = acc.wins[win] ?? { users: 0, installs: 0 };
    w.users += users;
    w.installs += installs;
    acc.wins[win] = w;
  };

  const ingestWindow = (rows: KeywordRow[], win: Win) => {
    for (const r of rows) {
      const surface: SurfaceLabel = r.surface === 'search_ad' ? 'paid' : 'organic';
      addWin(ensure(r.searchTerm, r.english, r.category), win, r.usersL, r.getAppL, surface);
    }
  };
  ingestWindow(data.allL7 ?? [], 'l7');
  ingestWindow(data.allL30 ?? [], 'l30');
  ingestWindow(data.allL90 ?? [], 'l90');
  for (const r of (data.allL365 ?? []) as SnapshotRow[]) {
    const surface: SurfaceLabel = r.surface === 'search_ad' ? 'paid' : 'organic';
    addWin(ensure(r.searchTerm, r.english, r.category), 'l365', r.users, r.getApp, surface);
  }

  // Traffic countries per kw: max(users in Country_L90, Country_L365) per country.
  const countryUsers = new Map<string, Map<string, number>>();
  const addCountry = (term: string, country: string | undefined, users: number) => {
    if (!country || country.startsWith('(')) return; // skip "(all countries)"
    const k = normKw(term);
    if (!countryUsers.has(k)) countryUsers.set(k, new Map());
    const m = countryUsers.get(k)!;
    m.set(country, Math.max(m.get(country) ?? 0, users));
  };
  for (const r of data.countryL90 ?? []) addCountry(r.searchTerm, r.country, r.usersL);
  for (const r of (data.countryL365 ?? []) as SnapshotRow[]) addCountry(r.searchTerm, r.country, r.users);

  const out: CoverageRow[] = [];
  accMap.forEach((acc, k) => {
    const status = resolvePaidStatus(acc.keyword, paidIndex);
    const countries = Array.from(countryUsers.get(k)?.entries() ?? [])
      .map(([name, users]) => ({ name, users }))
      .sort((a, b) => b.users - a.users);
    const coverage =
      status.source === 'master' && (status.masterCamps?.length ?? 0) > 0
        ? resolveCountryCoverage(
            status.masterCamps!,
            countries.map((c) => c.name),
            geoIndex,
          )
        : null;
    out.push({
      keyword: acc.keyword,
      english: acc.english,
      category: acc.category,
      surfaces: Array.from(acc.surfaces).sort(),
      l7: acc.wins.l7 ?? null,
      l30: acc.wins.l30 ?? null,
      l90: acc.wins.l90 ?? null,
      l365: acc.wins.l365 ?? null,
      countries,
      coverage,
      ...status,
    });
  });
  return out;
}

function WinCell({ stat }: { stat: WinStat | null }) {
  if (!stat) return <td className="px-2 py-1.5 text-center text-slate-300">—</td>;
  return (
    <td className="px-2 py-1.5 align-top whitespace-nowrap">
      <span className="font-mono text-[11px]">{formatNumber(stat.users, { compact: true })}</span>
      <span className="font-mono text-[10px] text-slate-400"> / {formatNumber(stat.installs, { compact: true })}</span>
    </td>
  );
}

function GeoCell({ row }: { row: CoverageRow }) {
  if (row.source !== 'master' || !row.coverage) {
    return <td className="px-2 py-1.5 text-center text-slate-300">—</td>;
  }
  const { gaps, hasUnknownGeo } = row.coverage;
  if (gaps.length > 0) {
    return (
      <td className="px-2 py-1.5 align-top">
        <span
          className="text-[10px] text-rose-700 font-medium"
          title={`Có traffic nhưng KHÔNG camp active nào target: ${gaps.join(', ')}`}
        >
          ⚠ Chưa bid: {gaps.slice(0, 3).join(', ')}
          {gaps.length > 3 && ` +${gaps.length - 3}`}
        </span>
      </td>
    );
  }
  if (hasUnknownGeo) {
    return (
      <td className="px-2 py-1.5 align-top">
        <span
          className="text-[10px] text-slate-400"
          title="Có camp chưa điền Geo trong Camp_Links — không kết luận được country coverage"
        >
          geo ?
        </span>
      </td>
    );
  }
  return (
    <td className="px-2 py-1.5 align-top">
      <span className="text-[10px] text-emerald-700" title="Mọi country có traffic đều được ≥1 camp active cover">
        ✓ đủ
      </span>
    </td>
  );
}

export function PaidCoverageView() {
  const { data, isLoading, error } = useSheetData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('not_in_paid');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [minUsers, setMinUsers] = useState<string>('');
  const [minInstalls, setMinInstalls] = useState<string>('');
  const [win, setWin] = useState<Win>('l365');

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  const { categories, countries } = useMemo(() => {
    const c = new Set<string>();
    const k = new Set<string>();
    rows.forEach((r) => {
      c.add(r.category);
      r.countries.forEach((x) => k.add(x.name));
    });
    return { categories: Array.from(c).sort(), countries: Array.from(k).sort() };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minU = minUsers.trim() === '' ? null : Number(minUsers);
    const minI = minInstalls.trim() === '' ? null : Number(minInstalls);
    return rows
      .filter((r) => {
        if (statusFilter === 'in_paid' && r.source !== 'master') return false;
        if (statusFilter === 'manual' && r.source !== 'manual') return false;
        if (statusFilter === 'paused' && r.source !== 'paused') return false;
        if (statusFilter === 'negative' && !r.negative) return false;
        // not_in_paid INCLUDES paused (camp tắt = đang không bid) but excludes negatives.
        if (statusFilter === 'not_in_paid' && (r.inPaid || r.negative)) return false;
        if (statusFilter === 'geo_gap') {
          if (!r.coverage || r.coverage.gaps.length === 0) return false;
          if (countryFilter !== 'all' && !r.coverage.gaps.includes(countryFilter)) return false;
        } else if (countryFilter !== 'all' && !r.countries.some((c) => c.name === countryFilter)) {
          return false;
        }
        if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
        if (minU !== null && Number.isFinite(minU)) {
          if ((r[win]?.users ?? 0) < minU) return false;
        }
        if (minI !== null && Number.isFinite(minI)) {
          if ((r[win]?.installs ?? 0) < minI) return false;
        }
        if (q) {
          const hay = `${r.keyword} ${r.english}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b[win]?.users ?? 0) - (a[win]?.users ?? 0));
  }, [rows, search, statusFilter, categoryFilter, countryFilter, minUsers, minInstalls, win]);

  const dirty =
    search !== '' ||
    statusFilter !== 'not_in_paid' ||
    categoryFilter !== 'all' ||
    countryFilter !== 'all' ||
    minUsers !== '' ||
    minInstalls !== '';
  const resetAll = () => {
    setSearch('');
    setStatusFilter('not_in_paid');
    setCategoryFilter('all');
    setCountryFilter('all');
    setMinUsers('');
    setMinInstalls('');
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <div className="font-semibold">Couldn’t load sheet data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        Toàn bộ keyword từng có traffic (L7 ∪ L30 ∪ L90 ∪ L365, mọi category) × trạng thái bidding.
        Mặc định lọc <strong>❌ Not in Paid</strong> (gồm cả ⏸ paused camp) — đây là danh sách keyword chưa được bid.
      </div>

      {/* Filters */}
      {!isLoading && rows.length > 0 && (
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="Paid status"
          >
            <option value="not_in_paid">❌ Not in Paid (gồm ⏸)</option>
            <option value="paused">⏸ Paused camp</option>
            <option value="in_paid">📌 In Paid (Master)</option>
            <option value="manual">✍️ Added (manual)</option>
            <option value="negative">🚫 Negative list</option>
            <option value="geo_gap">🌍 In Paid nhưng thiếu country</option>
            <option value="all">Status: All</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="Category"
          >
            <option value="all">Category: All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="Country (traffic; với filter 🌍 = country đang thiếu bid)"
          >
            <option value="all">Country: All</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5">
            <span className="text-[10px] text-slate-700 font-medium">U≥</span>
            <Input
              type="number"
              min="0"
              value={minUsers}
              onChange={(e) => setMinUsers(e.target.value)}
              placeholder="0"
              className="h-6 w-14 text-[11px] px-1 border-0 focus-visible:ring-1"
            />
            <span className="text-[10px] text-slate-700 font-medium border-l border-slate-200 pl-1.5">I≥</span>
            <Input
              type="number"
              min="0"
              value={minInstalls}
              onChange={(e) => setMinInstalls(e.target.value)}
              placeholder="0"
              className="h-6 w-14 text-[11px] px-1 border-0 focus-visible:ring-1"
              title="Min Install trong window đang chọn"
            />
            <select
              value={win}
              onChange={(e) => setWin(e.target.value as Win)}
              className="h-6 px-1 text-[10px] rounded bg-slate-50 text-slate-700 border-0 focus:outline-none"
              title="Window dùng cho min users + sort"
            >
              {(Object.keys(WIN_LABEL) as Win[]).map((w) => (
                <option key={w} value={w}>
                  {WIN_LABEL[w]}
                </option>
              ))}
            </select>
          </div>
          {dirty && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={resetAll}>
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
          <CopyKeywordsButton
            keywords={filtered.map((r) => r.keyword)}
            label={statusFilter === 'not_in_paid' ? 'Copy Not-in-Paid kw' : 'Copy keywords'}
            className="ml-auto"
          />
        </div>
      )}

      {!isLoading && (
        <div className="text-xs text-slate-500">
          {filtered.length}
          {filtered.length !== rows.length ? ` / ${rows.length}` : ''} keyword
          {rows.length === 1 ? '' : 's'} · sort theo Users {WIN_LABEL[win]}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg bg-white py-16 text-center text-sm text-slate-500">
          Không có keyword khớp filter.
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium min-w-[14rem]">Keyword</th>
                <th className="px-2 py-2 text-left font-medium">Category</th>
                <th className="px-2 py-2 text-left font-medium" title="Users / Install">L7</th>
                <th className="px-2 py-2 text-left font-medium" title="Users / Install">L30</th>
                <th className="px-2 py-2 text-left font-medium" title="Users / Install">L90</th>
                <th className="px-2 py-2 text-left font-medium" title="Users / Install">L365</th>
                <th className="px-2 py-2 text-left font-medium">Countries</th>
                <th className="px-2 py-2 text-left font-medium">Paid?</th>
                <th className="px-2 py-2 text-left font-medium" title="Country coverage của camp active (cần Geo trong Camp_Links)">Geo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const s = categoryStyle(row.category);
                const isNonEnglishKw = /[^\x00-\x7F]/.test(row.keyword) || row.category === 'Language';
                const showTranslation =
                  !!row.english &&
                  isNonEnglishKw &&
                  row.english.trim().toLowerCase() !== row.keyword.trim().toLowerCase();
                return (
                  <tr key={row.keyword} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-1.5 align-top">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {row.surfaces.map((sf) => (
                          <SurfaceIcon key={sf} surface={sf} />
                        ))}
                        <KeywordLink keyword={row.keyword} className="font-medium text-sm truncate block" />
                      </div>
                      {showTranslation && (
                        <div className="text-[10px] text-slate-500 italic mt-0.5 truncate" title={row.english}>
                          → {row.english}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', s.bg, s.text)}>
                        {s.emoji} {row.category}
                      </span>
                    </td>
                    <WinCell stat={row.l7} />
                    <WinCell stat={row.l30} />
                    <WinCell stat={row.l90} />
                    <WinCell stat={row.l365} />
                    <td className="px-2 py-1.5 align-top max-w-[12rem]">
                      {row.countries.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span
                          className="text-[10px] text-slate-500"
                          title={row.countries.map((c) => `${c.name} (${c.users})`).join(', ')}
                        >
                          {row.countries.slice(0, 4).map((c) => c.name).join(', ')}
                          {row.countries.length > 4 && ` +${row.countries.length - 4}`}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <PaidStatusBadge status={row} />
                      {row.negative && (
                        <span className="inline-flex items-center rounded font-medium bg-slate-200 text-slate-600 px-1.5 py-0.5 text-[10px]" title="Trong Negative KW list">
                          🚫 Negative
                        </span>
                      )}
                    </td>
                    <GeoCell row={row} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            Cột window = Users / Install (gộp organic + paid) · Geo chỉ kết luận được khi camp đã điền cột Geo trong Camp_Links
          </div>
        </div>
      )}
    </div>
  );
}
