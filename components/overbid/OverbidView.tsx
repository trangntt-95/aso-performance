'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Search, X, ExternalLink, Flame } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { NoteCell } from '@/components/shared/NoteCell';
import { CampImpactCell } from '@/components/overbid/CampImpactCell';
import { useNotesStore } from '@/lib/store/notesStore';
import { CAMP_NOTE_SCOPE, campNoteId, legacyCampNoteKeys, readCampNoteAt } from '@/lib/store/campNotes';
import { buildCampDailyIndex, campBidImpact, type CampBidImpact } from '@/lib/market/campBidImpact';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle, CATEGORY_ORDER } from '@/lib/utils/colors';
import { formatNumber } from '@/lib/utils/format';
import { assessCamps, type CampVerdict, type OverbidRow } from '@/lib/market/overbid';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/sheets/types';

const selectCls =
  'h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';

const money = (n: number | null): string =>
  n === null || !Number.isFinite(n) ? '—' : `$${n.toFixed(2)}`;

// After you note an overbid camp, hide it for this many days so the list only
// shows camps still needing action. It reappears afterwards so you can re-check
// the fix. Snapshotted at load → the camp you're typing into never vanishes
// mid-edit; the hide kicks in from the next visit.
const HIDE_DAYS = 5;
const DAY_MS = 86_400_000;

const dmy = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// % above (+, rose) or below (−, emerald) the allowed level. The active list only
// ever shows camps that are over; the "đã xử lý" list needs the under case too.
const deltaPct = (actual: number | null, target: number | null): number | null =>
  actual === null || target === null || !(target > 0) ? null : (actual - target) / target;

function DeltaBadge({ d }: { d: number | null }) {
  if (d === null) return null;
  const over = d > 0;
  return (
    <span className={cn('block text-[9px]', over ? 'text-rose-500' : 'text-emerald-600')}>
      {over ? '+' : '−'}
      {Math.abs(Math.round(d * 100))}%
    </span>
  );
}

// How a camp that LEFT the overbid list is labelled in the "đã xử lý" view.
const VERDICT_TAG: Record<Exclude<CampVerdict, 'overbid'>, { label: string; cls: string; title: string }> = {
  ok: {
    label: '✅ đã về ngưỡng',
    cls: 'bg-emerald-100 text-emerald-700',
    title: 'CPC và CPI hiện đều nằm trong mức cho phép → camp đã được fix, không còn overbid.',
  },
  paused: {
    label: '⏸ đã pause',
    cls: 'bg-slate-200 text-slate-600',
    title: 'Camp nằm trong tab Paused_camp — không còn chạy nên bid không còn actionable.',
  },
  'low-clicks': {
    label: '📉 ít click',
    cls: 'bg-amber-100 text-amber-700',
    title: 'Clicks trong kỳ đã tụt xuống dưới ngưỡng → CPC quá nhiễu để đánh giá (không có nghĩa là đã fix).',
  },
  'no-benchmark': {
    label: '❓ chưa có benchmark',
    cls: 'bg-slate-100 text-slate-500',
    title: 'Không map được camp sang category trong Max bid cap, hoặc category đó chưa có Bid Rec → không so được.',
  },
};

type SortKey = 'camp' | 'category' | 'cpc' | 'cpi' | 'targetBid' | 'spend' | 'clicks' | 'installs' | 'score' | 'noted';
type SortDir = 'asc' | 'desc';
type ViewMode = 'active' | 'fixed';

const SORT_COLS: Record<SortKey, { kind: 'num' | 'text'; get: (r: OverbidRow) => number | string | null }> = {
  camp: { kind: 'text', get: (r) => r.camp },
  category: { kind: 'text', get: (r) => r.category },
  cpc: { kind: 'num', get: (r) => r.cpc },
  cpi: { kind: 'num', get: (r) => r.cpi },
  targetBid: { kind: 'num', get: (r) => r.targetBid },
  spend: { kind: 'num', get: (r) => r.spend },
  clicks: { kind: 'num', get: (r) => r.clicks },
  installs: { kind: 'num', get: (r) => r.installs },
  score: { kind: 'num', get: (r) => r.score },
  // Resolved from the notes store in the comparator, not from the row.
  noted: { kind: 'num', get: () => null },
};

function SortHead({
  label, col, sortKey, sortDir, onSort, align = 'left', extra, title,
}: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; align?: 'left' | 'right'; extra?: string; title?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
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
        <span className="text-[9px] w-2 text-indigo-600">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
      </span>
    </th>
  );
}

export function OverbidView() {
  const { data, isLoading, error } = useSheetData();

  // Load saved notes from the App_Notes sheet tab once on mount.
  const loadNotes = useNotesStore((s) => s.load);
  const notesLoaded = useNotesStore((s) => s.loaded);
  const noteTimes = useNotesStore((s) => s.updatedAt);
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Snapshot note timestamps once when they first load, so a camp you note in
  // this session stays visible while you're typing — it only gets hidden on the
  // next visit (when its updatedAt is part of the loaded snapshot).
  const [noteSnapshot, setNoteSnapshot] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (notesLoaded && noteSnapshot === null) setNoteSnapshot(noteTimes);
  }, [notesLoaded, noteSnapshot, noteTimes]);

  // Whether to reveal camps currently in their post-note hide window.
  const [showHidden, setShowHidden] = useState(false);

  // 'active' = camps still overbid; 'fixed' = camps you noted that have since
  // left the list (fixed / paused / no longer assessable). Without this second
  // view a camp you actually fixed disappears — together with the Impact bid
  // reading that proves the bid cut worked.
  const [view, setView] = useState<ViewMode>('active');

  // Detection thresholds (tunable).
  const [minClicks, setMinClicks] = useState('5');
  const [cpcTol, setCpcTol] = useState('0');
  const [cpiTol, setCpiTol] = useState('0');
  // Post-filters.
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [matchFilter, setMatchFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const switchView = (next: ViewMode) => {
    setView(next);
    setSortKey(next === 'fixed' ? 'noted' : 'score');
    setSortDir('desc');
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(SORT_COLS[key].kind === 'num' ? 'desc' : 'asc');
    }
  };

  // Every camp in Shopify_daily with its verdict — the overbid ones drive the
  // main table, the rest are what the "đã xử lý" view is made of.
  const assessed = useMemo(() => {
    if (!data) return [];
    return assessCamps(data.shopifyCamps ?? [], data.bidCap ?? [], data.campLinks ?? [], data.pausedKw ?? [], {
      minClicks: Number(minClicks) || 0,
      cpcTolerancePct: Number(cpcTol) || 0,
      cpiTolerancePct: Number(cpiTol) || 0,
    });
  }, [data, minClicks, cpcTol, cpiTol]);

  const overbidRows = useMemo(() => assessed.filter((r) => r.verdict === 'overbid'), [assessed]);

  // A note is filed under the camp name shown at the time, so a later rename (or
  // a pause) leaves it under an alias — check every name this camp has appeared
  // as in Shopify_daily and keep the newest.
  const noteAliasOf = useMemo(() => {
    return (r: OverbidRow): { name: string; at: number } | null => {
      // Notes are now stored per CAMPAIGN under one shared key, so a note left
      // on the Camp Health page counts here too. Legacy per-page keys (and the
      // camp's other names) are still consulted so older notes keep working.
      const at = readCampNoteAt(noteTimes, r.camp, [...r.mergedNames, ...r.pausedNames]);
      return at === null ? null : { name: r.camp, at };
    };
  }, [noteTimes]);

  // Camps you noted that are no longer flagged — newest note first.
  const fixedRows = useMemo(
    () => assessed.filter((r) => r.verdict !== 'overbid' && noteAliasOf(r) !== null),
    [assessed, noteAliasOf],
  );

  const rows = view === 'fixed' ? fixedRows : overbidRows;

  // Camps still inside their post-note hide window → camp name -> reappear time.
  // Only the actionable list hides rows; the "đã xử lý" view shows everything.
  const hiddenUntil = useMemo(() => {
    const map = new Map<string, number>();
    if (!noteSnapshot) return map;
    const now = Date.now();
    for (const r of overbidRows) {
      const noted = readCampNoteAt(noteSnapshot, r.camp, [...r.mergedNames, ...r.pausedNames]);
      if (noted === null) continue;
      const until = noted + HIDE_DAYS * DAY_MS;
      if (until > now) map.set(r.camp, until);
    }
    return map;
  }, [overbidRows, noteSnapshot]);

  // Bid-impact: after you note a camp and cut its bid in ASA, what actually
  // changed? Read straight from the per-day Shopify export — 14 days before the
  // note vs 14 after. Uses the LIVE note timestamp (not the hide snapshot) so a
  // camp you just noted reads "chờ dữ liệu" straight away.
  const campDaily = useMemo(
    () => buildCampDailyIndex(data?.shopifyDaily ?? [], (data?.campLinks ?? []).map((c) => c.camp)),
    [data?.shopifyDaily, data?.campLinks],
  );
  const impactOf = (r: OverbidRow, noteAt: number | null): CampBidImpact | null => {
    if (noteAt === null) return null;
    return campBidImpact(campDaily.get(r.camp), noteAt);
  };

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.category));
    const order = CATEGORY_ORDER as readonly string[];
    return [...order.filter((c) => set.has(c)), ...Array.from(set).filter((c) => !order.includes(c)).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (view === 'active' && !showHidden && hiddenUntil.has(r.camp)) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (matchFilter !== 'all' && r.matchLevel !== matchFilter) return false;
      if (q && !r.camp.toLowerCase().includes(q)) return false;
      return true;
    });
    const { kind, get } = SORT_COLS[sortKey];
    const noteAt = (r: OverbidRow) => noteAliasOf(r)?.at ?? null;
    const dir = sortDir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const va = sortKey === 'noted' ? noteAt(a) : get(a);
      const vb = sortKey === 'noted' ? noteAt(b) : get(b);
      const aEmpty = va === null || va === '';
      const bEmpty = vb === null || vb === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const base = kind === 'num' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb));
      return base * dir || b.score - a.score;
    });
    return out;
  }, [rows, view, search, categoryFilter, matchFilter, sortKey, sortDir, showHidden, hiddenUntil, noteAliasOf]);

  const totalSpend = useMemo(() => filtered.reduce((s, r) => s + r.spend, 0), [filtered]);
  const hiddenCount = hiddenUntil.size;
  const dirty = search !== '' || categoryFilter !== 'all' || matchFilter !== 'all';

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <div className="font-semibold">Couldn’t load data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
        <Flame className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
        <div>
          <b>Camp bị overbid</b> — camp trong <code className="text-[10px]">Shopify_daily</code> có{' '}
          <b>CPC thực tế (Spend/Clicks)</b> vượt <b>bid cho phép</b> hoặc <b>CPI</b> vượt CPI cho phép (tab{' '}
          <code className="text-[10px]">Max bid cap</code>). → nên <b>hạ bid</b>. Nước target lấy từ cột{' '}
          <b>Geo</b> trong <code className="text-[10px]">Camp_Links</code> (🎯, so với trung bình các nước đó); camp
          không điền Geo coi là <b>general</b> → so với <b>trung bình cả category</b> (🌐). Các dòng{' '}
          <code className="text-[10px]">Shopify_daily</code> <b>cùng 1 campaign</b> (cùng URL, do đổi tên/thêm ghi
          chú) được <b>gộp lại</b> — cộng dồn clicks/installs/spend cho cả khoảng — và đánh dấu{' '}
          <span className="rounded bg-indigo-100 px-1 text-[9px] font-semibold text-indigo-700">gộp N</span>. Camp đã
          hạ bid xong sẽ <b>rời list này</b> → tìm lại ở tab{' '}
          <b>✅ Đã xử lý</b> cùng cột <b>Impact bid</b>.
          {data?.shopifyDateRange && (
            <span className="mt-1 block font-medium text-rose-800">
              📅 Dữ liệu áp dụng: {data.shopifyDateRange}
            </span>
          )}
        </div>
      </div>

      {/* Active vs already-handled */}
      {!isLoading && (
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
          {([
            { id: 'active' as ViewMode, label: `🔥 Đang overbid`, n: overbidRows.length, title: 'Camp có CPC/CPI vượt mức cho phép — cần hạ bid.' },
            { id: 'fixed' as ViewMode, label: `✅ Đã xử lý`, n: fixedRows.length, title: 'Camp bạn đã ghi note và giờ không còn trong list overbid: đã về ngưỡng, đã pause, hoặc không còn đủ dữ liệu để đánh giá.' },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchView(t.id)}
              title={t.title}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition',
                view === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {t.label}
              <span className={cn('ml-1 text-[10px]', view === t.id ? 'text-slate-300' : 'text-slate-400')}>{t.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Thresholds + filters */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm camp…" className="pl-7 h-7 text-xs" />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls} title="Category">
            <option value="all">Category: All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)} className={selectCls} title="Độ khớp">
            <option value="all">Match: All</option>
            <option value="country">🎯 Có Geo (theo nước)</option>
            <option value="category">🌐 General (avg category)</option>
          </select>
          <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Ngưỡng</span>
            <span className="text-[10px] text-slate-700 font-medium ml-1">Clicks≥</span>
            <Input type="number" min="0" value={minClicks} onChange={(e) => setMinClicks(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-700 font-medium ml-1">CPC vượt&gt;</span>
            <Input type="number" min="0" value={cpcTol} onChange={(e) => setCpcTol(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-400">%</span>
            <span className="text-[10px] text-slate-700 font-medium ml-1">CPI vượt&gt;</span>
            <Input type="number" min="0" value={cpiTol} onChange={(e) => setCpiTol(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-400">%</span>
          </div>
          {dirty && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setSearch(''); setCategoryFilter('all'); setMatchFilter('all'); }}>
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>
      )}

      {!isLoading && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>
            {filtered.length}
            {filtered.length !== rows.length ? ` / ${rows.length}` : ''}{' '}
            {view === 'fixed' ? 'camp đã xử lý' : 'camp overbid'} · tổng spend{' '}
            <span className={cn('font-semibold', view === 'fixed' ? 'text-slate-700' : 'text-rose-700')}>
              ${formatNumber(totalSpend, { compact: true })}
            </span>
          </span>
          {view === 'active' && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
              title={`${hiddenCount} camp đã ghi note đang tạm ẩn ${HIDE_DAYS} ngày để bạn fix; sẽ tự hiện lại để kiểm tra.`}
            >
              {showHidden
                ? `Đang hiện ${hiddenCount} camp đã note — bấm để ẩn`
                : `🙈 ${hiddenCount} camp đã note (ẩn ${HIDE_DAYS} ngày) — hiện`}
            </button>
          )}
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
          {rows.length > 0
            ? 'Không có camp nào khớp filter.'
            : view === 'fixed'
              ? 'Chưa có camp nào: ghi note vào camp ở tab 🔥 Đang overbid, khi nó ra khỏi list (đã hạ bid / pause) sẽ xuất hiện ở đây.'
              : 'Không tìm thấy camp overbid (kiểm tra tab Shopify_daily đã có data + Max bid cap có Bid Rec).'}
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-auto max-h-[75vh]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10 shadow-sm [&_th]:bg-slate-50">
              <tr>
                <SortHead label="Camp" col="camp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} extra="px-3 min-w-[15rem]" />
                {view === 'fixed' && (
                  <SortHead
                    label="Trạng thái"
                    col="noted"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    extra="min-w-[8rem]"
                    title="Lý do camp không còn trong list overbid + ngày bạn ghi note. Click để sort theo ngày note."
                  />
                )}
                <SortHead label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="CPC / cho phép" col="cpc" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="CPC thực tế / bid cho phép (avg Bid Rec)" />
                <SortHead label="CPI / cho phép" col="cpi" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="CPI thực tế / CPI cho phép (avg)" />
                <SortHead label="Clicks" col="clicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Inst" col="installs" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Spend" col="spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th
                  className="px-2 py-2 text-left font-medium min-w-[7rem]"
                  title="Tác động thật sau khi bạn note hạ bid, 14 ngày TRƯỚC vs 14 ngày SAU (export Shopify theo ngày). Đường biểu diễn là impressions/ngày — chỉ số duy nhất đủ dày để vẽ. CPC và CPI hiện ngay dưới dạng số. Thành công = CPC/CPI giảm mà impressions giữ được."
                >
                  Impact bid
                </th>
                <th className="px-2 py-2 text-left font-medium min-w-[9rem]" title="Ghi chú của bạn (tự lưu)">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = categoryStyle(r.category as Category);
                const hiddenTs = view === 'active' ? hiddenUntil.get(r.camp) : undefined;
                const alias = noteAliasOf(r);
                const imp = impactOf(r, alias?.at ?? null);
                const tag = r.verdict === 'overbid' ? null : VERDICT_TAG[r.verdict];
                return (
                  <tr key={r.url ?? r.camp} className={cn('border-t hover:bg-slate-50 align-top', hiddenTs && 'bg-slate-50/60 text-slate-400')}>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-start gap-1">
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-medium text-[12px] text-indigo-600 hover:underline">
                            {r.camp}
                            <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                          </a>
                        ) : (
                          <span className="font-medium text-[12px] text-slate-800">{r.camp}</span>
                        )}
                        {r.mergedCount > 1 && (
                          <span
                            title={`Gộp từ ${r.mergedCount} dòng cùng campaign (cùng URL):\n${r.mergedNames.join('\n')}`}
                            className="shrink-0 rounded bg-indigo-100 px-1 text-[9px] font-semibold text-indigo-700 leading-[1.4] cursor-help"
                          >
                            gộp {r.mergedCount}
                          </span>
                        )}
                        {hiddenTs && (
                          <span
                            title={`Đã ghi note → tạm ẩn để bạn fix. Tự hiện lại ngày ${dmy(hiddenTs)} để kiểm tra thay đổi.`}
                            className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700 leading-[1.4] cursor-help"
                          >
                            ẩn → hiện lại {dmy(hiddenTs)}
                          </span>
                        )}
                      </span>
                      <div className="text-[10px] text-slate-400">
                        {r.matchLevel === 'country' ? (
                          <span title="Nước target lấy từ Geo trong Camp_Links — so với trung bình các nước đó">🎯 {r.countryLabel}</span>
                        ) : (
                          <span title="Camp không điền Geo → general, so với trung bình cả category" className="text-amber-600">🌐 {r.countryLabel}</span>
                        )}
                      </div>
                    </td>
                    {view === 'fixed' && (
                      <td className="px-2 py-2">
                        {tag && (
                          <span
                            title={tag.title}
                            className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap cursor-help', tag.cls)}
                          >
                            {tag.label}
                          </span>
                        )}
                        {alias && (
                          <div
                            className="mt-0.5 text-[10px] text-slate-400"
                            title={alias.name === r.camp ? undefined : `Note lưu dưới tên cũ của camp: ${alias.name}`}
                          >
                            note {dmy(alias.at)}
                            {alias.name !== r.camp && ' *'}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-2">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap', cs.bg, cs.text)}>
                        <span>{cs.emoji}</span>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className={r.cpcOverPct !== null ? 'text-rose-600 font-semibold' : 'text-slate-700'}>{money(r.cpc)}</span>
                      <span className="text-slate-400"> / {money(r.targetBid)}</span>
                      <DeltaBadge d={deltaPct(r.cpc, r.targetBid)} />
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className={r.cpiOverPct !== null ? 'text-rose-600 font-semibold' : 'text-slate-700'}>{money(r.cpi)}</span>
                      <span className="text-slate-400"> / {money(r.targetCpi)}</span>
                      <DeltaBadge d={deltaPct(r.cpi, r.targetCpi)} />
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-600">{formatNumber(r.clicks, { compact: true })}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-600">{formatNumber(r.installs, { compact: true })}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] font-semibold text-slate-800">${formatNumber(r.spend, { compact: true })}</td>
                    <CampImpactCell impact={imp} />
                    {/* One note per campaign, shared with the Camp Health
                        table; older per-page notes are read as a fallback. */}
                    <NoteCell
                      scope={CAMP_NOTE_SCOPE}
                      noteId={campNoteId(r.camp)}
                      fallbackKeys={legacyCampNoteKeys(r.camp, [...r.mergedNames, ...r.pausedNames])}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            CPC = Spend/Clicks (proxy cho bid đang trả) · CPI = Spend/Installs · bid/CPI cho phép = trung bình từ Max bid cap ·
            🎯 = nước target từ Geo (Camp_Links), <span className="text-amber-600">🌐</span> = general (avg cả category) ·
            <b> Impact bid</b> = 14 ngày trước note vs 14 ngày sau (export Shopify theo ngày): đường vẽ là
            <b> impressions/ngày</b>, kèm <b>CPC</b> và <b>CPI</b> dạng số;
            <span className="text-emerald-600"> chi phí giảm + imp giữ = hạ bid thành công</span>,
            <span className="text-rose-600"> imp rơi mạnh = hạ quá tay</span>, <b>?</b> = quá ít click/install để tin số đó ·
            <b> click cột để sort</b> ·{' '}
            {view === 'fixed'
              ? 'mặc định sắp theo ngày note mới nhất · * = note lưu dưới tên cũ của camp'
              : 'mặc định sắp theo spend lãng phí (overage × spend)'}
          </div>
        </div>
      )}
    </div>
  );
}
