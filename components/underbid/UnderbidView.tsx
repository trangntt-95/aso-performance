'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pin, AlertCircle, X, ExternalLink, AlertTriangle, ChevronDown } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { NoteCell } from '@/components/shared/NoteCell';
import { useNotesStore } from '@/lib/store/notesStore';
import { KEYWORD_NOTE_SCOPE, KEYWORD_PIN_SCOPE, keywordNoteId, keywordNoteKeys, readKeywordNoteAt, readPinnedCamps, togglePinnedCamp } from '@/lib/store/keywordNotes';
import { Input } from '@/components/ui/input';
import { KeywordSearchBox } from '@/components/shared/KeywordSearchBox';
import { matchKeywordQuery, parseKeywordQuery } from '@/lib/utils/keywordQuery';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle, CATEGORY_ORDER } from '@/lib/utils/colors';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { ImpactCell } from './ImpactCell';
import { PerCampImpactCell, type PerCampImpact } from './PerCampImpactCell';
import { useKeywordTrendStore } from '@/lib/store/keywordTrendStore';
import { buildPaidShareIndex, summarizeImpact, type NoteImpact } from '@/lib/market/noteImpact';
import { buildCampDailyIndex, campBidImpact } from '@/lib/market/campBidImpact';
import { formatNumber, formatPercent, formatPos } from '@/lib/utils/format';
import { buildKeywordNetValue, type KeywordNetValue } from '@/lib/market/keywordNetValue';
import {
  buildUnderbidCeilingIndex,
  type CampCeiling,
  type CeilingVerdict,
  type KeywordCeiling,
} from '@/lib/market/underbidCeiling';
import { normKw } from '@/lib/sheets/kwNorm';
import { buildCampNoteResolver } from '@/lib/store/campNotes';
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

type NetValueMap = Map<string, KeywordNetValue>;

/**
 * Dòng Underbid kèm giá trị thật của keyword.
 *
 * Gắn vào dòng chứ không tra trong lúc render: cột này sort được, mà hàm sort
 * chỉ nhận một dòng — tra bảng ngoài trong đó thì mỗi lần so hai dòng lại tra
 * hai lần.
 */
type RowWithValue = import('@/lib/market/underbid').UnderbidRow & {
  nv: KeywordNetValue | null;
  /** Trần bid theo từng nước camp target, cùng công thức với Bid Rec của sheet
   *  và cùng mốc Overbid dùng — xem lib/market/underbidCeiling.ts. */
  ceil: KeywordCeiling;
};

const VERDICT_TAG: Record<CeilingVerdict, { label: string; cls: string; title: string }> = {
  room: {
    label: 'còn chỗ nâng',
    cls: 'bg-emerald-100 text-emerald-800',
    title: 'Bid đang set thấp hơn trần trên 10% — tăng bid vẫn trong vùng hoà vốn.',
  },
  'at-ceiling': {
    label: 'đã tới trần',
    cls: 'bg-amber-100 text-amber-800',
    title: 'Bid đang set nằm trong ±10% trần. Tăng nữa là mua đắt hơn giá trị một install; độ phủ thấp ở đây là do thị trường đắt, không phải do bid thấp.',
  },
  over: {
    label: 'đã vượt trần',
    cls: 'bg-rose-100 text-rose-800',
    title: 'Bid đang set cao hơn trần trên 10% — đây là cặp keyword Underbid nhưng camp sẽ hiện ở Overbid. Không tăng; xem lại geo hoặc hạ.',
  },
  unknown: {
    label: '',
    cls: '',
    title: '',
  },
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
  | 'paidInstalls'
  | 'paidPos'
  | 'paidPosL30'
  | 'paidShare'
  | 'netPerInstall'
  | 'breakeven'
  | 'bidNow'
  | 'score';
type SortDir = 'asc' | 'desc';

// Per-column value + type. 'num' defaults to desc on first click, 'text' to asc.
const SORT_COLS: Record<
  SortKey,
  { kind: 'num' | 'text'; get: (r: RowWithValue) => number | string | null }
> = {
  keyword: { kind: 'text', get: (r) => r.term },
  category: { kind: 'text', get: (r) => r.category },
  organicUsers: { kind: 'num', get: (r) => r.organicUsers },
  organicInstalls: { kind: 'num', get: (r) => r.organicInstalls },
  organicPos: { kind: 'num', get: (r) => r.organicPos },
  organicPosL30: { kind: 'num', get: (r) => r.organicPosL30 },
  organicCr: { kind: 'num', get: (r) => r.organicCr },
  paidUsers: { kind: 'num', get: (r) => r.paidUsers },
  paidInstalls: { kind: 'num', get: (r) => r.paidInstalls },
  paidPos: { kind: 'num', get: (r) => r.paidPos },
  paidPosL30: { kind: 'num', get: (r) => r.paidPosL30 },
  paidShare: { kind: 'num', get: (r) => r.paidShare },
  netPerInstall: { kind: 'num', get: (r) => r.nv?.netPerInstall ?? null },
  // Sắp theo trần THẤP nhất trong các camp — camp chật chỗ nhất là camp cần đọc.
  breakeven: { kind: 'num', get: (r) => r.ceil.ceilingMin },
  bidNow: { kind: 'num', get: (r) => r.ceil.bidNow },
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
  title,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  extra?: string;
  /** Header tooltip, for a column whose label can't carry its own caveat. */
  title?: string;
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

const MAX_CAMP_LINES = 3;

/** Một dòng camp trong tooltip trần: từng nước, nguồn giá trị, CR, chặn tier. */
function campCeilingTitle(c: CampCeiling): string {
  const head = `${c.camp}\n${c.countries.length} nước${c.scope === 'geo' ? ' theo Geo camp' : ' (mọi nước của category trừ nước không target)'}${
    c.ceiling === null ? ' — không nước nào đủ dữ liệu' : `, trung bình $${c.ceiling.toFixed(2)}`
  }`;
  const body = c.countries
    .map(
      (x) =>
        `  ${x.country}: $${x.value.toFixed(0)}${x.valueSource === 'keyword' ? ' (keyword)' : ' (NPI sheet)'} × 90% × CR ${Math.round(x.cr * 100)}%${
          x.crSource === 'organic' ? ' (organic)' : ''
        } = $${x.raw.toFixed(2)}${x.capped ? ` → chặn tier $${x.tierCeiling}` : ''}`,
    )
    .join('\n');
  const skipped = c.skipped.length > 0 ? `\n  Bỏ qua (thiếu NPI/CR sheet, keyword chưa đủ 3 shop): ${c.skipped.join(', ')}` : '';
  return `${head}\n${body}${skipped}`;
}

/**
 * Hai ô "Trần bid" và "Bid đang set", cùng thứ tự camp để đọc ngang được.
 *
 * Mỗi camp một dòng, vì bid được set theo keyword × camp và trần phụ thuộc geo
 * của camp — gộp về một số cho cả keyword là chỗ bản thử đầu sai (mọi keyword
 * ra cùng một trần ~$19). Camp vượt trần xếp trước; quá 3 camp thì gấp lại.
 */
function CeilingCells({ ceil }: { ceil: KeywordCeiling }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? ceil.camps : ceil.camps.slice(0, MAX_CAMP_LINES);
  const hidden = ceil.camps.length - shown.length;
  const shortName = (camp: string) => camp.replace(/^TP\s*[-_]\s*/i, '').replace(/\s*\((?:CPI|cpi)[^)]*\)/g, '');
  const toggle =
    ceil.camps.length > MAX_CAMP_LINES ? (
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="text-[9px] text-slate-500 hover:text-slate-700"
      >
        {showAll ? 'gấp lại' : `+${hidden} camp`}
      </button>
    ) : null;
  return (
    <>
      <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] align-top">
        <div className="flex flex-col items-end gap-0.5">
          {shown.map((c) => (
            <span key={c.camp} className="cursor-help leading-[1.4]" title={campCeilingTitle(c)}>
              {c.ceiling === null ? (
                <span className="text-slate-300">—</span>
              ) : (
                <span className="font-semibold text-indigo-700">${c.ceiling.toFixed(2)}</span>
              )}
              {c.countries.some((x) => x.capped) && (
                <span className="ml-0.5 text-[9px] text-amber-700" title="Có nước bị trần tier chặn">⛔</span>
              )}
            </span>
          ))}
          {toggle}
        </div>
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] align-top">
        <div className="flex flex-col items-end gap-0.5">
          {shown.map((c) => {
            const tag = VERDICT_TAG[c.verdict];
            return (
              <span
                key={c.camp}
                className="inline-flex items-center gap-1 leading-[1.4]"
                title={`${c.camp}${c.bidNow === null ? ' — Master KW Lookup không có bid' : `: bid $${c.bidNow.toFixed(2)}`}${
                  c.ceiling !== null ? ` / trần $${c.ceiling.toFixed(2)}` : ''
                }${c.verdict !== 'unknown' ? `\n${tag.title}` : ''}`}
              >
                <span className="max-w-[9rem] truncate font-sans text-[9px] text-slate-400" title={c.camp}>
                  {shortName(c.camp)}
                </span>
                {c.bidNow === null ? (
                  <span className="text-slate-300">—</span>
                ) : (
                  <span className="text-slate-800">${c.bidNow.toFixed(2)}</span>
                )}
                {c.verdict !== 'unknown' && (
                  <span className={cn('rounded px-1 text-[9px] font-sans font-medium', tag.cls)}>{tag.label}</span>
                )}
              </span>
            );
          })}
          {ceil.camps.length > 1 && (
            <span className="text-[9px] font-sans text-slate-400">
              {ceil.counts.over > 0 && <span className="text-rose-700">{ceil.counts.over} vượt</span>}
              {ceil.counts.over > 0 && (ceil.counts['at-ceiling'] > 0 || ceil.counts.room > 0) && ' · '}
              {ceil.counts['at-ceiling'] > 0 && <span className="text-amber-700">{ceil.counts['at-ceiling']} tới trần</span>}
              {ceil.counts['at-ceiling'] > 0 && ceil.counts.room > 0 && ' · '}
              {ceil.counts.room > 0 && <span className="text-emerald-700">{ceil.counts.room} còn chỗ</span>}
            </span>
          )}
        </div>
      </td>
    </>
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
      className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-indigo-600 hover:underline"
    >
      {camp.name}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  ) : (
    <span className="whitespace-nowrap text-[11px] text-slate-600" title="Camp này chưa có URL trong Camp_Links">
      {camp.name}
    </span>
  );
}

function CampCell({
  camps,
  manual,
  negative,
  chosen,
  onToggle,
}: {
  camps: import('@/lib/market/underbid').UnderbidCamp[];
  manual: boolean;
  /** Keyword đang nằm trong Negative KW list — vẫn hiện vì organic có nhu cầu. */
  negative?: boolean;
  /** Camps the user pinned as the ones they actually tune. */
  chosen: string[];
  onToggle: (campName: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (camps.length === 0) {
    return (
      <td className="whitespace-nowrap px-2 py-2">
        <span className="text-[11px] text-slate-400" title={negative ? undefined : 'Chưa bid ở camp nào'}>—</span>
        {manual && <span className="text-[10px] text-slate-400"> ✍️ added manual</span>}
        {negative && (
          <span className="ml-1 rounded bg-rose-100 px-1 text-[9px] font-semibold text-rose-700" title="Keyword đang nằm trong Negative KW list, nhưng organic vẫn có nhu cầu — cân nhắc gỡ negative">
            ⛔ negative
          </span>
        )}
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
    <td className="whitespace-nowrap px-2 py-2">
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

// Ghim camp: scope 'underbid-camp' (KEYWORD_PIN_SCOPE), tách khỏi scope note để
// bấm ghim không đụng updatedAt của note — mốc đo Impact bid. Khoá và cách đọc
// dùng chung với Vị trí keyword / Paid Coverage: xem lib/store/keywordNotes.ts.

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
  const chosenCampsOf = (term: string): string[] => readPinnedCamps(allNotes, term);
  const toggleCamp = (term: string, campName: string) => {
    setNote(KEYWORD_PIN_SCOPE, keywordNoteId(term), togglePinnedCamp(chosenCampsOf(term), campName));
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
    const ts = readKeywordNoteAt(noteTimes, term);
    if (!ts) return [];
    const at = new Date(ts).getTime();
    if (!Number.isFinite(at)) return [];
    return camps.map((camp) => ({ camp, impact: campBidImpact(campDaily.get(camp), at) }));
  };
  const impactOf = (term: string): NoteImpact | null => {
    const ts = readKeywordNoteAt(noteTimes, term);
    if (!ts) return null;
    const at = new Date(ts).getTime();
    if (!Number.isFinite(at)) return null;
    return summarizeImpact(shareIndex.get(normKw(term)), at);
  };

  // Time range the analysis runs on (default L365 = long-term demand).
  const [window, setWindow] = useState<UnderbidWindow>('L365');
  // On the L30 window the "… pos L30" columns repeat the window columns exactly,
  // so they are dropped instead of printed twice (see the header comment).
  const isL30Window = window === 'L30';
  // Detection thresholds (tunable).
  const [minOrganic, setMinOrganic] = useState('5');
  const [maxShare, setMaxShare] = useState('60');
  const [posTh, setPosTh] = useState('1');
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

  // Giá trị thật của keyword, từ tab 'Net value per install'.
  const netValueBy: NetValueMap = useMemo(() => buildKeywordNetValue(data), [data]);

  // Trần bid theo từng nước camp target — cùng mốc với Overbid. Bản cũ nhân
  // net value gộp mọi nước với CR organic và không chặn tier, lệch 2–4 lần so
  // Bid Rec của sheet cho cùng một keyword (15/09/2026).
  const ceilingIndex = useMemo(() => buildUnderbidCeilingIndex(data), [data]);
  const valued: RowWithValue[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        nv: netValueBy.get(normKw(r.term)) ?? null,
        ceil: ceilingIndex.compute({
          term: r.term,
          category: r.category,
          camps: r.camps.map((c) => c.name),
          organicCr: r.organicCr,
        }),
      })),
    [rows, netValueBy, ceilingIndex],
  );

  // Danh tính camp dùng chung với Overbid / Camp Health — để note ghi ở đó cũng
  // ẩn được keyword ở đây.
  const campNoteIds = useMemo(
    () => buildCampNoteResolver(data?.campLinks ?? [], (data?.shopifyDaily ?? []).map((r) => r.camp)),
    [data?.campLinks, data?.shopifyDaily],
  );

  /** Vì sao một keyword đang ẩn: note của chính nó, hay note của camp nó chạy. */
  interface HiddenInfo {
    until: number;
    via: 'keyword' | 'camp';
    camp?: string;
  }

  // Keywords still inside their post-note hide window → term -> reappear time.
  //
  // Hai nguồn ẩn (Trang, 14/09/2026): note của keyword trong bảng này, VÀ note
  // của camp ghim trong Overbid / Camp Health — hạ bid camp xong mà keyword của
  // camp đó vẫn nằm trong danh sách underbid thì dễ tăng bid ngược lại. Camp
  // xét theo ghim nếu đã ghim; chưa ghim thì mọi camp keyword đang chạy. Lấy mốc
  // MỚI NHẤT trong các nguồn để ngày hiện lại là ngày thật.
  const hiddenUntil = useMemo(() => {
    const map = new Map<string, HiddenInfo>();
    if (!noteSnapshot) return map;
    const now = Date.now();
    for (const r of rows) {
      let best: HiddenInfo | null = null;
      const ts = readKeywordNoteAt(noteSnapshot, r.term);
      if (ts) {
        const noted = new Date(ts).getTime();
        if (Number.isFinite(noted)) best = { until: noted + HIDE_DAYS * DAY_MS, via: 'keyword' };
      }
      const pins = chosenCampsOf(r.term);
      const campNames = pins.length > 0 ? pins : r.camps.map((c) => c.name);
      for (const name of campNames) {
        const at = campNoteIds.noteAt(noteSnapshot, name);
        if (at === null) continue;
        const until = at + HIDE_DAYS * DAY_MS;
        if (!best || until > best.until) best = { until, via: 'camp', camp: name };
      }
      if (best && best.until > now) map.set(r.term, best);
    }
    return map;
  }, [rows, noteSnapshot, campNoteIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const query = parseKeywordQuery(search);
    const out = valued.filter((r) => {
      if (!showHidden && hiddenUntil.has(r.term)) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (!query.empty && !matchKeywordQuery(r.term, query)) return false;
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
  }, [valued, search, categoryFilter, sortKey, sortDir, showHidden, hiddenUntil]);

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
          <b>Keyword bị underbid</b> — có nhu cầu organic thật trong <b>{window}</b> (organic users ≥ {minOrganic}), nhưng{' '}
          paid xuất hiện rất ít so với organic <b>(paid share &lt; {maxShare}%)</b> và vị trí paid yếu{' '}
          <b>(&gt; {posTh}</b> hoặc chưa có vị trí paid). → nên <b>tăng bid</b>, hoặc <b>mở bid</b> nếu chưa bid. Không còn đòi keyword
          phải có trong Master hay ngoài Negative: <b>bất kỳ keyword nào</b> thoả điều kiện organic đều vào. Cột <b>Camp</b> cho biết
          nó đang nằm ở camp nào (kèm link), trống nghĩa là <b>chưa bid ở đâu</b>; nhãn <b>negative</b> = đang nằm trong Negative KW list
          mà organic vẫn có nhu cầu.
          {' '}
          <span className="mt-1 block border-t border-amber-200 pt-1">
            <b>Ba cột tiền:</b> <b>$/install</b> là net value một install của keyword
            ((doanh thu − phí Shopify) ÷ install, gộp mọi nước, cả hai kênh — chỉ để xem keyword
            đáng tiền tới đâu). <b>Trần bid</b> tính <b>theo từng camp</b>, trên các nước camp đó
            target, cùng công thức và cùng mốc với &quot;bid cho phép&quot; ở Overbid: mỗi nước lấy giá
            trị install <b>paid</b> của keyword ở nước đó khi đủ 3 shop trả tiền, không thì lấy NPI
            Country × Category của <code className="text-[10px]">Max bid cap</code>; nhân 90% và CR
            used của ô; chặn bởi Tier ceil; rồi trung bình các nước của camp. <b>Bid đang set</b> là
            bid của keyword trong từng camp (Master KW Lookup), kèm nhãn so trần của chính camp đó:{' '}
            <span className="rounded bg-emerald-100 px-1 text-emerald-800">còn chỗ nâng</span>{' '}
            <span className="rounded bg-amber-100 px-1 text-amber-800">đã tới trần</span>{' '}
            <span className="rounded bg-rose-100 px-1 text-rose-800">đã vượt trần</span>. Keyword
            underbid mà bid đã tới trần nghĩa là <b>độ phủ thấp vì thị trường đắt</b>, không phải vì
            bid thấp — tăng nữa là mua đắt hơn giá trị. Nhãn <b>mỏng</b> nghĩa là dưới 3 shop trả
            tiền.
          </span>
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
          <KeywordSearchBox
            value={search}
            onChange={setSearch}
            placeholder="Tìm keyword — vd: profit -calc"
          />
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
              title={`${hiddenCount} keyword đang tạm ẩn ${HIDE_DAYS} ngày vì bạn vừa note chính keyword đó, hoặc note camp nó chạy (Overbid / Camp Health); sẽ tự hiện lại để kiểm tra.`}
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
                {/* The L30 columns exist to put a RECENT reading next to a longer
                    one. On the L30 window they would be that same reading twice,
                    so they are dropped rather than printed as a second identical
                    column — which read as two different measurements agreeing. */}
                {!isL30Window && (
                  <SortHead label="Org pos L30" col="organicPosL30" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                )}
                <SortHead label="Org CR" col="organicCr" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Paid users" col="paidUsers" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Paid install" col="paidInstalls" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Install từ paid trong window đang chọn. 0 install trong khi vẫn có click nghĩa là traffic paid đang không chuyển đổi — nâng bid sẽ chỉ mua thêm click." />
                <SortHead label={`Paid pos ${window}`} col="paidPos" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                {!isL30Window && (
                  <SortHead label="Paid pos L30" col="paidPosL30" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                )}
                <SortHead label="Paid share" col="paidShare" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead
                  label="$/install"
                  col="netPerInstall"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  title="Net value một install của keyword này = (doanh thu − phí Shopify) ÷ install, gộp mọi nước. Nguồn: tab 'Net value per install'. Xếp giảm dần để thấy keyword volume thấp nhưng đáng tiền."
                />
                <SortHead
                  label="Trần bid"
                  col="breakeven"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  title="Mỗi camp một trần: trung bình theo các nước camp đó target của min(giá trị install paid × 90% × CR used, Tier ceil). Giá trị lấy của keyword × nước khi đủ 3 shop trả tiền, không thì NPI Country × Category của 'Max bid cap'. Cùng mốc 'bid cho phép' của Overbid. Hover từng dòng để xem từng nước. Sort theo trần thấp nhất."
                />
                <SortHead
                  label="Bid đang set"
                  col="bidNow"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  title="Bid (max) của keyword trong từng camp đang chạy, theo Master KW Lookup, cùng thứ tự với cột Trần bid. Nhãn so với trần của chính camp đó: dưới 90% = còn chỗ nâng, trong ±10% = đã tới trần, trên 110% = đã vượt. Sort theo bid cao nhất."
                />
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
                const hiddenInfo = hiddenUntil.get(r.term);
                const hiddenTs = hiddenInfo?.until;
                return (
                  <tr key={r.term} className={cn('border-t hover:bg-slate-50 align-top', hiddenTs && 'bg-slate-50/60 text-slate-400')}>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-1">
                        <KeywordLink keyword={r.term} surface="paid" className="font-medium text-sm" />
                        {hiddenInfo && hiddenTs && (
                          <span
                            title={
                              hiddenInfo.via === 'camp'
                                ? `Camp "${hiddenInfo.camp}" vừa được note ở Overbid / Camp Health → keyword này tạm ẩn để không hành động trùng. Tự hiện lại ngày ${dmy(hiddenTs)}.`
                                : `Đã ghi note → tạm ẩn để bạn xử lý. Tự hiện lại ngày ${dmy(hiddenTs)} để kiểm tra thay đổi.`
                            }
                            className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700 leading-[1.4] cursor-help"
                          >
                            {hiddenInfo.via === 'camp' ? 'camp đã note' : 'ẩn'} → hiện lại {dmy(hiddenTs)}
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
                    {!isL30Window && (
                      <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                        {formatPos(r.organicPosL30)}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-600">
                      {formatPercent(r.organicCr)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className={r.paidUsers === 0 ? 'text-rose-600 font-medium' : ''}>
                        {formatNumber(r.paidUsers, { compact: true })}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      {/* Paid clicks with zero installs is the one reading that argues
                          AGAINST raising the bid, so it is called out rather than left
                          as a plain 0 among the other numbers. */}
                      <span
                        className={
                          r.paidUsers > 0 && r.paidInstalls === 0
                            ? 'font-medium text-rose-600'
                            : r.paidInstalls > 0
                              ? 'text-emerald-700'
                              : 'text-slate-400'
                        }
                        title={
                          r.paidUsers > 0 && r.paidInstalls === 0
                            ? 'Có click paid nhưng chưa install nào — nâng bid ở đây chỉ mua thêm click, xem lại keyword/landing trước.'
                            : undefined
                        }
                      >
                        {formatNumber(r.paidInstalls, { compact: true })}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {formatPos(r.paidPos)}
                    </td>
                    {!isL30Window && (
                      <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                        {formatPos(r.paidPosL30)}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <span className="font-mono text-[11px] font-semibold text-amber-700">{formatPercent(r.paidShare)}</span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      {r.nv?.netPerInstall == null ? (
                        <span
                          className="text-slate-300"
                          title="Keyword này chưa có dòng nào trong tab 'Net value per install' — chưa có install paid nào truy được về nó."
                        >
                          —
                        </span>
                      ) : (
                        <span
                          className={r.nv.thin ? 'text-amber-700' : 'text-slate-800'}
                          title={
                            `${r.nv.installs} install · ${r.nv.payingShops} shop trả tiền · net ${Math.round(r.nv.netValue)}` +
                            (r.nv.topCountry
                              ? ` · ${r.nv.topCountry} chiếm ${(r.nv.topCountryShare * 100).toFixed(0)}% (${r.nv.countries} nước)`
                              : '') +
                            (r.nv.largestShopOrders !== null
                              ? ` · shop lớn nhất ${r.nv.largestShopOrders} đơn/30d`
                              : '') +
                            (r.nv.thin ? ` — ${r.nv.thinReason}` : '')
                          }
                        >
                          ${r.nv.netPerInstall.toFixed(0)}
                          {r.nv.thin && <span className="ml-0.5 text-[9px]">mỏng</span>}
                        </span>
                      )}
                    </td>
                    <CeilingCells ceil={r.ceil} />
                    <CampCell
                      camps={r.camps}
                      manual={r.inPaidSource === 'manual'}
                      negative={r.inPaidSource === 'negative'}
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
                    {/* Note keyword dùng chung với Paid Coverage / trend sheet: khoá
                        chuẩn hoá, đọc dự phòng khoá tên thô. Xem lib/store/keywordNotes.ts. */}
                    <NoteCell scope={KEYWORD_NOTE_SCOPE} noteId={keywordNoteKeys(r.term).id} fallbackKeys={keywordNoteKeys(r.term).legacy} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            Rule lọc chạy trên <b>{window}</b> · Org install = số install organic trong {window} · pos = avg position · <b>pos L30</b> = vị trí trung bình 30 ngày gần nhất (chỉ để tham khảo, không ảnh hưởng rule) · Org CR = install organic ÷ users organic (CR cao = tiềm năng convert tốt, đáng tăng bid) · Paid share = paid ÷ (organic + paid) · <b>Trần bid</b> = mỗi camp một dòng, trung bình theo nước camp target của min(giá trị install paid × 90% × CR used, Tier ceil), cùng mốc &quot;bid cho phép&quot; của Overbid; ⛔ = có nước bị trần tier chặn · <b>Bid đang set</b> = bid của keyword trong camp đó (Master KW Lookup), nhãn so trần của chính camp; camp vượt trần xếp trước · <b>click cột để sort</b> · mặc định sắp theo nhu cầu organic mà paid đang bỏ lỡ
          </div>
        </div>
      )}
    </div>
  );
}
