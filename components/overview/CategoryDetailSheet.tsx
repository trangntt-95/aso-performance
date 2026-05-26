'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  Leaf,
  DollarSign,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { useCategoryDetailStore } from '@/lib/store/categoryDetailStore';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { categoryStyle } from '@/lib/utils/colors';
import { formatNumber, formatPercent, formatPos, formatDeltaPct, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { Category, KeywordRow, SheetPayload } from '@/lib/sheets/types';

type DrillWindow = 'L7' | 'L30' | 'L90';

const ALL_TAB: Record<DrillWindow, keyof SheetPayload> = {
  L7: 'allL7',
  L30: 'allL30',
  L90: 'allL90',
};

type ChannelView = 'all' | 'organic' | 'paid';
type SortKey = 'keyword' | 'users' | 'installs' | 'cr' | 'pos' | 'delta';

function deltaRel(latest: number, prior: number): number {
  if (!prior) return 0;
  return (latest - prior) / Math.abs(prior);
}

function Pill({ value }: { value: number }) {
  const t = deltaTone(value);
  const Arrow = t === 'pos' ? ArrowUp : t === 'neg' ? ArrowDown : ArrowRight;
  const cls = t === 'pos' ? 'text-emerald-700' : t === 'neg' ? 'text-rose-700' : 'text-slate-500';
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium', cls)}>
      <Arrow className="h-3 w-3" />
      {formatDeltaPct(value)}
    </span>
  );
}

function ChannelBlock({
  label,
  Icon,
  iconCls,
  rows,
  selected,
  onClick,
}: {
  label: string;
  Icon: typeof Leaf;
  iconCls: string;
  rows: KeywordRow[];
  selected: boolean;
  onClick: () => void;
}) {
  const usersL = rows.reduce((s, r) => s + r.usersL, 0);
  const usersP = rows.reduce((s, r) => s + r.usersP, 0);
  const getAppL = rows.reduce((s, r) => s + r.getAppL, 0);
  const getAppP = rows.reduce((s, r) => s + r.getAppP, 0);
  const cr = usersL > 0 ? getAppL / usersL : 0;
  const crP = usersP > 0 ? getAppP / usersP : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-white p-3.5 text-left w-full transition',
        selected ? 'border-slate-900 ring-2 ring-slate-900/10 shadow-sm' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className={cn('h-6 w-6 rounded-md grid place-items-center', iconCls)}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-sm font-semibold">{label}</span>
        <span className="ml-auto text-[10px] text-slate-500">{rows.length} kw</span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Users</dt>
          <dd className="text-base font-semibold tabular-nums">{formatNumber(usersL, { compact: true })}</dd>
          <Pill value={deltaRel(usersL, usersP)} />
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Install</dt>
          <dd className="text-base font-semibold tabular-nums">{formatNumber(getAppL, { compact: true })}</dd>
          <Pill value={deltaRel(getAppL, getAppP)} />
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">CR</dt>
          <dd className="text-base font-semibold tabular-nums">{formatPercent(cr)}</dd>
          <Pill value={deltaRel(cr, crP)} />
        </div>
      </dl>
      <div className="mt-2 text-[10px] text-slate-400">
        {selected ? 'Đang lọc keyword theo channel này · click lại để bỏ' : 'Click để lọc keyword chỉ channel này'}
      </div>
    </button>
  );
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

export function CategoryDetailSheet() {
  const { open, category, window: w, close } = useCategoryDetailStore();
  const { data } = useSheetData();
  const [channelFilter, setChannelFilter] = useState<ChannelView>('all');
  const [drillWindow, setDrillWindow] = useState<DrillWindow>('L7');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('users');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Resizable width persisted to localStorage.
  const SHEET_WIDTH_KEY = 'asoCategorySheetWidthV1';
  const DEFAULT_WIDTH = 820;
  const MIN_WIDTH = 480;
  const [sheetWidth, setSheetWidth] = useState<number>(DEFAULT_WIDTH);
  const [widthHydrated, setWidthHydrated] = useState(false);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    setChannelFilter('all');
    setSearch('');
  }, [category, open]);

  // Sync drillWindow with the window the user clicked from on the overview.
  useEffect(() => {
    if (open && (w === 'L7' || w === 'L30' || w === 'L90')) {
      setDrillWindow(w);
    } else if (open) {
      setDrillWindow('L7');
    }
  }, [w, open]);

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

  const detail = useMemo(() => {
    if (!data || !category) return null;
    const tabKey = ALL_TAB[drillWindow];
    const allRows = (data[tabKey] as KeywordRow[]).filter((r) => r.category === category);
    const organic = allRows.filter((r) => r.surface !== 'search_ad');
    const paid = allRows.filter((r) => r.surface === 'search_ad');
    const totalUsers = (data[tabKey] as KeywordRow[]).reduce((s, r) => s + r.usersL, 0);
    const totalGetApp = (data[tabKey] as KeywordRow[]).reduce((s, r) => s + r.getAppL, 0);
    const myUsers = allRows.reduce((s, r) => s + r.usersL, 0);
    const myGetApp = allRows.reduce((s, r) => s + r.getAppL, 0);
    return {
      allRows,
      organic,
      paid,
      myUsers,
      myGetApp,
      shareUsers: totalUsers > 0 ? myUsers / totalUsers : 0,
      shareGetApp: totalGetApp > 0 ? myGetApp / totalGetApp : 0,
    };
  }, [data, category, drillWindow]);

  const tableRows = useMemo(() => {
    if (!detail) return [];
    let rows = detail.allRows;
    if (channelFilter === 'organic') rows = detail.organic;
    if (channelFilter === 'paid') rows = detail.paid;

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.searchTerm.toLowerCase().includes(q) ||
          (r.english && r.english.toLowerCase().includes(q)),
      );
    }

    const cmp = (a: KeywordRow, b: KeywordRow): number => {
      if (sortKey === 'keyword') return a.searchTerm.localeCompare(b.searchTerm);
      if (sortKey === 'pos') {
        const av = a.posL ?? Number.MAX_VALUE;
        const bv = b.posL ?? Number.MAX_VALUE;
        return av - bv;
      }
      if (sortKey === 'delta') {
        const av = a.deltaUsersPct ?? -Infinity;
        const bv = b.deltaUsersPct ?? -Infinity;
        return av - bv;
      }
      if (sortKey === 'users') return a.usersL - b.usersL;
      if (sortKey === 'installs') return a.getAppL - b.getAppL;
      if (sortKey === 'cr') return (a.crL ?? 0) - (b.crL ?? 0);
      return 0;
    };
    return [...rows].sort((a, b) => (sortDir === 'desc' ? -cmp(a, b) : cmp(a, b))).slice(0, 200);
  }, [detail, channelFilter, search, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(k);
      setSortDir(k === 'keyword' ? 'asc' : 'desc');
    }
  };

  const styleObj = category ? categoryStyle(category as Category) : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent
        side="right"
        className="overflow-y-auto p-6"
        style={{ width: `${sheetWidth}px`, maxWidth: 'calc(100vw - 2rem)' }}
      >
        {/* Resize handle on left edge */}
        <div
          onMouseDown={startSheetResize}
          title="Kéo để chỉnh độ rộng"
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-400/40 active:bg-indigo-500/60 z-20 transition-colors"
        />

        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-indigo-600" />
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-sm',
                styleObj?.bg,
                styleObj?.text,
              )}
            >
              <span>{styleObj?.emoji}</span>
              {category}
            </span>
          </SheetTitle>
          <SheetDescription>
            Last {Number(drillWindow.slice(1))} days · breakdown by channel and keywords
          </SheetDescription>
        </SheetHeader>

        {!detail && <div className="py-10 text-sm text-slate-500">Loading…</div>}

        {detail && (
          <div className="mt-4 space-y-5">
            {/* Window selector */}
            <div className="flex items-center justify-end">
              <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
                {(['L7', 'L30', 'L90'] as const).map((wk, i) => (
                  <button
                    key={wk}
                    type="button"
                    onClick={() => setDrillWindow(wk)}
                    className={cn(
                      'px-2.5 py-1 font-medium transition',
                      i > 0 && 'border-l border-slate-200',
                      drillWindow === wk
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {wk}
                  </button>
                ))}
              </div>
            </div>

            <section className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Total this category · {drillWindow}
              </div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <div>
                  <span className="text-xl font-semibold tabular-nums">
                    {formatNumber(detail.myUsers, { compact: true })}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-500">users</span>
                  <span className="ml-2 text-[11px] text-slate-400">
                    {formatPercent(detail.shareUsers)} share
                  </span>
                </div>
                <div>
                  <span className="text-xl font-semibold tabular-nums">
                    {formatNumber(detail.myGetApp, { compact: true })}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-500">installs</span>
                  <span className="ml-2 text-[11px] text-slate-400">
                    {formatPercent(detail.shareGetApp)} share
                  </span>
                </div>
                <div className="ml-auto text-[10px] text-slate-500">
                  {detail.allRows.length} keyword × surface
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ChannelBlock
                label="Organic"
                Icon={Leaf}
                iconCls="bg-emerald-100 text-emerald-700"
                rows={detail.organic}
                selected={channelFilter === 'organic'}
                onClick={() => setChannelFilter((c) => (c === 'organic' ? 'all' : 'organic'))}
              />
              <ChannelBlock
                label="Paid"
                Icon={DollarSign}
                iconCls="bg-amber-100 text-amber-700"
                rows={detail.paid}
                selected={channelFilter === 'paid'}
                onClick={() => setChannelFilter((c) => (c === 'paid' ? 'all' : 'paid'))}
              />
            </section>

            <Separator />

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                  Keywords trong category
                </h3>
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
                      onClick={() => setChannelFilter(v)}
                      className={cn(
                        'px-2 py-0.5 font-medium transition inline-flex items-center gap-0.5',
                        i > 0 && 'border-l border-slate-200',
                        channelFilter === v
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

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter keyword…"
                  className="pl-6 h-7 text-[12px]"
                />
              </div>

              {tableRows.length === 0 ? (
                <div className="text-[12px] text-slate-500 italic py-4 text-center border rounded">
                  Không có keyword khớp filter.
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[460px] overflow-auto">
                    <table className="w-full text-[12px] tabular-nums">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-2.5 py-1.5 border-b border-slate-200">
                            <SortHeader
                              label="Keyword"
                              active={sortKey === 'keyword'}
                              dir={sortDir}
                              onClick={() => toggleSort('keyword')}
                              align="left"
                            />
                          </th>
                          <th className="text-center px-2 py-1.5 border-b border-slate-200">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                              Channel
                            </span>
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
                        {tableRows.map((r, i) => {
                          const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
                          const surfaceCls =
                            surface === 'paid'
                              ? 'text-amber-700 bg-amber-50'
                              : 'text-emerald-700 bg-emerald-50';
                          const t = deltaTone(r.deltaUsersPct);
                          const deltaCls =
                            t === 'pos'
                              ? 'text-emerald-700'
                              : t === 'neg'
                              ? 'text-rose-700'
                              : 'text-slate-500';
                          return (
                            <tr key={`${r.searchTerm}-${r.surface}-${i}`} className="hover:bg-slate-50">
                              <td className="px-2.5 py-1 text-left max-w-[220px]">
                                <KeywordLink
                                  keyword={r.searchTerm}
                                  surface={surface}
                                  className="font-medium text-slate-800 truncate inline-block max-w-full"
                                />
                              </td>
                              <td className="px-2 py-1 text-center">
                                <span className={cn('inline-block px-1.5 rounded text-[10px] font-medium', surfaceCls)}>
                                  {surface}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {formatNumber(r.usersL, { compact: true })}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {formatNumber(r.getAppL, { compact: true })}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {r.crL !== null ? formatPercent(r.crL) : '—'}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {r.posL === null ? '—' : formatPos(r.posL)}
                              </td>
                              <td className={cn('px-2 py-1 text-right font-mono font-medium', deltaCls)}>
                                {formatDeltaPct(r.deltaUsersPct)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[10px] text-slate-400 px-2.5 py-1 bg-slate-50 border-t">
                    {tableRows.length} keyword
                    {detail.allRows.length !== tableRows.length
                      ? ` / ${detail.allRows.length} total`
                      : ''}
                    · view: <b>{channelFilter}</b> · {drillWindow}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
