'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pin, AlertCircle, Search, X, ExternalLink, AlertTriangle, ChevronDown } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { NoteCell } from '@/components/shared/NoteCell';
import { useNotesStore, noteKeyOf } from '@/lib/store/notesStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle, CATEGORY_ORDER } from '@/lib/utils/colors';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { ImpactCell } from './ImpactCell';
import { PerCampImpactCell, type PerCampImpact } from './PerCampImpactCell';
import { useKeywordTrendStore } from '@/lib/store/keywordTrendStore';
import { normKw } from '@/lib/sheets/kwNorm';
import { buildPaidShareIndex, summarizeImpact, type NoteImpact } from '@/lib/market/noteImpact';
import { buildCampDailyIndex, campBidImpact } from '@/lib/market/campBidImpact';
import { formatNumber, formatPercent, formatPos } from '@/lib/utils/format';
import {
  findUnderbidKeywords,
  windowSnapshotRows,
  UNDERBID_WINDOWS,
  type UnderbidWindow,
} from '@/lib/market/underbid';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/sheets/types';

const selectCls =
  'h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';

// After you note an underbid keyword, hide it for this many days so the list
// only shows keywords still needing action. It reappears afterwards so you can
// re-check the change. Snapshotted at load → the row you're typing into never
// vanishes mid-edit; the hide kicks in from the next visit.
const HIDE_DAYS = 5;
const DAY_MS = 86_400_000;

const dmy = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

type SortKey =
  | 'keyword'
  | 'category'
  | 'organicUsers'
  | 'organicInstalls'
  | 'organicPos'
  | 'organicPosL30'
  | 'organicCr'
  | 'paidUsers'
  | 'paidPos'
  | 'paidPosL30'
  | 'paidShare'
  | 'score';
type SortDir = 'asc' | 'desc';

// Per-column value + type. 'num' defaults to desc on first click, 'text' to asc.
const SORT_COLS: Record<
  SortKey,
  { kind: 'num' | 'text'; get: (r: import('@/lib/market/underbid').UnderbidRow) => number | string | null }
> = {
  keyword: { kind: 'text', get: (r) => r.term },
  category: { kind: 'text', get: (r) => r.category },
  organicUsers: { kind: 'num', get: (r) => r.organicUsers },
  organicInstalls: { kind: 'num', get: (r) => r.organicInstalls },
  organicPos: { kind: 'num', get: (r) => r.organicPos },
  organicPosL30: { kind: 'num', get: (r) => r.organicPosL30 },
  organicCr: { kind: 'num', get: (r) => r.organicCr },
  paidUsers: { kind: 'num', get: (r) => r.paidUsers },
  paidPos: { kind: 'num', get: (r) => r.paidPos },
  paidPosL30: { kind: 'num', get: (r) => r.paidPosL30 },
  paidShare: { kind: 'num', get: (r) => r.paidShare },
  score: { kind: 'num', get: (r) => r.score },
};

function SortHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
  extra,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  extra?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
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

// Camp cell: collapses to a single line (the first camp) and lets the user
// expand the rest on click. Paused camps with no link are already filtered out
// upstream (findUnderbidKeywords), so everything here is a live camp.
function CampOne({ camp }: { camp: import('@/lib/market/underbid').UnderbidCamp }) {
  return camp.url ? (
    <a
      href={camp.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
    >
      {camp.name}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  ) : (
    <span className="text-[11px] text-slate-600" title="Camp này chưa có URL trong Camp_Links">
      {camp.name}
    </span>
  );
}

function CampCell({
  camps,
  manual,
  chosen,
  onToggle,
}: {
  camps: import('@/lib/market/underbid').UnderbidCamp[];
  manual: boolean;
  /** Camps the user pinned as the ones they actually tune. */
  chosen: string[];
  onToggle: (campName: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (camps.length === 0) {
    return (
      <td className="px-2 py-2 min-w-[12rem]">
        <span className="text-[11px] text-slate-400">—</span>
        {manual && <span className="text-[10px] text-slate-400"> ✍️ added manual</span>}
      </td>
    );
  }

  // A keyword split across campaigns is usually deliberate — one per geo tier —
  // so more than one can be the "real" camp. Pinning is therefore multi-select,
  // and each pinned camp gets its own impact reading. Once anything is pinned
  // the unpinned ones collapse away, since they're noise on every later visit.
  const pinnedSet = new Set(chosen);
  const pinned = camps.filter((c) => pinnedSet.has(c.name));
  // A pin that no longer matches a live camp (renamed, paused) must not silently
  // hide the real ones.
  const stale = chosen.filter((n) => !camps.some((c) => c.name === n));
  const collapsed = pinned.length > 0 && !showAll;
  const shown = collapsed ? pinned : camps;
  const hidden = camps.length - shown.length;

  return (
    <td className="px-2 py-2 min-w-[12rem]">
      <div className="flex flex-col gap-0.5">
        {shown.map((c) => {
          const isPinned = pinnedSet.has(c.name);
          return (
            <div key={c.name} className="flex items-center gap-1">
              {isPinned && <Pin className="h-3 w-3 shrink-0 text-indigo-500" />}
              <CampOne camp={c} />
              {camps.length > 1 && (
                <button
                  type="button"
                  onClick={() => onToggle(c.name)}
                  className={cn(
                    'rounded px-1 text-[10px]',
                    isPinned
                      ? 'text-indigo-600 hover:bg-indigo-50'
                      : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-700',
                  )}
                  title={
                    isPinned
                      ? 'Bỏ ghim camp này'
                      : 'Ghim camp này — chọn được nhiều camp, mỗi camp theo dõi impact riêng'
                  }
                >
                  {isPinned ? 'bỏ ghim' : 'ghim'}
                </button>
              )}
            </div>
          );
        })}

        {stale.length > 0 && (
          <div
            className="text-[9px] text-amber-600"
            title={`Camp đã ghim không còn trong danh sách đang chạy: ${stale.join(', ')}`}
          >
            ⚠️ {stale.length} camp đã ghim không còn chạy
          </div>
        )}

        {camps.length > 1 && (pinned.length > 0 || showAll) && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-0.5 self-start rounded px-1 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', showAll && 'rotate-180')} />
            {collapsed ? `hiện ${hidden} camp khác` : 'chỉ hiện camp đã ghim'}
          </button>
        )}

        {camps.length > 1 && pinned.length === 0 && !showAll && (
          <span className="text-[9px] text-slate-400">bấm “ghim” ở camp bạn sẽ chỉnh bid</span>
        )}
      </div>
      {manual && <span className="text-[10px] text-slate-400">✍️ added manual</span>}
    </td>
  );
}

// Scope for the pinned-camp choice. Separate from the 'underbid' note scope so
// pinning a camp never disturbs a note's updatedAt — that timestamp is the
// measurement anchor for the Impact bid column.
const CAMP_SCOPE = 'underbid-camp';

export function UnderbidView() {
  const { data, isLoading, error } = useSheetData();

  // Load saved notes from the App_Notes sheet tab once on mount.
  const loadNotes = useNotesStore((s) => s.load);
  const notesLoaded = useNotesStore((s) => s.loaded);
  const noteTimes = useNotesStore((s) => s.updatedAt);
  const allNotes = useNotesStore((s) => s.notes);
  const setNote = useNotesStore((s) => s.setNote);
  // Pins are stored newline-separated in one note value. Camp names never
  // contain newlines (Camp_Links collapses them), so the split is unambiguous.
  const chosenCampsOf = (term: string): string[] =>
    (allNotes[noteKeyOf(CAMP_SCOPE, term)] || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  const toggleCamp = (term: string, campName: string) => {
    const cur = chosenCampsOf(term);
    const next = cur.includes(campName) ? cur.filter((c) => c !== campName) : [...cur, campName];
    setNote(CAMP_SCOPE, term, next.join('\n'));
  };
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Snapshot note timestamps once when they first load, so a keyword you note in
  // this session stays visible while you're typing — it only gets hidden on the
  // next visit (when its updatedAt is part of the loaded snapshot).
  const [noteSnapshot, setNoteSnapshot] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (notesLoaded && noteSnapshot === null) setNoteSnapshot(noteTimes);
  }, [notesLoaded, noteSnapshot, noteTimes]);

  // Whether to reveal keywords currently in their post-note hide window.
  const [showHidden, setShowHidden] = useState(false);

  // Open the keyword detail sheet (shows the bid-impact chart) on click.
  const openKeyword = useKeywordTrendStore((s) => s.openKeyword);

  // Paid-share timeline per keyword (from History_Daily) → lets each noted row
  // show how paid share moved before vs ~10 days after the note.
  const shareIndex = useMemo(() => buildPaidShareIndex(data?.historyDaily ?? []), [data?.historyDaily]);
  // Per-camp spend series, so a pinned camp can be measured on its own rather
  // than through the keyword-level paid-share proxy.
  const campDaily = useMemo(
    () => buildCampDailyIndex(data?.shopifyDaily ?? [], (data?.campLinks ?? []).map((c) => c.camp)),
    [data?.shopifyDaily, data?.campLinks],
  );
  const perCampImpact = (term: string, camps: string[]): PerCampImpact[] => {
    const ts = noteTimes[noteKeyOf('underbid', term)];
    if (!ts) return [];
    const at = new Date(ts).getTime();
    if (!Number.isFinite(at)) return [];
    return camps.map((camp) => ({ camp, impact: campBidImpact(campDaily.get(camp), at) }));
  };
  const impactOf = (term: string): NoteImpact | null => {
    const ts = noteTimes[noteKeyOf('underbid', term)];
    if (!ts) return null;
    const at = new Date(ts).getTime();
    if (!Number.isFinite(at)) return null;
    return summarizeImpact(shareIndex.get(normKw(term)), at);
  };

  // Time range the analysis runs on (default L365 = long-term demand).
  const [window, setWindow] = useState<UnderbidWindow>('L365');
  // Detection thresholds (tunable).
  const [minOrganic, setMinOrganic] = useState('5');
  const [maxShare, setMaxShare] = useState('30');
  const [posTh, setPosTh] = useState('2.7');
  // Post-filters.
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(SORT_COLS[key].kind === 'num' ? 'desc' : 'asc');
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    return findUnderbidKeywords(
      windowSnapshotRows(data, window),
      data.masterKwLookup ?? [],
      data.kwAddedManual ?? [],
      data.negativeKw ?? [],
      data.pausedKw ?? [],
      data.campLinks ?? [],
      data.allL30 ?? [],
      {
        minOrganicUsers: Number(minOrganic) || 0,
        maxPaidSharePct: Number(maxShare) || 0,
        posThreshold: Number(posTh) || 0,
      },
    );
  }, [data, window, minOrganic, maxShare, posTh]);

  // Keywords still inside their post-note hide window → term -> reappear time.
  const hiddenUntil = useMemo(() => {
    const map = new Map<string, number>();
    if (!noteSnapshot) return map;
    const now = Date.now();
    for (const r of rows) {
      const ts = noteSnapshot[noteKeyOf('underbid', r.term)];
      if (!ts) continue;
      const noted = new Date(ts).getTime();
      if (!Number.isFinite(noted)) continue;
      const until = noted + HIDE_DAYS * DAY_MS;
      if (until > now) map.set(r.term, until);
    }
    return map;
  }, [rows, noteSnapshot]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.category));
    const order = CATEGORY_ORDER as readonly string[];
    return [
      ...order.filter((c) => set.has(c)),
      ...Array.from(set).filter((c) => !order.includes(c)).sort(),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (!showHidden && hiddenUntil.has(r.term)) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (q && !r.term.toLowerCase().includes(q)) return false;
      return true;
    });
    const { kind, get } = SORT_COLS[sortKey];
    const dir = sortDir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      // Nulls/blanks always sink to the bottom regardless of direction.
      const aEmpty = va === null || va === '';
      const bEmpty = vb === null || vb === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const base =
        kind === 'num' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb));
      return base * dir || b.score - a.score;
    });
    return out;
  }, [rows, search, categoryFilter, sortKey, sortDir, showHidden, hiddenUntil]);

  const hiddenCount = hiddenUntil.size;
  const dirty = search !== '' || categoryFilter !== 'all';

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
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div>
          <b>Keyword bị underbid</b> — có nhu cầu organic thật trong <b>{window}</b>, <b>đã được bid</b> trong 1 camp, nhưng{' '}
          paid xuất hiện rất ít so với organic <b>(paid share &lt; {maxShare}%)</b> và/hoặc vị trí paid yếu{' '}
          <b>(&gt; {posTh}</b> hoặc chưa lên paid). → nên cân nhắc <b>tăng bid</b> để hứng thêm install. Cột{' '}
          <b>Camp</b> cho biết nó đang nằm ở camp nào (kèm link).
        </div>
      </div>

      {/* Thresholds + filters */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
          <div className="inline-flex items-center gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Time range</span>
            <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {UNDERBID_WINDOWS.map((w) => {
                const active = w === window;
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWindow(w)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium transition',
                      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                    )}
                    title={`Last ${w.slice(1)} days`}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm keyword…"
              className="pl-7 h-7 text-xs"
            />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls} title="Category">
            <option value="all">Category: All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Ngưỡng</span>
            <span className="text-[10px] text-slate-700 font-medium ml-1">Organic≥</span>
            <Input type="number" min="0" value={minOrganic} onChange={(e) => setMinOrganic(e.target.value)} className="h-6 w-14 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-700 font-medium ml-1">Paid share&lt;</span>
            <Input type="number" min="0" max="100" value={maxShare} onChange={(e) => setMaxShare(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-400">%</span>
            <span className="text-[10px] text-slate-700 font-medium ml-1">Paid pos&gt;</span>
            <Input type="number" min="0" step="0.1" value={posTh} onChange={(e) => setPosTh(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
          </div>
          {dirty && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setSearch(''); setCategoryFilter('all'); }}>
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
          <CopyKeywordsButton keywords={filtered.map((r) => r.term)} label="Copy keywords" className="ml-auto" />
        </div>
      )}

      {!isLoading && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>
            {filtered.length}
            {filtered.length !== rows.length ? ` / ${rows.length}` : ''} keyword underbid
          </span>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
              title={`${hiddenCount} keyword đã ghi note đang tạm ẩn ${HIDE_DAYS} ngày để bạn xử lý; sẽ tự hiện lại để kiểm tra.`}
            >
              {showHidden
                ? `Đang hiện ${hiddenCount} keyword đã note — bấm để ẩn`
                : `🙈 ${hiddenCount} keyword đã note (ẩn ${HIDE_DAYS} ngày) — hiện`}
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
          Không có keyword nào khớp ngưỡng underbid. Thử nới ngưỡng (tăng paid share, giảm organic≥).
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-auto max-h-[75vh]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10 shadow-sm [&_th]:bg-slate-50">
              <tr>
                <SortHead label="Keyword" col="keyword" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} extra="px-3 min-w-[13rem]" />
                <SortHead label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Org users" col="organicUsers" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Org install" col="organicInstalls" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label={`Org pos ${window}`} col="organicPos" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Org pos L30" col="organicPosL30" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Org CR" col="organicCr" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Paid users" col="paidUsers" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label={`Paid pos ${window}`} col="paidPos" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Paid pos L30" col="paidPosL30" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Paid share" col="paidShare" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-2 py-2 text-left font-medium min-w-[12rem]">Camp (đang bid)</th>
                <th
                  className="px-2 py-2 text-left font-medium min-w-[7rem]"
                  title="Sau khi bạn ghi note (sửa bid), paid share thay đổi thế nào ~10 ngày sau? Tăng = paid đang hứng được nhu cầu organic → tốt."
                >
                  Impact bid
                </th>
                <th className="px-2 py-2 text-left font-medium min-w-[9rem]" title="Ghi chú của bạn (tự lưu)">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = categoryStyle(r.category as Category);
                const hiddenTs = hiddenUntil.get(r.term);
                return (
                  <tr key={r.term} className={cn('border-t hover:bg-slate-50 align-top', hiddenTs && 'bg-slate-50/60 text-slate-400')}>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-1">
                        <KeywordLink keyword={r.term} surface="paid" className="font-medium text-sm" />
                        {hiddenTs && (
                          <span
                            title={`Đã ghi note → tạm ẩn để bạn xử lý. Tự hiện lại ngày ${dmy(hiddenTs)} để kiểm tra thay đổi.`}
                            className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700 leading-[1.4] cursor-help"
                          >
                            ẩn → hiện lại {dmy(hiddenTs)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap', cs.bg, cs.text)}>
                        <span>{cs.emoji}</span>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      {formatNumber(r.organicUsers, { compact: true })}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-emerald-700">
                      {formatNumber(r.organicInstalls, { compact: true })}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {formatPos(r.organicPos)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {formatPos(r.organicPosL30)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-600">
                      {formatPercent(r.organicCr)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className={r.paidUsers === 0 ? 'text-rose-600 font-medium' : ''}>
                        {formatNumber(r.paidUsers, { compact: true })}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {formatPos(r.paidPos)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {formatPos(r.paidPosL30)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <span className="font-mono text-[11px] font-semibold text-amber-700">{formatPercent(r.paidShare)}</span>
                    </td>
                    <CampCell
                      camps={r.camps}
                      manual={r.inPaidSource === 'manual'}
                      chosen={chosenCampsOf(r.term)}
                      onToggle={(name) => toggleCamp(r.term, name)}
                    />
                    {/* Pinned camps get their own per-camp reading; with none
                        pinned there's nothing to separate, so the keyword-level
                        paid-share view stands. */}
                    {chosenCampsOf(r.term).length > 0 ? (
                      <PerCampImpactCell items={perCampImpact(r.term, chosenCampsOf(r.term))} />
                    ) : (
                      <ImpactCell impact={impactOf(r.term)} onOpen={() => openKeyword(r.term, { surface: 'paid' })} />
                    )}
                    <NoteCell scope="underbid" noteId={r.term} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            Rule lọc chạy trên <b>{window}</b> · Org install = số install organic trong {window} · pos = avg position · <b>pos L30</b> = vị trí trung bình 30 ngày gần nhất (chỉ để tham khảo, không ảnh hưởng rule) · Org CR = install organic ÷ users organic (CR cao = tiềm năng convert tốt, đáng tăng bid) · Paid share = paid ÷ (organic + paid) · <b>click cột để sort</b> · mặc định sắp theo nhu cầu organic mà paid đang bỏ lỡ
          </div>
        </div>
      )}
    </div>
  );
}
