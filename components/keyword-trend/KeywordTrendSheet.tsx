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
import { useSheetData } from '@/lib/hooks/useSheetData';
import { useKeywordTrendStore } from '@/lib/store/keywordTrendStore';
import { useStatusStore } from '@/lib/store/statusStore';
import type { ActionQueueRow, HistoryRow, KeywordRow, SheetPayload } from '@/lib/sheets/types';
import { formatDeltaPct, formatNumber, formatPercent, formatPos, deltaTone } from '@/lib/utils/format';
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
  const rows = (data[COUNTRY_TAB[window]] as KeywordRow[]).filter(
    (r) => r.searchTerm === keyword && r.country,
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

export function KeywordTrendSheet() {
  const { open, keyword, country, surface, close } = useKeywordTrendStore();
  const { data } = useSheetData();
  const notes = useStatusStore((s) => s.notes);
  const setNote = useStatusStore((s) => s.setNote);
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

  const trendData = useMemo(() => {
    if (!keyword || !data) return null;
    const surfaceTarget =
      surface === 'paid' ? 'search_ad' : surface === 'organic' ? 'search' : null;
    const matchKw = (r: { searchTerm: string }) => r.searchTerm === keyword;
    const matchSurface = (r: { surface: string }) =>
      surfaceTarget ? r.surface === surfaceTarget : true;
    const matchCountry = (r: { country?: string }) => (country ? r.country === country : true);

    const history: HistoryRow[] = data.history.filter((h) => matchKw(h) && matchSurface(h));

    // When country filter is active, prefer Country_L_* (those have the country column).
    const pickL = (allTab: KeywordRow[], countryTab: KeywordRow[]) =>
      country
        ? countryTab.filter((r) => matchKw(r) && matchSurface(r) && matchCountry(r))
        : allTab.filter((r) => matchKw(r) && matchSurface(r));

    const inL7 = pickL(data.allL7, data.countryL7);
    const inL30 = pickL(data.allL30, data.countryL30);
    const inL90 = pickL(data.allL90, data.countryL90);

    const actionRows: ActionQueueRow[] = data.actionQueue.filter((r) => {
      if (r.keyword !== keyword) return false;
      if (country && r.country !== country) return false;
      if (surface !== 'all' && r.surface !== surface) return false;
      return true;
    });

    return {
      history,
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
                {trendData.meta.english && trendData.meta.english !== keyword && (
                  <span><span className="font-semibold">EN:</span> {trendData.meta.english}</span>
                )}
                {trendData.meta.lang && (
                  <span><span className="font-semibold">Lang:</span> {trendData.meta.lang}</span>
                )}
              </div>
            )}

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
                        <div>GetApp: <b>{formatNumber(s.totalGetApp, { compact: true })}</b></div>
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
