'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle } from '@/lib/utils/colors';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { BidCapRow } from '@/lib/sheets/types';

// ---------------------------------------------------------------------------
// Bid Recommendations — mức bid recommend cho từng Country × Category.
// Toàn bộ số đã được tính sẵn trong tab 'Max bid cap' (Apps Script); page này
// chỉ đọc + filter + trình bày, KHÔNG tính lại.
// ---------------------------------------------------------------------------

const money = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${n.toFixed(2)}`;

// Map "Brandname"/"Competitor"/"Feature"/"Profit"… → category badge style.
function catStyle(category: string) {
  const norm = /^brand/i.test(category) ? 'Brand' : category;
  return categoryStyle(norm);
}

// Status badge tone, keyed by substring (NO CAMP / IMP ONLY / ACTIVE / …).
function statusStyle(status: string): { bg: string; text: string } {
  const s = status.toUpperCase();
  if (s.includes('NO CAMP')) return { bg: 'bg-rose-100', text: 'text-rose-800' };
  if (s.includes('IMP ONLY') || s.includes('NO CLICK') || s.includes('NO CONV'))
    return { bg: 'bg-amber-100', text: 'text-amber-800' };
  if (s.includes('EARLY')) return { bg: 'bg-sky-100', text: 'text-sky-800' };
  if (s.includes('PAUSE')) return { bg: 'bg-slate-200', text: 'text-slate-600' };
  if (s.includes('PROVEN') || s.includes('ACTIVE') || s.includes('OK') || s.includes('BIDDING'))
    return { bg: 'bg-emerald-100', text: 'text-emerald-800' };
  return { bg: 'bg-slate-100', text: 'text-slate-600' };
}

// Action tone — green = create/scale, amber = monitor/review, slate = hold/none.
function actionTone(action: string): string {
  const a = action.toUpperCase();
  if (a.includes('CREATE') || a.includes('SCALE') || a.includes('RAISE') || a.includes('EXPAND'))
    return 'text-emerald-700';
  if (a.includes('REDUCE') || a.includes('LOWER') || a.includes('PAUSE')) return 'text-rose-700';
  if (a.includes('MONITOR') || a.includes('REVIEW') || a.includes('AUDIT') || a.includes('WAIT'))
    return 'text-amber-700';
  return 'text-slate-600';
}

type SortKey = 'bid_desc' | 'bid_asc' | 'country' | 'category';

export function BidCapView() {
  const { data, isLoading, error } = useSheetData();
  const rows: BidCapRow[] = useMemo(() => data?.bidCap ?? [], [data]);

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('bid_desc');

  const { tiers, countries, categories, statuses } = useMemo(() => {
    const t = new Set<string>();
    const c = new Set<string>();
    const cat = new Set<string>();
    const st = new Set<string>();
    rows.forEach((r) => {
      if (r.tier) t.add(r.tier);
      if (r.country) c.add(r.country);
      if (r.category) cat.add(r.category);
      if (r.status) st.add(r.status);
    });
    return {
      tiers: Array.from(t).sort(),
      countries: Array.from(c).sort(),
      categories: Array.from(cat).sort(),
      statuses: Array.from(st).sort(),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (tierFilter !== 'all' && r.tier !== tierFilter) return false;
      if (countryFilter !== 'all' && r.country !== countryFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) {
        const hay = `${r.country} ${r.countryCode} ${r.category} ${r.status} ${r.actionRecommended}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const byCountry = (a: BidCapRow, b: BidCapRow) =>
      a.country.localeCompare(b.country) || b.bidRecommended - a.bidRecommended;
    switch (sort) {
      case 'bid_desc':
        out.sort((a, b) => b.bidRecommended - a.bidRecommended);
        break;
      case 'bid_asc':
        out.sort((a, b) => a.bidRecommended - b.bidRecommended);
        break;
      case 'country':
        out.sort(byCountry);
        break;
      case 'category':
        out.sort((a, b) => a.category.localeCompare(b.category) || b.bidRecommended - a.bidRecommended);
        break;
    }
    return out;
  }, [rows, search, tierFilter, countryFilter, categoryFilter, statusFilter, sort]);

  const dirty =
    search !== '' ||
    tierFilter !== 'all' ||
    countryFilter !== 'all' ||
    categoryFilter !== 'all' ||
    statusFilter !== 'all';
  const resetAll = () => {
    setSearch('');
    setTierFilter('all');
    setCountryFilter('all');
    setCategoryFilter('all');
    setStatusFilter('all');
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

  const selectCls =
    'h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        Mức bid <strong>recommend</strong> cho từng <strong>Country × Category</strong> (tính sẵn trong sheet{' '}
        <code className="text-[10px]">Max bid cap</code>). <strong>Bid rec</strong> = mức nên set;{' '}
        <strong>ceiling</strong> = trần tối đa (Max Allowed); <strong>Est pos</strong> = vị trí dự kiến tại
        mức bid rec. Filter theo tier / country / category / status.
      </div>

      {/* Filters */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm country, category, action…"
              className="pl-7 h-7 text-xs"
            />
          </div>
          {tiers.length > 1 && (
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className={selectCls} title="Tier">
              <option value="all">Tier: All</option>
              {tiers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className={selectCls} title="Country">
            <option value="all">Country: All</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls} title="Category">
            <option value="all">Category: All</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls} title="Status">
            <option value="all">Status: All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls} title="Sort">
            <option value="bid_desc">Sort: Bid ↓</option>
            <option value="bid_asc">Sort: Bid ↑</option>
            <option value="country">Sort: Country A→Z</option>
            <option value="category">Sort: Category</option>
          </select>
          {dirty && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={resetAll}>
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>
      )}

      {!isLoading && (
        <div className="text-xs text-slate-500">
          {filtered.length}
          {filtered.length !== rows.length ? ` / ${rows.length}` : ''} dòng (country × category)
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
          {rows.length === 0 ? 'Tab "Max bid cap" chưa có data.' : 'Không có dòng nào khớp filter.'}
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium min-w-[11rem]">Country</th>
                <th className="px-2 py-2 text-left font-medium">Category</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="px-2 py-2 text-right font-medium" title="Mức bid nên set (Bid Rec ⭐)">Bid rec</th>
                <th className="px-2 py-2 text-right font-medium" title="Trần tối đa cho phép (Max Allowed)">Ceiling</th>
                <th className="px-2 py-2 text-right font-medium" title="Vị trí dự kiến tại mức bid rec">Est pos</th>
                <th className="px-2 py-2 text-right font-medium" title="Conversion rate dùng để tính bid">CR used</th>
                <th className="px-2 py-2 text-right font-medium" title="L30: Impressions / Clicks / Installs">L30 imp/clk/inst</th>
                <th className="px-2 py-2 text-left font-medium min-w-[14rem]">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const cs = catStyle(r.category);
                const ss = statusStyle(r.status);
                return (
                  <tr key={`${r.country}|${r.category}|${i}`} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-1.5 align-top">
                      <div className="font-medium text-sm text-slate-900">{r.country}</div>
                      <div className="text-[10px] text-slate-400">
                        {r.countryCode}
                        {r.tier && ` · ${r.tier}`}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', cs.bg, cs.text)}>
                        {cs.emoji} {r.category}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap', ss.bg, ss.text)}>
                        {r.status || '—'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap">
                      <span className="font-mono font-semibold text-sm text-indigo-700">{money(r.bidRecommended)}</span>
                      {r.ceilBlocked && (
                        <span
                          className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-800 align-middle"
                          title="Bid rec bị trần (Max Allowed) chặn"
                        >
                          capped
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top text-right">
                      <span className="font-mono text-[11px] text-slate-500">{money(r.maxBidCeiling)}</span>
                    </td>
                    <td className="px-2 py-1.5 align-top text-right">
                      <span className="font-mono text-[11px] text-slate-500">
                        {r.estPosAtRec === null ? '—' : r.estPosAtRec.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap">
                      <span className="font-mono text-[11px] text-slate-700">{r.crUsed ? `${r.crUsed}%` : '—'}</span>
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap font-mono text-[10px] text-slate-500">
                      {formatNumber(r.impL30, { compact: true })} / {formatNumber(r.clicksL30, { compact: true })} /{' '}
                      <span className={r.installsL30 > 0 ? 'text-emerald-700 font-medium' : ''}>
                        {formatNumber(r.installsL30, { compact: true })}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <span className={cn('text-[11px]', actionTone(r.actionRecommended))}>{r.actionRecommended || '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            Bid rec / Ceiling = USD · <span className="text-amber-700">capped</span> = bid rec chạm trần Max Allowed ·
            Est pos = vị trí dự kiến tại bid rec · CR used = conversion rate dùng để tính bid ·
            L30 = Impressions / Clicks / Installs trong 30 ngày
          </div>
        </div>
      )}
    </div>
  );
}
