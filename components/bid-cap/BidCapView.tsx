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
import { useBidNoteStore, bidRowKeyOf } from '@/lib/store/bidNoteStore';

// Editable, auto-saved (localStorage) note cell. Persists across reloads;
// only cleared when the user empties it.
function NoteCell({ rowKey }: { rowKey: string }) {
  const note = useBidNoteStore((s) => s.notes[rowKey] ?? '');
  const setNote = useBidNoteStore((s) => s.setNote);
  return (
    <td className="px-2 py-1.5 align-top">
      <textarea
        value={note}
        onChange={(e) => setNote(rowKey, e.target.value)}
        placeholder="Ghi chú…"
        rows={2}
        className="w-40 min-w-[9rem] resize-y rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </td>
  );
}

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

type SortKey =
  | 'country'
  | 'category'
  | 'status'
  | 'bid'
  | 'ceiling'
  | 'estpos'
  | 'crused'
  | 'installs'
  | 'action';
type SortDir = 'asc' | 'desc';

// Per-column value accessor + type. 'num' columns default to desc on first
// click (biggest first), 'text' columns to asc (A→Z).
const SORT_COLS: Record<SortKey, { kind: 'num' | 'text'; get: (r: BidCapRow) => number | string | null }> = {
  country: { kind: 'text', get: (r) => r.country },
  category: { kind: 'text', get: (r) => r.category },
  status: { kind: 'text', get: (r) => r.status },
  bid: { kind: 'num', get: (r) => r.bidRecommended },
  ceiling: { kind: 'num', get: (r) => r.maxBidCeiling },
  estpos: { kind: 'num', get: (r) => r.estPosAtRec },
  crused: { kind: 'num', get: (r) => r.crUsed },
  installs: { kind: 'num', get: (r) => r.installsL30 },
  action: { kind: 'text', get: (r) => r.actionRecommended },
};

export function BidCapView() {
  const { data, isLoading, error } = useSheetData();
  const rows: BidCapRow[] = useMemo(() => data?.bidCap ?? [], [data]);

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('bid');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Click a column header: same column → toggle dir; new column → default dir
  // (num desc, text asc).
  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(SORT_COLS[key].kind === 'num' ? 'desc' : 'asc');
    }
  };

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
    const { kind, get } = SORT_COLS[sortKey];
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: BidCapRow, b: BidCapRow): number => {
      const va = get(a);
      const vb = get(b);
      // Nulls/blanks always sink to the bottom regardless of direction.
      const aEmpty = va === null || va === '';
      const bEmpty = vb === null || vb === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const base =
        kind === 'num'
          ? (va as number) - (vb as number)
          : String(va).localeCompare(String(vb));
      return base * dir;
    };
    // Stable secondary sort: bid desc, then country A→Z, for deterministic ties.
    out.sort(
      (a, b) =>
        cmp(a, b) ||
        b.bidRecommended - a.bidRecommended ||
        a.country.localeCompare(b.country),
    );
    return out;
  }, [rows, search, tierFilter, countryFilter, categoryFilter, statusFilter, sortKey, sortDir]);

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
          <span className="text-[10px] text-slate-400 hidden sm:inline">Click cột để sort</span>
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
                {(
                  [
                    { k: 'country', label: 'Country', align: 'left', title: 'Sort theo country', extra: 'pl-3 min-w-[11rem]' },
                    { k: 'category', label: 'Category', align: 'left', title: 'Sort theo category' },
                    { k: 'status', label: 'Status', align: 'left', title: 'Sort theo status' },
                    { k: 'bid', label: 'Bid rec', align: 'right', title: 'Mức bid nên set (Bid Rec ⭐)' },
                    { k: 'ceiling', label: 'Ceiling', align: 'right', title: 'Trần tối đa cho phép (Max Allowed)' },
                    { k: 'estpos', label: 'Est pos', align: 'right', title: 'Vị trí dự kiến tại mức bid rec' },
                    { k: 'crused', label: 'CR used', align: 'right', title: 'Conversion rate dùng để tính bid' },
                    { k: 'installs', label: 'L30 imp/clk/inst', align: 'right', title: 'L30: Imp / Clicks / Installs — sort theo Installs' },
                    { k: 'action', label: 'Action', align: 'left', title: 'Sort theo action', extra: 'min-w-[14rem]' },
                  ] as { k: SortKey; label: string; align: 'left' | 'right'; title: string; extra?: string }[]
                ).map(({ k, label, align, title, extra }) => {
                  const active = sortKey === k;
                  return (
                    <th
                      key={k}
                      onClick={() => toggleSort(k)}
                      title={title}
                      className={cn(
                        'px-2 py-2 font-medium cursor-pointer select-none hover:text-slate-900',
                        align === 'right' ? 'text-right' : 'text-left',
                        active && 'text-indigo-700',
                        extra,
                      )}
                    >
                      <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'flex-row-reverse')}>
                        {label}
                        <span className="text-[9px] w-2 text-indigo-600">
                          {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </span>
                      </span>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-left font-medium min-w-[9rem]" title="Ghi chú của bạn (tự lưu)">
                  Note
                </th>
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
                    <NoteCell rowKey={bidRowKeyOf(r)} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            Bid rec / Ceiling = USD · <span className="text-amber-700">capped</span> = bid rec chạm trần Max Allowed ·
            Est pos = vị trí dự kiến tại bid rec · CR used = conversion rate dùng để tính bid ·
            L30 = Impressions / Clicks / Installs trong 30 ngày · Note = ghi chú của bạn, tự lưu trên trình duyệt (chỉ mất khi bạn tự xoá)
          </div>
        </div>
      )}
    </div>
  );
}
