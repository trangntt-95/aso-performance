'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ExternalLink, Search, X } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle } from '@/lib/utils/colors';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { BidCapRow } from '@/lib/sheets/types';
import { useBidNoteStore } from '@/lib/store/bidNoteStore';
import { currentBidByCategory, deriveBidAction } from '@/lib/market/currentBid';
import { buildCampLinkIndex, type CampLink } from '@/lib/market/campLink';
import { findCampBidConflicts } from '@/lib/market/campBidConflicts';

// BidCapRow + the current set bid (median from Master KW Lookup), a derived
// action, and the best campaign link for this country × category.
type BidCapRowX = BidCapRow & {
  bidNow: number | null;
  action: string;
  campLink: CampLink | null;
};

// Editable note cell, auto-saved to the Bid_Notes sheet tab (server-side, shared
// across users). Optimistic + debounced; shows a tiny "lưu…" while in flight.
function NoteCell({ country, category }: { country: string; category: string }) {
  const rowKey = `${country}||${category}`;
  const note = useBidNoteStore((s) => s.notes[rowKey] ?? '');
  const saving = useBidNoteStore((s) => !!s.saving[rowKey]);
  const setNote = useBidNoteStore((s) => s.setNote);
  return (
    <td className="px-2 py-1.5 align-top">
      <textarea
        value={note}
        onChange={(e) => setNote(country, category, e.target.value)}
        placeholder="Ghi chú…"
        rows={2}
        className="w-40 min-w-[9rem] resize-y rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {saving && <span className="text-[9px] text-slate-400">lưu…</span>}
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
  | 'tier'
  | 'country'
  | 'category'
  | 'status'
  | 'bid'
  | 'bidnow'
  | 'crused'
  | 'installs'
  | 'action';
type SortDir = 'asc' | 'desc';

// Tier order (strongest → excluded) for sorting + badge tone.
const TIER_RANK: Record<string, number> = {
  'Tier 1 Strong': 1,
  'Tier 1.5': 2,
  'Tier 1.5 Watch': 3,
  'Tier 2': 4,
  'Tier 3': 5,
  Untiered: 6,
  Excluded: 7,
};
function tierStyle(tier: string): { bg: string; text: string } {
  if (/^tier 1 strong/i.test(tier)) return { bg: 'bg-emerald-100', text: 'text-emerald-800' };
  if (/^tier 1\.5/i.test(tier)) return { bg: 'bg-teal-100', text: 'text-teal-800' };
  if (/^tier 2/i.test(tier)) return { bg: 'bg-sky-100', text: 'text-sky-800' };
  if (/^tier 3/i.test(tier)) return { bg: 'bg-indigo-100', text: 'text-indigo-800' };
  if (/excluded/i.test(tier)) return { bg: 'bg-rose-100', text: 'text-rose-700' };
  return { bg: 'bg-slate-100', text: 'text-slate-600' }; // Untiered / blank
}

// Per-column value accessor + type. 'num' columns default to desc on first
// click (biggest first), 'text' columns to asc (A→Z).
const SORT_COLS: Record<SortKey, { kind: 'num' | 'text'; get: (r: BidCapRowX) => number | string | null }> = {
  tier: { kind: 'text', get: (r) => (r.tier ? String(TIER_RANK[r.tier] ?? 98).padStart(2, '0') : '') },
  country: { kind: 'text', get: (r) => r.country },
  category: { kind: 'text', get: (r) => r.category },
  status: { kind: 'text', get: (r) => r.status },
  bid: { kind: 'num', get: (r) => r.bidRecommended },
  bidnow: { kind: 'num', get: (r) => r.bidNow },
  crused: { kind: 'num', get: (r) => r.crUsed },
  installs: { kind: 'num', get: (r) => r.installsL30 },
  action: { kind: 'text', get: (r) => r.action },
};

export function BidCapView() {
  const { data, isLoading, error } = useSheetData();
  const rows: BidCapRowX[] = useMemo(() => {
    const cur = currentBidByCategory(data?.masterKwLookup ?? [], data?.pausedKw ?? []);
    const campIdx = buildCampLinkIndex(data?.campLinks ?? []);
    return (data?.bidCap ?? []).map((r) => {
      const bidNow = cur.get(r.category)?.median ?? null;
      return {
        ...r,
        bidNow,
        // Prefer a sheet-supplied action; else derive from current vs recommended.
        action: r.actionRecommended || deriveBidAction(bidNow, r.bidRecommended),
        campLink: campIdx.pick(r.country, r.category),
      };
    });
  }, [data]);

  // Campaigns targeting several countries with diverging recommended bids.
  const conflicts = useMemo(
    () => findCampBidConflicts(data?.campLinks ?? [], data?.bidCap ?? []),
    [data],
  );
  const [conflictsOpen, setConflictsOpen] = useState(false);

  // Load saved notes from the Bid_Notes sheet tab once on mount.
  const loadNotes = useBidNoteStore((s) => s.load);
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

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
      tiers: Array.from(t).sort((a, b) => (TIER_RANK[a] ?? 98) - (TIER_RANK[b] ?? 98)),
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
    const cmp = (a: BidCapRowX, b: BidCapRowX): number => {
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
        <strong>Bid hiện tại</strong> = median bid thực đang set (từ Master KW Lookup, theo category);{' '}
        <strong>Action</strong> = so bid hiện tại với bid rec → <span className="text-emerald-700">RAISE</span> /{' '}
        <span className="text-rose-600">REDUCE</span> / HOLD. Filter theo tier / country / category / status.
      </div>

      {/* Alert: 1 campaign target nhiều nước có bid rec lệch nhau → 1 bid không tối ưu cho hết. */}
      {!isLoading && conflicts.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50">
          <button
            type="button"
            onClick={() => setConflictsOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-900">
              {conflicts.length} campaign target nhiều nước nhưng bid rec lệch nhau
            </span>
            <span className="text-[10px] text-amber-700 hidden sm:inline">
              — 1 camp chỉ set được 1 bid → cân nhắc tách camp theo nước
            </span>
            <ChevronDown
              className={cn('h-4 w-4 text-amber-600 ml-auto transition-transform', conflictsOpen && 'rotate-180')}
            />
          </button>
          {conflictsOpen && (
            <ul className="divide-y divide-amber-200 border-t border-amber-200 max-h-[40vh] overflow-y-auto">
              {conflicts.map((c) => (
                <li key={c.camp} className="px-3 py-2 text-[11px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Mở campaign: ${c.camp}`}
                        className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {c.camp}
                      </a>
                    ) : (
                      <span className="font-medium text-slate-800">{c.camp}</span>
                    )}
                    <span className="text-[10px] text-slate-500">· {c.category}</span>
                    <span className="rounded bg-amber-200/70 px-1.5 py-0.5 font-mono text-[10px] text-amber-900">
                      lệch {Math.round(c.spreadPct * 100)}% (${c.min.toFixed(2)}–${c.max.toFixed(2)})
                    </span>
                    {c.perCountry.length < c.targetCount && (
                      <span className="text-[10px] text-slate-400" title="Các nước còn lại chưa có bid rec trong Max bid cap nên không so được">
                        {c.perCountry.length}/{c.targetCount} nước có bid rec
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-600">
                    {c.perCountry.map((p) => (
                      <span key={p.country}>
                        {p.country} <span className="font-semibold text-slate-800">${p.bid.toFixed(2)}</span>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                    { k: 'tier', label: 'Tier', align: 'left', title: 'Sort theo tier (Tier 1 Strong → Excluded)', extra: 'pl-3 min-w-[7rem]' },
                    { k: 'country', label: 'Country', align: 'left', title: 'Sort theo country', extra: 'min-w-[11rem]' },
                    { k: 'category', label: 'Category', align: 'left', title: 'Sort theo category' },
                    { k: 'status', label: 'Status', align: 'left', title: 'Sort theo status' },
                    { k: 'bid', label: 'Bid rec', align: 'right', title: 'Mức bid nên set (Bid Rec ⭐)' },
                    { k: 'bidnow', label: 'Bid hiện tại', align: 'right', title: 'Median bid thực đang set (Master KW Lookup, theo category — không có data theo country)' },
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
                <th className="px-2 py-2 text-left font-medium min-w-[12rem]" title="Tên campaign đúng category phủ country này — click để mở chỉnh bid">
                  Campaign
                </th>
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
                      {r.tier ? (
                        (() => {
                          const ts = tierStyle(r.tier);
                          return (
                            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap', ts.bg, ts.text)}>
                              {r.tier}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="font-medium text-sm text-slate-900">{r.country}</div>
                      <div className="text-[10px] text-slate-400">{r.countryCode}</div>
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
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap">
                      {r.bidNow === null ? (
                        <span className="font-mono text-[11px] text-slate-400">—</span>
                      ) : (
                        <span
                          className={cn(
                            'font-mono text-[11px] font-medium',
                            r.bidNow < r.bidRecommended * 0.85
                              ? 'text-emerald-700'
                              : r.bidNow > r.bidRecommended * 1.15
                                ? 'text-rose-600'
                                : 'text-slate-700',
                          )}
                        >
                          {money(r.bidNow)}
                        </span>
                      )}
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
                      <span className={cn('text-[11px] font-medium', actionTone(r.action))}>{r.action || '—'}</span>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      {r.campLink ? (
                        <a
                          href={r.campLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Mở campaign: ${r.campLink.camp}`}
                          className="inline-flex items-start gap-1 max-w-[15rem] text-[10px] text-indigo-700 hover:text-indigo-900 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="leading-snug break-words">{r.campLink.camp}</span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-300" title="Không có campaign đúng category phủ country này">
                          —
                        </span>
                      )}
                    </td>
                    <NoteCell country={r.country} category={r.category} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            Bid rec / Bid hiện tại = USD · Bid hiện tại <span className="text-emerald-700">xanh</span> = đang thấp hơn rec (nên tăng),{' '}
            <span className="text-rose-600">đỏ</span> = cao hơn rec (nên giảm) · Bid hiện tại là median theo category (Master KW Lookup không có data theo country) ·
            CR used = CR dùng để tính bid · L30 = Imp / Clicks / Installs 30 ngày ·{' '}
            <span className="text-indigo-700">Campaign</span> = camp ĐÚNG category có geo phủ country (ưu tiên camp target đúng nước &gt; all &gt; chưa điền geo) — click để mở chỉnh bid; trống (—) = không có camp đúng category cho country này ·
            Note = tự lưu vào Google Sheet (tab Bid_Notes), share cho cả team
          </div>
        </div>
      )}
    </div>
  );
}
