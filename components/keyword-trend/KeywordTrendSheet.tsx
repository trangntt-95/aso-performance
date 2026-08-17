'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { TrendChart } from './TrendChart';
import { BidImpactChart } from './BidImpactChart';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { normKw } from '@/lib/sheets/kwNorm';
import { KeywordOriginBlock } from './KeywordOriginBlock';
import { useKeywordTrendStore } from '@/lib/store/keywordTrendStore';
import { useStatusStore } from '@/lib/store/statusStore';
import { useNotesStore, noteKeyOf } from '@/lib/store/notesStore';
import { keywordPaidShare, summarizeImpact, type ImpactPoint } from '@/lib/market/noteImpact';
import type {
  ActionQueueRow,
  HistoryRow,
  KeywordRow,
  SheetPayload,
  SnapshotRow,
} from '@/lib/sheets/types';
import { formatDeltaPct, formatNumber, formatPercent, formatPos, deltaTone } from '@/lib/utils/format';
import { shouldShowTranslation } from '@/lib/utils/translation';
import { cn } from '@/lib/utils';
import { Leaf, DollarSign, ArrowUpDown, ArrowDown, ArrowUp, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

function summarise(rows: KeywordRow[]) {
  if (rows.length === 0) return null;
  const totalUsers = rows.reduce((s, r) => s + r.usersL, 0);
  const totalGetApp = rows.reduce((s, r) => s + r.getAppL, 0);
  const cr = totalUsers > 0 ? totalGetApp / totalUsers : 0;
  const posValues = rows.map((r) => r.posL).filter((v): v is number => v !== null);
  const avgPos = posValues.length > 0 ? posValues.reduce((s, v) => s + v, 0) / posValues.length : null;
  return { totalUsers, totalGetApp, cr, avgPos, count: rows.length };
}

type DrillWindow = 'L7' | 'L30' | 'L90';

const COUNTRY_TAB: Record<DrillWindow, keyof SheetPayload> = {
  L7: 'countryL7',
  L30: 'countryL30',
  L90: 'countryL90',
};

interface CountryRow {
  country: string;
  organicUsers: number;
  organicGetApp: number;
  organicCr: number;
  organicPos: number | null;
  organicDeltaUsersPct: number | null;
  paidUsers: number;
  paidGetApp: number;
  paidCr: number;
  paidPos: number | null;
  paidDeltaUsersPct: number | null;
  totalUsers: number;
  totalGetApp: number;
}

function aggregateByCountry(
  data: SheetPayload | undefined,
  keyword: string | null,
  window: DrillWindow,
  surfaceFilter: 'all' | 'organic' | 'paid',
): CountryRow[] {
  if (!data || !keyword) return [];
  const kwLower = keyword.toLowerCase();
  const rows = (data[COUNTRY_TAB[window]] as KeywordRow[]).filter(
    (r) => r.searchTerm.toLowerCase() === kwLower && r.country,
  );
  const map = new Map<string, CountryRow>();
  for (const r of rows) {
    const country = r.country ?? '(global)';
    let bucket = map.get(country);
    if (!bucket) {
      bucket = {
        country,
        organicUsers: 0, organicGetApp: 0, organicCr: 0, organicPos: null, organicDeltaUsersPct: null,
        paidUsers: 0, paidGetApp: 0, paidCr: 0, paidPos: null, paidDeltaUsersPct: null,
        totalUsers: 0, totalGetApp: 0,
      };
      map.set(country, bucket);
    }
    if (r.surface === 'search_ad') {
      bucket.paidUsers += r.usersL;
      bucket.paidGetApp += r.getAppL;
      bucket.paidCr = bucket.paidUsers > 0 ? bucket.paidGetApp / bucket.paidUsers : 0;
      bucket.paidPos = r.posL;
      bucket.paidDeltaUsersPct = r.deltaUsersPct;
    } else {
      bucket.organicUsers += r.usersL;
      bucket.organicGetApp += r.getAppL;
      bucket.organicCr = bucket.organicUsers > 0 ? bucket.organicGetApp / bucket.organicUsers : 0;
      bucket.organicPos = r.posL;
      bucket.organicDeltaUsersPct = r.deltaUsersPct;
    }
    bucket.totalUsers += r.usersL;
    bucket.totalGetApp += r.getAppL;
  }
  let result = Array.from(map.values());
  if (surfaceFilter === 'organic') {
    result = result.filter((c) => c.organicUsers > 0);
  } else if (surfaceFilter === 'paid') {
    result = result.filter((c) => c.paidUsers > 0);
  }
  result.sort((a, b) => {
    const aSort = surfaceFilter === 'paid' ? a.paidUsers : surfaceFilter === 'organic' ? a.organicUsers : a.totalUsers;
    const bSort = surfaceFilter === 'paid' ? b.paidUsers : surfaceFilter === 'organic' ? b.organicUsers : b.totalUsers;
    return bSort - aSort;
  });
  return result;
}

type ChannelView = 'all' | 'organic' | 'paid';
type SortKey = 'country' | 'users' | 'installs' | 'cr' | 'pos' | 'delta';

interface ViewRow {
  country: string;
  users: number;
  installs: number;
  cr: number;
  pos: number | null;
  deltaUsersPct: number | null;
}

function projectRow(c: CountryRow, view: ChannelView): ViewRow {
  if (view === 'organic') {
    return {
      country: c.country,
      users: c.organicUsers,
      installs: c.organicGetApp,
      cr: c.organicCr,
      pos: c.organicPos,
      deltaUsersPct: c.organicDeltaUsersPct,
    };
  }
  if (view === 'paid') {
    return {
      country: c.country,
      users: c.paidUsers,
      installs: c.paidGetApp,
      cr: c.paidCr,
      pos: c.paidPos,
      deltaUsersPct: c.paidDeltaUsersPct,
    };
  }
  // all = combined
  const totalUsers = c.totalUsers;
  const totalInstalls = c.totalGetApp;
  // Weighted average pos by users (more useful than simple avg).
  const orgWeight = c.organicUsers;
  const paidWeight = c.paidUsers;
  const weight = orgWeight + paidWeight;
  const pos =
    weight > 0
      ? ((c.organicPos ?? 0) * orgWeight + (c.paidPos ?? 0) * paidWeight) / weight
      : null;
  // Weighted delta% by prior users… we don't have prior totals; fall back to weighted by current users.
  const orgD = c.organicDeltaUsersPct;
  const paidD = c.paidDeltaUsersPct;
  let combinedDelta: number | null = null;
  if (orgD !== null && paidD !== null) {
    combinedDelta = (orgD * orgWeight + paidD * paidWeight) / Math.max(1, weight);
  } else {
    combinedDelta = orgD ?? paidD;
  }
  return {
    country: c.country,
    users: totalUsers,
    installs: totalInstalls,
    cr: totalUsers > 0 ? totalInstalls / totalUsers : 0,
    pos: pos !== null && isFinite(pos) && pos > 0 ? pos : null,
    deltaUsersPct: combinedDelta,
  };
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'right',
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  const Icon = !active ? ArrowUpDown : dir === 'desc' ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium hover:text-slate-900 transition',
        active ? 'text-slate-900' : 'text-slate-500',
        align === 'right' && 'ml-auto',
      )}
    >
      <span>{label}</span>
      <Icon className="h-2.5 w-2.5" />
    </button>
  );
}

// One before→after tile in the bid-impact panel. betterWhenHigher flips the
// colour: paid share / users are good when they rise, position when it falls.
function ImpactTile({
  label,
  before,
  after,
  betterWhenHigher,
  fmt,
}: {
  label: string;
  before: number | null;
  after: number | null;
  betterWhenHigher: boolean;
  fmt: (v: number | null) => string;
}) {
  const delta = before != null && after != null ? after - before : null;
  const improved = delta == null || Math.abs(delta) < 1e-9 ? null : betterWhenHigher ? delta > 0 : delta < 0;
  const tone = improved == null ? 'text-slate-400' : improved ? 'text-emerald-600' : 'text-rose-600';
  return (
    <div className="border rounded p-2 bg-white space-y-0.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="font-mono text-[12px]">
        <span className="text-slate-500">{fmt(before)}</span>
        <span className={cn('mx-1', tone)}>→</span>
        <span className={cn('font-semibold', tone)}>{fmt(after)}</span>
      </div>
    </div>
  );
}

const fmtShare = (v: number | null): string => (v == null ? '—' : `${Math.round(v * 100)}%`);

export function KeywordTrendSheet() {
  const { open, keyword, country, surface, close } = useKeywordTrendStore();
  const { data } = useSheetData();
  const notes = useStatusStore((s) => s.notes);
  const setNote = useStatusStore((s) => s.setNote);

  // Underbid note + timestamp (server-side App_Notes) → drives the bid-impact
  // panel. Ensure they're loaded even if the sheet is opened from a page that
  // hasn't already fetched them.
  const loadNotes = useNotesStore((s) => s.load);
  const notesLoaded = useNotesStore((s) => s.loaded);
  useEffect(() => {
    if (!notesLoaded) loadNotes();
  }, [notesLoaded, loadNotes]);
  const ubNoteKey = keyword ? noteKeyOf('underbid', keyword) : '';
  const ubNote = useNotesStore((s) => (ubNoteKey ? s.notes[ubNoteKey] : undefined));
  const ubNoteAt = useNotesStore((s) => (ubNoteKey ? s.updatedAt[ubNoteKey] : undefined));

  const bidImpact = useMemo(() => {
    if (!keyword || !data || !ubNoteAt) return null;
    const at = new Date(ubNoteAt).getTime();
    if (!Number.isFinite(at)) return null;
    const pts: ImpactPoint[] = keywordPaidShare(data.historyDaily ?? [], keyword);
    return summarizeImpact(pts, at);
  }, [keyword, data, ubNoteAt]);
  const [drillWindow, setDrillWindow] = useState<DrillWindow>('L7');
  const [channelView, setChannelView] = useState<ChannelView>('all');
  const [countrySearch, setCountrySearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('users');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Resizable width (px), persisted to localStorage.
  const SHEET_WIDTH_KEY = 'asoKeywordSheetWidthV1';
  const DEFAULT_WIDTH = 820;
  const MIN_WIDTH = 480;
  const [sheetWidth, setSheetWidth] = useState<number>(DEFAULT_WIDTH);
  const [widthHydrated, setWidthHydrated] = useState(false);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(SHEET_WIDTH_KEY);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= MIN_WIDTH) {
          setSheetWidth(Math.min(n, window.innerWidth - 32));
        }
      }
    } catch {
      // ignore
    }
    setWidthHydrated(true);
  }, []);

  useEffect(() => {
    if (!widthHydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SHEET_WIDTH_KEY, String(sheetWidth));
    } catch {
      // ignore
    }
  }, [sheetWidth, widthHydrated]);

  const startSheetResize = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startW: sheetWidth };
    const onMove = (ev: globalThis.MouseEvent) => {
      const st = resizeRef.current;
      if (!st) return;
      // Sheet anchored on the right → drag left makes it wider.
      const dx = st.startX - ev.clientX;
      const maxW = window.innerWidth - 32;
      setSheetWidth(Math.max(MIN_WIDTH, Math.min(maxW, st.startW + dx)));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const countryBreakdown = useMemo(
    () => aggregateByCountry(data, keyword, drillWindow, surface),
    [data, keyword, drillWindow, surface],
  );

  const tableRows = useMemo(() => {
    const projected = countryBreakdown.map((c) => projectRow(c, channelView));
    const q = countrySearch.trim().toLowerCase();
    const filtered = q ? projected.filter((r) => r.country.toLowerCase().includes(q)) : projected;
    const cmp = (a: ViewRow, b: ViewRow): number => {
      if (sortKey === 'country') return a.country.localeCompare(b.country);
      if (sortKey === 'pos') {
        // null pos sorts to the end
        const av = a.pos ?? Number.MAX_VALUE;
        const bv = b.pos ?? Number.MAX_VALUE;
        return av - bv;
      }
      if (sortKey === 'delta') {
        const av = a.deltaUsersPct ?? -Infinity;
        const bv = b.deltaUsersPct ?? -Infinity;
        return av - bv;
      }
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return av - bv;
    };
    filtered.sort((a, b) => (sortDir === 'desc' ? -cmp(a, b) : cmp(a, b)));
    return filtered;
  }, [countryBreakdown, channelView, countrySearch, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(k);
      // numeric defaults to desc, country to asc
      setSortDir(k === 'country' ? 'asc' : 'desc');
    }
  };

  /**
   * Everything known about this keyword over the whole record, so clicking it
   * answers "how has this done overall" before the per-window detail.
   *
   * Two sources, deliberately shown side by side rather than merged:
   *  - All_L365: the sheet's own 365-day snapshot per keyword × surface.
   *  - History_Daily: the day-by-day series, which reaches further back than
   *    365 days for some keywords and is what the charts below are drawn from.
   * They rarely agree exactly (GA4 withholds low-volume rows differently at each
   * grain), so presenting one as "the" total would be a false precision.
   */
  const allTime = useMemo(() => {
    if (!keyword || !data) return null;
    // "Toàn thời gian" reports organic AND paid side by side, so it must not be
    // narrowed by the surface the panel was opened with — opening from Underbid
    // (paid) would otherwise zero the organic column of a keyword that has one.
    const kwKey = normKw(keyword);

    let orgUsers = 0, orgInstall = 0, paidUsers = 0, paidInstall = 0;
    let posSum = 0, posWeight = 0;
    for (const r of (data.allL365 ?? []) as SnapshotRow[]) {
      if (normKw(r.searchTerm) !== kwKey) continue;
      if (r.surface === 'search_ad') {
        paidUsers += r.users;
        paidInstall += r.getApp;
      } else {
        orgUsers += r.users;
        orgInstall += r.getApp;
      }
      if (r.pos !== null && r.users > 0) {
        posSum += r.pos * r.users;
        posWeight += r.users;
      }
    }

    // Day-by-day span. Only the TRUE per-day column can be summed across days —
    // the L7D rolling one would multiply everything by roughly seven.
    let dailyUsers = 0, dailyInstall = 0;
    const days = new Set<string>();
    let first = '', last = '';
    for (const r of data.historyDaily ?? []) {
      if (normKw(r.searchTerm) !== kwKey) continue;
      const iso = typeof r.snapshotDate === 'number'
        ? new Date(Date.UTC(1899, 11, 30) + r.snapshotDate * 86400000).toISOString().slice(0, 10)
        : String(r.snapshotDate).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
      if (!first || iso < first) first = iso;
      if (!last || iso > last) last = iso;
      if (r.usersDaily === null) continue;
      dailyUsers += r.usersDaily;
      dailyInstall += r.getAppDaily ?? 0;
      days.add(iso);
    }

    const totalUsers = orgUsers + paidUsers;
    const totalInstall = orgInstall + paidInstall;
    if (totalUsers === 0 && dailyUsers === 0 && !first) return null;
    return {
      orgUsers, orgInstall, paidUsers, paidInstall,
      totalUsers, totalInstall,
      cr: totalUsers > 0 ? totalInstall / totalUsers : null,
      pos: posWeight > 0 ? posSum / posWeight : null,
      paidShare: totalUsers > 0 ? paidUsers / totalUsers : null,
      dailyUsers, dailyInstall,
      dailyDays: days.size,
      first, last,
    };
  }, [keyword, data, surface]);

  const trendData = useMemo(() => {
    if (!keyword || !data) return null;
    const surfaceTarget =
      surface === 'paid' ? 'search_ad' : surface === 'organic' ? 'search' : null;
    const kwKey = normKw(keyword);
    const matchKw = (r: { searchTerm: string }) => normKw(r.searchTerm) === kwKey;
    const matchSurface = (r: { surface: string }) =>
      surfaceTarget ? r.surface === surfaceTarget : true;
    const matchCountry = (r: { country?: string }) => (country ? r.country === country : true);

    // Trend series: keyword only, BOTH surfaces. The charts plot organic and
    // paid as separate lines, so surface-filtering here would erase one line and
    // blank the chart entirely for keywords with no paid history (219 of 649
    // paid keywords have no History row on either surface at all).
    const history: HistoryRow[] = data.history.filter(matchKw);
    // Install trend comes from History_Daily (getAppL7D). It has no country column,
    // so this series is global per keyword — same as the users/pos trend above.
    const historyDaily = (data.historyDaily ?? []).filter(matchKw);

    // When country filter is active, prefer Country_L_* (those have the country column).
    const pickL = (allTab: KeywordRow[], countryTab: KeywordRow[]) =>
      country
        ? countryTab.filter((r) => matchKw(r) && matchSurface(r) && matchCountry(r))
        : allTab.filter((r) => matchKw(r) && matchSurface(r));

    const inL7 = pickL(data.allL7, data.countryL7);
    const inL30 = pickL(data.allL30, data.countryL30);
    const inL90 = pickL(data.allL90, data.countryL90);

    const actionRows: ActionQueueRow[] = data.actionQueue.filter((r) => {
      if (normKw(r.keyword) !== kwKey) return false;
      if (country && r.country !== country) return false;
      if (surface !== 'all' && r.surface !== surface) return false;
      return true;
    });

    return {
      history,
      historyDaily,
      l7: summarise(inL7),
      l30: summarise(inL30),
      l90: summarise(inL90),
      meta: inL7[0] ?? inL30[0] ?? inL90[0] ?? null,
      actionRows,
    };
  }, [keyword, country, surface, data]);

  const noteKey = keyword ? `keyword::${keyword}` : '';
  const currentNote = noteKey ? notes[noteKey] ?? '' : '';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent
        side="right"
        className="overflow-y-auto p-6"
        style={{ width: `${sheetWidth}px`, maxWidth: 'calc(100vw - 2rem)' }}
      >
        {/* Resize handle on the left edge */}
        <div
          onMouseDown={startSheetResize}
          title="Kéo để chỉnh độ rộng"
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-400/40 active:bg-indigo-500/60 z-20 transition-colors"
        />
        <SheetHeader>
          <SheetTitle className="font-mono break-all text-base">{keyword}</SheetTitle>
          <SheetDescription>
            {[
              country ? `Country: ${country}` : 'All countries',
              surface === 'all' ? 'all surfaces' : surface,
            ].join(' · ')}
          </SheetDescription>
        </SheetHeader>

        {!trendData && (
          <div className="py-10 text-sm text-slate-500">Loading…</div>
        )}

        {trendData && (
          <div className="mt-4 space-y-5">
            {trendData.meta && (
              <div className="flex flex-wrap gap-3 text-[12px] text-slate-600">
                {trendData.meta.category && (
                  <span><span className="font-semibold">Category:</span> {trendData.meta.category}</span>
                )}
                {shouldShowTranslation(keyword, trendData.meta.english, trendData.meta.category) && (
                  <span><span className="font-semibold">EN:</span> {trendData.meta.english}</span>
                )}
                {trendData.meta.lang && (
                  <span><span className="font-semibold">Lang:</span> {trendData.meta.lang}</span>
                )}
              </div>
            )}

            {allTime && (
              <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Toàn thời gian
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ['Users', formatNumber(allTime.totalUsers), `Organic ${formatNumber(allTime.orgUsers)} · Paid ${formatNumber(allTime.paidUsers)}`],
                    ['Install', formatNumber(allTime.totalInstall), `Organic ${formatNumber(allTime.orgInstall)} · Paid ${formatNumber(allTime.paidInstall)}`],
                    ['CR', allTime.cr === null ? '—' : formatPercent(allTime.cr), 'install / users'],
                    ['Pos (organic+paid)', allTime.pos === null ? '—' : allTime.pos.toFixed(2), 'bình quân theo users'],
                  ] as const).map(([label, value, hint]) => (
                    <div key={label} className="rounded border border-slate-200 bg-white p-2">
                      <div className="text-[10px] text-slate-500">{label}</div>
                      <div className="font-mono text-sm font-semibold text-slate-900">{value}</div>
                      <div className="text-[9px] text-slate-400">{hint}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] leading-snug text-slate-500">
                  Số trên lấy từ <code className="text-[9px]">All_L365</code> (ảnh chụp 365 ngày).
                  {allTime.paidShare !== null && (
                    <> Paid chiếm <b>{formatPercent(allTime.paidShare)}</b> lượng users.</>
                  )}
                  {allTime.first && (
                    <>
                      {' '}Lịch sử theo ngày có từ <b>{allTime.first}</b> đến <b>{allTime.last}</b>
                      {allTime.dailyDays > 0 ? (
                        <>
                          {' '}— cộng {allTime.dailyDays} ngày có số thật được{' '}
                          <b>{formatNumber(allTime.dailyUsers)}</b> users /{' '}
                          <b>{formatNumber(allTime.dailyInstall)}</b> install.
                        </>
                      ) : (
                        <> — nhưng chưa ngày nào có số per-day nên không cộng dồn được.</>
                      )}
                    </>
                  )}
                  {' '}Hai nguồn không khớp tuyệt đối vì GA4 ẩn dòng volume thấp khác nhau ở mỗi độ mịn.
                </div>
              </section>
            )}

            {bidImpact && (
              <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] uppercase tracking-wide font-semibold text-amber-700">
                    💡 Impact bid (sau note)
                  </h3>
                  {ubNoteAt && (
                    <span className="text-[10px] text-slate-500">
                      note {new Date(ubNoteAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
                {ubNote && ubNote.trim() && (
                  <div className="text-[11px] italic text-slate-600 whitespace-pre-line">“{ubNote.trim()}”</div>
                )}
                {bidImpact.status === 'measured' ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <ImpactTile
                        label="Paid share"
                        before={bidImpact.before?.paidShare ?? null}
                        after={bidImpact.after?.paidShare ?? null}
                        betterWhenHigher
                        fmt={fmtShare}
                      />
                      <ImpactTile
                        label="Paid pos"
                        before={bidImpact.before?.paidPos ?? null}
                        after={bidImpact.after?.paidPos ?? null}
                        betterWhenHigher={false}
                        fmt={formatPos}
                      />
                      <ImpactTile
                        label="Paid users"
                        before={bidImpact.before?.paidUsers ?? null}
                        after={bidImpact.after?.paidUsers ?? null}
                        betterWhenHigher
                        fmt={(v) => (v == null ? '—' : formatNumber(v, { compact: true }))}
                      />
                    </div>
                    <BidImpactChart points={bidImpact.points} noteAt={bidImpact.noteAt} />
                    <p className="text-[10px] text-slate-500">
                      Baseline trước note vs ~{bidImpact.spanDays} ngày sau. Paid share ↑ = bid đang hứng thêm nhu cầu
                      organic (đúng mục tiêu underbid). Đo <b>kết quả</b>, không xác thực số bid trong note.
                    </p>
                  </>
                ) : bidImpact.status === 'too-recent' ? (
                  <div className="text-[12px] text-slate-500">
                    ⏳ Mới note gần đây — chờ đủ ~10 ngày dữ liệu sau note để đo tác động.
                  </div>
                ) : bidImpact.status === 'no-paid-yet' ? (
                  <>
                    {bidImpact.before?.paidShare != null && (
                      <div className="text-[12px] text-slate-600">
                        Paid share trước note: <b>{fmtShare(bidImpact.before.paidShare)}</b>
                      </div>
                    )}
                    <div className="text-[12px] text-amber-700">
                      ⚠️ Đã đủ thời gian sau note nhưng <b>chưa ghi nhận paid traffic</b> — tăng bid chưa tạo ra
                      hiển thị paid. Cân nhắc tăng mạnh hơn, kiểm tra match type, hoặc keyword này khó cạnh tranh.
                    </div>
                    <BidImpactChart points={bidImpact.points} noteAt={bidImpact.noteAt} />
                  </>
                ) : (
                  <div className="text-[12px] text-slate-500">
                    Keyword này chưa có lịch sử paid trong History_Daily để đo.
                  </div>
                )}
              </section>
            )}

            {trendData.history.length === 0 && trendData.historyDaily.length === 0 && (
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600">
                Keyword này <b>chưa có dòng nào trong History / History_Daily</b> — nên ba biểu đồ bên dưới trống.
                Không phải lỗi dashboard: GA4 giấu bớt hàng ở mức ngày với keyword lượng thấp, nên keyword chỉ xuất
                hiện ở cửa sổ dài (L365) thường không có chuỗi theo ngày. Số ở phần <b>Toàn thời gian</b> và{' '}
                <b>Snapshot</b> phía dưới vẫn đúng.
              </div>
            )}

            {/* Nguồn Install, thu hẹp về đúng keyword này. */}
            {keyword && <KeywordOriginBlock keyword={keyword} />}

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                Install trend (L7D, attributed)
              </h3>
              <TrendChart
                history={trendData.history}
                dailyHistory={trendData.historyDaily}
                metric="getApp"
              />
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
                <div className="flex gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-0.5 bg-emerald-600" />
                    Organic
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-0.5 bg-amber-700" />
                    Paid
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">Install gán theo keyword (tool ASO) · từ ~20/05</span>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                90-day Users trend (L7D sliding)
              </h3>
              <TrendChart history={trendData.history} metric="users" />
              <div className="flex gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-0.5 bg-emerald-600" />
                  Organic
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-0.5 bg-amber-700" />
                  Paid
                </span>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                Position trend (lower = better)
              </h3>
              <TrendChart history={trendData.history} metric="pos" />
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                Snapshot · current windows{country ? ` (${country})` : ''}
                {surface !== 'all' ? ` · ${surface}` : ''}
              </h3>
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                {[
                  { label: 'L7', s: trendData.l7 },
                  { label: 'L30', s: trendData.l30 },
                  { label: 'L90', s: trendData.l90 },
                ].map(({ label, s }) => (
                  <div key={label} className="border rounded p-2 space-y-0.5">
                    <div className="font-mono text-[10px] text-slate-500">{label}</div>
                    {s ? (
                      <>
                        <div>Users: <b>{formatNumber(s.totalUsers, { compact: true })}</b></div>
                        <div>Install: <b>{formatNumber(s.totalGetApp, { compact: true })}</b></div>
                        <div>CR: <b>{formatPercent(s.cr)}</b></div>
                        <div>Pos: <b>{formatPos(s.avgPos)}</b></div>
                      </>
                    ) : (
                      <div className="text-slate-400">No data</div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                  By country
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[10px]">
                    {(['L7', 'L30', 'L90'] as const).map((w, i) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setDrillWindow(w)}
                        className={cn(
                          'px-2 py-0.5 font-medium transition',
                          i > 0 && 'border-l border-slate-200',
                          drillWindow === w ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                  <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[10px]">
                    {(
                      [
                        { v: 'all', label: 'All', Icon: null },
                        { v: 'organic', label: 'Organic', Icon: Leaf },
                        { v: 'paid', label: 'Paid', Icon: DollarSign },
                      ] as const
                    ).map(({ v, label, Icon }, i) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setChannelView(v)}
                        className={cn(
                          'px-2 py-0.5 font-medium transition inline-flex items-center gap-0.5',
                          i > 0 && 'border-l border-slate-200',
                          channelView === v
                            ? v === 'organic'
                              ? 'bg-emerald-600 text-white'
                              : v === 'paid'
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {Icon && <Icon className="h-2.5 w-2.5" />}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                <Input
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  placeholder="Filter country…"
                  className="pl-6 h-7 text-[12px]"
                />
              </div>

              {tableRows.length === 0 ? (
                <div className="text-[12px] text-slate-500 italic py-4 text-center border rounded">
                  {countryBreakdown.length === 0
                    ? `Keyword này chưa có dữ liệu theo country ở ${drillWindow}.`
                    : 'Không có country nào khớp filter.'}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full text-[12px] tabular-nums">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-2.5 py-1.5 border-b border-slate-200">
                            <SortHeader
                              label="Country"
                              active={sortKey === 'country'}
                              dir={sortDir}
                              onClick={() => toggleSort('country')}
                              align="left"
                            />
                          </th>
                          <th className="text-right px-2 py-1.5 border-b border-slate-200">
                            <SortHeader
                              label="Users"
                              active={sortKey === 'users'}
                              dir={sortDir}
                              onClick={() => toggleSort('users')}
                            />
                          </th>
                          <th className="text-right px-2 py-1.5 border-b border-slate-200">
                            <SortHeader
                              label="Install"
                              active={sortKey === 'installs'}
                              dir={sortDir}
                              onClick={() => toggleSort('installs')}
                            />
                          </th>
                          <th className="text-right px-2 py-1.5 border-b border-slate-200">
                            <SortHeader
                              label="CR"
                              active={sortKey === 'cr'}
                              dir={sortDir}
                              onClick={() => toggleSort('cr')}
                            />
                          </th>
                          <th className="text-right px-2 py-1.5 border-b border-slate-200">
                            <SortHeader
                              label="Rank"
                              active={sortKey === 'pos'}
                              dir={sortDir}
                              onClick={() => toggleSort('pos')}
                            />
                          </th>
                          <th className="text-right px-2 py-1.5 border-b border-slate-200">
                            <SortHeader
                              label="Δ Users"
                              active={sortKey === 'delta'}
                              dir={sortDir}
                              onClick={() => toggleSort('delta')}
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tableRows.map((r) => {
                          const t = r.deltaUsersPct !== null ? deltaTone(r.deltaUsersPct) : 'flat';
                          const deltaCls =
                            t === 'pos'
                              ? 'text-emerald-700'
                              : t === 'neg'
                              ? 'text-rose-700'
                              : 'text-slate-500';
                          const empty = r.users === 0 && r.installs === 0;
                          return (
                            <tr
                              key={r.country}
                              className={cn('hover:bg-slate-50', empty && 'opacity-50')}
                            >
                              <td className="px-2.5 py-1 text-left max-w-[140px]">
                                <div className="truncate font-medium text-slate-800" title={r.country}>
                                  {r.country}
                                </div>
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {empty ? '—' : formatNumber(r.users, { compact: true })}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {empty ? '—' : formatNumber(r.installs, { compact: true })}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {empty ? '—' : formatPercent(r.cr)}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {r.pos === null ? '—' : formatPos(r.pos)}
                              </td>
                              <td className={cn('px-2 py-1 text-right font-mono font-medium', deltaCls)}>
                                {r.deltaUsersPct === null ? '—' : formatDeltaPct(r.deltaUsersPct)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[10px] text-slate-400 px-2.5 py-1 bg-slate-50 border-t">
                    {tableRows.length} country
                    {countryBreakdown.length !== tableRows.length
                      ? ` / ${countryBreakdown.length} total`
                      : ''}
                    · view: <b>{channelView}</b> · {drillWindow}
                  </div>
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">Personal note</h3>
              <textarea
                value={currentNote}
                onChange={(e) => setNote(noteKey, e.target.value)}
                placeholder="e.g. tested broad match Q2, paused due to low CR"
                rows={3}
                className="w-full border rounded p-2 text-sm resize-y"
              />
              <p className="text-[10px] text-slate-400">Saved locally in your browser only.</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
