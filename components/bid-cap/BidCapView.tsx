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
import { buildCampLinkIndex } from '@/lib/market/campLink';
import { findCampBidConflicts } from '@/lib/market/campBidConflicts';
import { CpiCapOverview } from './CpiCapOverview';
import { CategoryCpiPanel } from './CategoryCpiPanel';

// The campaign shown on a row: a name + optional URL (clickable when known).
// The sheet's hand-maintained 'Link campaign' column is gone as of Aug 2026, so
// this is always the auto-detected camp for the row's Country × Category.
type RowCamp = { name: string; url?: string } | null;

// BidCapRow + the current set bid (median from Master KW Lookup), a derived
// action, and the campaign to show for this country × category.
type BidCapRowX = BidCapRow & {
  bidNow: number | null;
  action: string;
  camp: RowCamp;
};

// Editable note cell, auto-saved to the Bid_Notes sheet tab (server-side, shared
// across users). Optimistic + debounced; shows a tiny "lưu…" while in flight.
//
// Keyed by country + category, NOT by keyword cluster. The sheet split each cell
// into up to 14 cluster rows in Aug 2026, and re-keying notes per cluster would
// have orphaned every note already written against the old two-part key. So one
// note is shared by a cell's clusters, and the same text shows on each of its
// rows — see the footnote under the table, which says so out loud.
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
// Bid Recommendations — mức bid recommend cho từng Country × Category × Keyword
// Cluster. Toàn bộ số đã được tính sẵn trong tab 'Max bid cap' (Apps Script);
// page này chỉ đọc + filter + trình bày, KHÔNG tính lại.
//
// Sheet đổi schema 8/2026: mỗi dòng giờ là 1 KEYWORD CLUSTER trong 1 cặp
// Country × Category (tối đa 14 cluster/cặp), kèm cột 'Example keywords',
// 'CPI cap' và 'Tier ceil.'. Các cột cũ Status / CR used / Imp / Spend /
// Max Allowed / Link campaign đã bị xoá khỏi sheet — bảng dưới bỏ hẳn chúng
// thay vì hiện cột rỗng, vì một cột luôn '—' đọc như "chưa có dữ liệu" chứ
// không phải "cột này không còn tồn tại".
// ---------------------------------------------------------------------------

const money = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${n.toFixed(2)}`;

// Map "Brandname"/"Competitor"/"Feature"/"Profit"… → category badge style.
function catStyle(category: string) {
  const norm = /^brand/i.test(category) ? 'Brand' : category;
  return categoryStyle(norm);
}

// Action badge tone. The sheet writes Vietnamese verdicts — Giữ / Hạ mạnh /
// Cắt / Cắt / Pause — having replaced the old English Status column, so both
// vocabularies are matched: the sheet's own wording first, then the legacy
// English tokens, so an older export still colours correctly.
function actionStyle(action: string): { bg: string; text: string } {
  const a = action.toLowerCase();
  if (!a) return { bg: 'bg-slate-100', text: 'text-slate-500' };
  if (/c[ắa]t|pause/.test(a)) return { bg: 'bg-rose-100', text: 'text-rose-800' };
  if (/h[ạa]\s*m[ạa]nh|h[ạa]\b|reduce|lower/.test(a))
    return { bg: 'bg-amber-100', text: 'text-amber-800' };
  if (/gi[ữu]|hold|keep|ok/.test(a)) return { bg: 'bg-emerald-100', text: 'text-emerald-800' };
  if (/t[ăa]ng|raise|scale|create|expand/.test(a))
    return { bg: 'bg-sky-100', text: 'text-sky-800' };
  return { bg: 'bg-slate-100', text: 'text-slate-600' };
}

// Same vocabulary, as a text tone for the derived-action column.
function actionTone(action: string): string {
  const a = action.toLowerCase();
  if (/c[ắa]t|pause/.test(a)) return 'text-rose-700';
  if (/h[ạa]\s*m[ạa]nh|h[ạa]\b|reduce|lower/.test(a)) return 'text-amber-700';
  if (/t[ăa]ng|raise|scale|create|expand/.test(a)) return 'text-emerald-700';
  if (/gi[ữu]|hold|keep/.test(a)) return 'text-slate-600';
  return 'text-slate-600';
}

type SortKey =
  | 'tier'
  | 'country'
  | 'category'
  | 'cluster'
  | 'bid'
  | 'bidnow'
  | 'cpicap'
  | 'ceil'
  | 'cr'
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
  cluster: { kind: 'text', get: (r) => r.keywordCluster },
  // 0 = the sheet left the cell blank (it does on every 'Cắt / Pause' row), which
  // is an absence, not a bid of zero — hand back null so those rows sink to the
  // bottom under either sort direction instead of masquerading as the cheapest.
  bid: { kind: 'num', get: (r) => (r.bidRecommended > 0 ? r.bidRecommended : null) },
  bidnow: { kind: 'num', get: (r) => r.bidNow },
  cpicap: { kind: 'num', get: (r) => (r.cpiCap > 0 ? r.cpiCap : null) },
  ceil: { kind: 'num', get: (r) => (r.tierCeiling > 0 ? r.tierCeiling : null) },
  cr: { kind: 'num', get: (r) => (r.crActual > 0 ? r.crActual : null) },
  installs: { kind: 'num', get: (r) => r.installsL30 },
  action: { kind: 'text', get: (r) => r.action },
};

export function BidCapView() {
  const { data, isLoading, error } = useSheetData();
  const rows: BidCapRowX[] = useMemo(() => {
    const cur = currentBidByCategory(data?.masterKwLookup ?? [], data?.pausedKw ?? []);
    const campIdx = buildCampLinkIndex(data?.campLinks ?? [], data?.pausedKw ?? []);
    // Resolve the row's campaign. The sheet used to carry a hand-filled 'Link
    // campaign' column which took priority; that column is gone as of Aug 2026,
    // so this is now purely the auto-detected camp for the Country × Category.
    // Detection is per cell, not per cluster — a campaign covers a whole
    // category in a market, so every cluster row of a cell shows the same camp.
    const resolveCamp = (r: BidCapRow): RowCamp => {
      const auto = campIdx.pick(r.country, r.category);
      return auto ? { name: auto.camp, url: auto.url } : null;
    };
    return (data?.bidCap ?? []).map((r) => {
      const bidNow = cur.get(r.category)?.median ?? null;
      return {
        ...r,
        bidNow,
        // Prefer a sheet-supplied action; else derive from current vs recommended.
        action: r.actionRecommended || deriveBidAction(bidNow, r.bidRecommended),
        camp: resolveCamp(r),
      };
    });
  }, [data]);

  // Campaigns targeting several countries with diverging recommended bids.
  const conflicts = useMemo(
    () => findCampBidConflicts(data?.campLinks ?? [], data?.bidCap ?? []),
    [data],
  );
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Load saved notes from the Bid_Notes sheet tab once on mount.
  const loadNotes = useBidNoteStore((s) => s.load);
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
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

  const { tiers, countries, categories, actions } = useMemo(() => {
    const t = new Set<string>();
    const c = new Set<string>();
    const cat = new Set<string>();
    const ac = new Set<string>();
    rows.forEach((r) => {
      if (r.tier) t.add(r.tier);
      if (r.country) c.add(r.country);
      if (r.category) cat.add(r.category);
      if (r.actionRecommended) ac.add(r.actionRecommended);
    });
    return {
      tiers: Array.from(t).sort((a, b) => (TIER_RANK[a] ?? 98) - (TIER_RANK[b] ?? 98)),
      countries: Array.from(c).sort(),
      categories: Array.from(cat).sort(),
      actions: Array.from(ac).sort(),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (tierFilter !== 'all' && r.tier !== tierFilter) return false;
      if (countryFilter !== 'all' && r.country !== countryFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (actionFilter !== 'all' && r.actionRecommended !== actionFilter) return false;
      if (q) {
        // Example keywords are in the haystack on purpose: the cluster labels are
        // codes ("C. hyros", "P4. Biên lợi nhuận"), so searching the actual
        // keyword is how you find the row you mean.
        const hay = `${r.country} ${r.countryCode} ${r.category} ${r.keywordCluster} ${r.exampleKeywords} ${r.actionRecommended}`.toLowerCase();
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
        a.country.localeCompare(b.country) ||
        a.category.localeCompare(b.category) ||
        a.keywordCluster.localeCompare(b.keywordCluster),
    );
    return out;
  }, [rows, search, tierFilter, countryFilter, categoryFilter, actionFilter, sortKey, sortDir]);

  const dirty =
    search !== '' ||
    tierFilter !== 'all' ||
    countryFilter !== 'all' ||
    categoryFilter !== 'all' ||
    actionFilter !== 'all';
  const resetAll = () => {
    setSearch('');
    setTierFilter('all');
    setCountryFilter('all');
    setCategoryFilter('all');
    setActionFilter('all');
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
      {/* Trần CPI theo nước — bối cảnh cho toàn bộ bảng bên dưới. */}
      <CpiCapOverview />

      {/* CPI theo category — grain mà bid thật sự được set ở đó. */}
      <CategoryCpiPanel />

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
            <span className="hidden text-[10px] text-amber-700 sm:inline">
              — 1 camp chỉ set được 1 bid cho cả nước → cân nhắc tách camp theo nước
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
                  <div
                    className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-600"
                    title="Bid mỗi nước là trung bình các cluster keyword của nước đó (sheet đổi grain 8/2026). Trong cùng 1 nước, bid giữa các cluster lệch nhau còn nhiều hơn giữa các nước — nhưng bid theo cluster đặt riêng được cho từng keyword nên đó là chủ ý, không phải xung đột; xung đột thật là giữa các nước, vì 1 camp chỉ set 1 bid cho cả nước."
                  >
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

      {/* Step 3 — the full grid. A reference table, not something to read top to
          bottom, so it stays closed until asked for. */}
      {!isLoading && rows.length > 0 && (
        <button
          type="button"
          onClick={() => setDetailOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-400"
        >
          <span className="text-xs font-semibold text-slate-800">
            3 · Bid nên set cho từng Country × Category × Keyword Cluster
          </span>
          <span className="hidden text-[10px] text-slate-500 sm:inline">
            — bảng chi tiết {rows.length} dòng, tra khi cần set bid
          </span>
          <ChevronDown
            className={cn('ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform', detailOpen && 'rotate-180')}
          />
        </button>
      )}

      {/* Filters */}
      {detailOpen && !isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm country, category, cluster, keyword…"
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
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className={selectCls} title="Action sheet đề xuất">
            <option value="all">Action: All</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
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
          {filtered.length !== rows.length ? ` / ${rows.length}` : ''} dòng (country × category × keyword cluster)
        </div>
      )}

      {!detailOpen ? null : isLoading ? (
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
                    { k: 'country', label: 'Country', align: 'left', title: 'Sort theo country', extra: 'min-w-[10rem]' },
                    { k: 'category', label: 'Category', align: 'left', title: 'Sort theo category' },
                    { k: 'cluster', label: 'Keyword cluster', align: 'left', title: 'Nhóm keyword trong category — grain mà bid được set ở đó. Hover để xem keyword ví dụ.', extra: 'min-w-[13rem]' },
                    { k: 'bid', label: 'Bid rec', align: 'right', title: 'Mức bid nên set (Bid Rec ⭐). Trống = sheet bảo cắt cluster này, không phải bid = 0.' },
                    { k: 'bidnow', label: 'Bid hiện tại', align: 'right', title: 'Median bid thực đang set (Master KW Lookup, theo category — không có data theo country hay cluster)' },
                    { k: 'cpicap', label: 'CPI cap', align: 'right', title: 'Trần CPI cho cluster này (cột CPI cap). Là trần cho phép, KHÔNG phải CPI đã tiêu — sheet không còn cột Spend.' },
                    { k: 'ceil', label: 'Tier ceil.', align: 'right', title: 'Trần bid do tier của nước áp xuống. Bid rec = Tier ceil. → tier đang quyết định bid, không phải thị trường.' },
                    { k: 'cr', label: 'CR %', align: 'right', title: 'Conversion rate dùng để tính bid' },
                    { k: 'installs', label: 'Clicks/inst /mo', align: 'right', title: 'Clicks/mo · Inst/mo · (Inst L90) — sort theo Inst/mo' },
                    { k: 'action', label: 'Action', align: 'left', title: 'Sort theo action sheet đề xuất', extra: 'min-w-[8rem]' },
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
                <th className="px-2 py-2 text-left font-medium min-w-[11rem]" title="Campaign auto-detect theo Country × Category (Camp_Links) — click để mở chỉnh bid. Cột 'Link campaign' tự điền đã bị xoá khỏi sheet 8/2026.">
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
                const as = actionStyle(r.actionRecommended);
                return (
                  <tr
                    key={`${r.country}|${r.category}|${r.keywordCluster}|${i}`}
                    className="border-t hover:bg-slate-50"
                  >
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
                      {r.keywordCluster ? (
                        <>
                          <div className="text-[11px] font-medium leading-snug text-slate-800">
                            {r.keywordCluster}
                          </div>
                          {r.exampleKeywords && (
                            <div
                              className="max-w-[13rem] truncate text-[10px] text-slate-400"
                              title={r.exampleKeywords}
                            >
                              {r.exampleKeywords}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-300" title="Sheet để trống cột Keyword Cluster ở dòng này">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap">
                      {r.bidRecommended > 0 ? (
                        <span className="font-mono text-sm font-semibold text-indigo-700">
                          {money(r.bidRecommended)}
                        </span>
                      ) : (
                        <span
                          className="font-mono text-[11px] text-slate-300"
                          title="Sheet không đưa bid rec cho cluster này (thường vì Action = Cắt / Pause) — không phải bid $0"
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap">
                      {r.bidNow === null ? (
                        <span className="font-mono text-[11px] text-slate-400">—</span>
                      ) : (
                        <span
                          className={cn(
                            'font-mono text-[11px] font-medium',
                            // Only colour against a recommendation that exists. A
                            // blank rec arrives as 0, and comparing to it would
                            // paint every cut cluster red for "over budget".
                            r.bidRecommended <= 0
                              ? 'text-slate-700'
                              : r.bidNow < r.bidRecommended * 0.85
                                ? 'text-emerald-700'
                                : r.bidNow > r.bidRecommended * 1.15
                                  ? 'text-rose-600'
                                  : 'text-slate-700',
                          )}
                          title={
                            r.bidRecommended <= 0
                              ? 'Không có bid rec để so — sheet bảo cắt cluster này'
                              : undefined
                          }
                        >
                          {money(r.bidNow)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap">
                      <span className="font-mono text-[11px] text-slate-700">
                        {r.cpiCap > 0 ? money(r.cpiCap) : <span className="text-slate-300">—</span>}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap">
                      {r.tierCeiling > 0 ? (
                        <span
                          className={cn(
                            'font-mono text-[11px]',
                            // Rec pinned at the ceiling: the tier is what set the
                            // bid, so raising it means moving the tier, not the bid.
                            r.bidRecommended > 0 && r.bidRecommended >= r.tierCeiling * 0.98
                              ? 'font-medium text-amber-700'
                              : 'text-slate-500',
                          )}
                          title={
                            r.bidRecommended > 0 && r.bidRecommended >= r.tierCeiling * 0.98
                              ? 'Bid rec đang bị trần tier chặn — muốn bid cao hơn thì phải đổi tier của nước này'
                              : undefined
                          }
                        >
                          {money(r.tierCeiling)}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap">
                      <span className="font-mono text-[11px] text-slate-700">
                        {r.crActual > 0 ? `${r.crActual}%` : <span className="text-slate-300">—</span>}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 align-top text-right whitespace-nowrap font-mono text-[10px] text-slate-500">
                      {formatNumber(r.clicksL30, { compact: true })} /{' '}
                      <span className={r.installsL30 > 0 ? 'font-medium text-emerald-700' : ''}>
                        {formatNumber(r.installsL30, { compact: true })}
                      </span>
                      {r.instL90 > 0 && (
                        <span className="text-slate-400" title="Inst L90 — installs 90 ngày">
                          {' '}
                          ({formatNumber(r.instL90, { compact: true })})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      {r.actionRecommended ? (
                        <span
                          className={cn(
                            'inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium',
                            as.bg,
                            as.text,
                          )}
                        >
                          {r.actionRecommended}
                        </span>
                      ) : (
                        // No verdict in the sheet — fall back to the one derived
                        // from current bid vs recommendation, and mark it as ours.
                        <span
                          className={cn('text-[11px] font-medium', actionTone(r.action))}
                          title="Sheet không ghi action cho dòng này — đây là action suy ra từ bid hiện tại vs bid rec"
                        >
                          {r.action || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      {r.camp ? (
                        r.camp.url ? (
                          <a
                            href={r.camp.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Mở campaign: ${r.camp.name}`}
                            className="inline-flex items-start gap-1 max-w-[15rem] text-[10px] text-indigo-700 hover:text-indigo-900 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="leading-snug break-words">{r.camp.name}</span>
                          </a>
                        ) : (
                          <span
                            className="inline-block max-w-[15rem] text-[10px] leading-snug break-words text-slate-600"
                            title="Tìm được tên camp nhưng chưa có URL trong Camp_Links"
                          >
                            {r.camp.name}
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] text-slate-300" title="Không auto-detect được campaign nào cho Country × Category này trong Camp_Links">
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
          <div className="border-t px-3 py-2 text-[10px] text-slate-400">
            Mỗi dòng = 1 <b>keyword cluster</b> trong 1 cặp Country × Category (sheet đổi grain 8/2026) ·
            Bid rec / CPI cap / Tier ceil. = USD · Bid rec trống (—) = sheet bảo <b>cắt</b> cluster đó,{' '}
            <b>không</b> phải bid $0 · Bid hiện tại <span className="text-emerald-700">xanh</span> = thấp hơn rec (nên tăng),{' '}
            <span className="text-rose-600">đỏ</span> = cao hơn rec (nên giảm); là median theo category (Master KW Lookup không có data theo country/cluster) ·{' '}
            <span className="text-amber-700">Tier ceil. vàng</span> = bid rec đang bị trần tier chặn ·
            CPI cap là <b>trần cho phép</b>, không phải CPI đã tiêu — sheet không còn cột Spend nên không đo được CPI thật theo nước ·
            Clicks/inst = Clicks/mo · Inst/mo · (Inst L90) ·{' '}
            <span className="text-indigo-700">Campaign</span> = auto-detect theo Country × Category từ Camp_Links (cột Link campaign tự điền đã bị xoá khỏi sheet) ·
            Note = lưu theo Country × Category nên các cluster trong cùng 1 cặp <b>dùng chung</b> 1 note; tự lưu vào tab Bid_Notes, share cho cả team
          </div>
        </div>
      )}
    </div>
  );
}
