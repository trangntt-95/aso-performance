'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ArrowRight, AlertCircle, Check, Link2, Megaphone, Target, Users } from 'lucide-react';
import { expectedAdsInstalls, runrateAdsToMonthEnd } from '@/lib/config/ads-targets';
import { AdsTargetTile } from './AdsTargetTile';
import { useSheetData } from '@/lib/hooks/useSheetData';
import {
  computeKpis,
  marketTrajectory,
  channelSplit,
  topCountriesFor,
  categoryShareFor,
  topVolumeMovers,
  topContributors,
  channelSnapshotForWindow,
  channelSnapshotForRange,
  dailyTrend,
  availableDailyDates,
  kpisForRange,
  topContributorsForRange,
  categoryShareForRange,
  windowDays,
  type OverviewWindow,
  type SurfaceFocus,
} from './aggregate';
import { KpiTile } from './KpiTile';
import { WindowSelector } from './WindowSelector';
import { DownloadMenu } from '@/components/shared/DownloadMenu';
import { buildOverviewSheets } from '@/lib/export/overviewExport';
import { ChannelMixCards } from './ChannelMixCards';
import { MarketTrajectoryChart } from './MarketTrajectoryChart';
import { ChannelSplitChart } from './ChannelSplitChart';
import { DailyTrendChart } from './DailyTrendChart';
import { TopCountriesChart } from './TopCountriesChart';
import { CategoryShareDonut } from './CategoryShareDonut';
import { TopVolumeMovers } from './TopVolumeMovers';
import { TopContributors } from './TopContributors';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, formatPercent, composeVerdict, verdictBadgeStyle } from '@/lib/utils/format';
import { useCategoryDetailStore } from '@/lib/store/categoryDetailStore';
import { useDashboardContext } from '@/lib/store/dashboardContextStore';
import { cn } from '@/lib/utils';

function CopyLinkButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Copy link tới mục này (giữ filter hiện tại)"
      className="shrink-0 text-slate-400 hover:text-indigo-600 transition"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function SectionCard({
  title,
  hint,
  cta,
  href,
  anchorId,
  highlighted,
  onCopyLink,
  copied,
  children,
}: {
  title: string;
  hint?: string;
  cta?: string;
  href?: string;
  anchorId?: string;
  highlighted?: boolean;
  onCopyLink?: () => void;
  copied?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      id={anchorId}
      className={cn(
        'border-slate-200 shadow-sm scroll-mt-24 transition-shadow',
        highlighted && 'ring-2 ring-indigo-400 ring-offset-2',
      )}
    >
      <CardHeader className="pb-2 flex-row flex items-end justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
          {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cta && href && (
            <Link
              href={href}
              className="text-[11px] text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5"
            >
              {cta}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {onCopyLink && <CopyLinkButton onClick={onCopyLink} copied={!!copied} />}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

interface OverviewProps {
  embedded?: boolean;
}

export function OverviewDashboard({ embedded = false }: OverviewProps = {}) {
  const { data, isLoading, error } = useSheetData();

  // ── Deep-link URL state: hydrate initial state from ?query (embedded view ignores it) ──
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initParam = (key: string) => (embedded ? null : searchParams.get(key));

  const [window, setWindow] = useState<OverviewWindow>(() => {
    const w = initParam('window');
    return (['L3', 'L7', 'L14', 'L30', 'L90'] as const).includes(w as OverviewWindow)
      ? (w as OverviewWindow)
      : 'L7';
  });
  const [surfaceFocus, setSurfaceFocus] = useState<SurfaceFocus>(() => {
    const s = initParam('surface');
    return s === 'organic' || s === 'paid' ? s : 'all';
  });
  const [countryFocus, setCountryFocus] = useState<string | null>(() => initParam('country'));
  const [keywordFocus, setKeywordFocus] = useState<string | null>(() => initParam('keyword'));
  const [categoryFocus, setCategoryFocus] = useState<string | null>(() => initParam('category'));
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(() => {
    const from = initParam('from');
    const to = initParam('to');
    return from && to && from <= to ? { from, to } : null;
  });
  const [rangeFrom, setRangeFrom] = useState(() => initParam('from') ?? '');
  const [rangeTo, setRangeTo] = useState(() => initParam('to') ?? '');
  const [splitMetric, setSplitMetric] = useState<'users' | 'getapp' | 'cr'>(() => {
    const m = initParam('metric');
    return m === 'getapp' || m === 'cr' ? m : 'users';
  });
  // Section to scroll to + briefly highlight (consumed once on mount).
  const [focusTarget] = useState<string | null>(() => initParam('focus'));
  const [highlightKey, setHighlightKey] = useState<string | null>(() => initParam('focus'));
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const inDateMode = !!dateRange;
  const isSingleDay = !!dateRange && dateRange.from === dateRange.to;

  // Apply from/to inputs → range (both set & ordered). Empty both = clear.
  const applyRange = (f: string, t: string) => {
    if (f && t && f <= t) setDateRange({ from: f, to: t });
    else if (!f && !t) setDateRange(null);
  };
  const clearDateRange = () => {
    setDateRange(null);
    setRangeFrom('');
    setRangeTo('');
  };
  // Clicking a day in the chart → single-day range (syncs the inputs too).
  const pinSingleDay = (iso: string | null) => {
    if (!iso) {
      clearDateRange();
      return;
    }
    setDateRange({ from: iso, to: iso });
    setRangeFrom(iso);
    setRangeTo(iso);
  };
  // Selecting a window exits date mode (inputs then prefill to that window's range).
  const handleWindowChange = (w: OverviewWindow) => {
    setWindow(w);
    setDateRange(null);
  };

  const filters = useMemo(
    () => ({
      surface: surfaceFocus,
      country: countryFocus,
      keyword: keywordFocus,
      category: categoryFocus,
    }),
    [surfaceFocus, countryFocus, keywordFocus, categoryFocus],
  );

  const kpis = useMemo(() => computeKpis(data, window, filters), [data, window, filters]);
  const trajectory = useMemo(() => marketTrajectory(data, filters), [data, filters]);
  const split = useMemo(() => channelSplit(data), [data]);
  const topCountries = useMemo(
    () => topCountriesFor(data, window, 55, filters),
    [data, window, filters],
  );
  const dailyTrendData = useMemo(() => dailyTrend(data, filters), [data, filters]);
  const categoryShares = useMemo(
    () => categoryShareFor(data, window, filters),
    [data, window, filters],
  );
  const organicMovers = useMemo(
    () =>
      topVolumeMovers(data, window, {
        limit: 8,
        country: filters.country,
        keyword: filters.keyword,
        category: filters.category,
        surface: 'organic',
      }),
    [data, window, filters.country, filters.keyword, filters.category],
  );
  const paidMovers = useMemo(
    () =>
      topVolumeMovers(data, window, {
        limit: 8,
        country: filters.country,
        keyword: filters.keyword,
        category: filters.category,
        surface: 'paid',
      }),
    [data, window, filters.country, filters.keyword, filters.category],
  );
  const topUsers = useMemo(
    () => topContributors(data, window, 'users', 50, filters),
    [data, window, filters],
  );
  const topGetApp = useMemo(
    () => topContributors(data, window, 'getApp', 50, filters),
    [data, window, filters],
  );
  const channelSnapshot = useMemo(
    () => channelSnapshotForWindow(data, window, filters),
    [data, window, filters],
  );

  // ── Date mode (per-day / per-range snapshot from History_Daily) ──
  const availableDates = useMemo(() => availableDailyDates(data, filters), [data, filters]);
  const minDate = availableDates[0];
  const maxDate = availableDates[availableDates.length - 1];
  const dateKpi = useMemo(
    () => (dateRange ? kpisForRange(data, dateRange.from, dateRange.to, filters) : null),
    [data, dateRange, filters],
  );
  const dateTopUsers = useMemo(
    () => (dateRange ? topContributorsForRange(data, dateRange.from, dateRange.to, 'users', 50, filters) : null),
    [data, dateRange, filters],
  );
  const dateTopGetApp = useMemo(
    () => (dateRange ? topContributorsForRange(data, dateRange.from, dateRange.to, 'getApp', 50, filters) : null),
    [data, dateRange, filters],
  );
  const dateCategoryShares = useMemo(
    () => (dateRange ? categoryShareForRange(data, dateRange.from, dateRange.to, filters) : []),
    [data, dateRange, filters],
  );
  const channelSnapshotDate = useMemo(
    () => (dateRange ? channelSnapshotForRange(data, dateRange.from, dateRange.to, filters) : null),
    [data, dateRange, filters],
  );
  // Channel mix uses date-scoped data in date mode (History_Daily has surface).
  const channelMixSnapshot = inDateMode ? channelSnapshotDate : channelSnapshot;
  // Note appended to window-based sections that can't be date-scoped.
  const winNote = inDateMode ? ` · ⚠️ theo window ${window}, chưa lọc ngày` : '';
  const dateLabel = dateRange ? (isSingleDay ? dateRange.from : `${dateRange.from} → ${dateRange.to}`) : '';

  const openCategoryDetail = useCategoryDetailStore((s) => s.openCategory);

  // Expose the current view to the AI assistant (ChatWidget reads this store).
  const setDashboardContext = useDashboardContext((s) => s.setContext);
  const clearDashboardContext = useDashboardContext((s) => s.clearContext);
  useEffect(() => {
    setDashboardContext({
      page: 'Overview',
      window,
      surface: surfaceFocus,
      country: countryFocus ?? undefined,
      keyword: keywordFocus ?? undefined,
      category: categoryFocus ?? undefined,
      date: dateRange ? dateLabel : undefined,
    });
    return () => clearDashboardContext();
  }, [
    setDashboardContext,
    clearDashboardContext,
    window,
    surfaceFocus,
    countryFocus,
    keywordFocus,
    categoryFocus,
    dateRange,
    dateLabel,
  ]);

  // Prefill the From→To inputs with the active window's actual report range.
  // Display only — does NOT activate date mode until the user edits a field.
  useEffect(() => {
    if (inDateMode) return;
    const wd = data?.windowDates?.[window];
    if (wd) {
      setRangeFrom(wd.from);
      setRangeTo(wd.to);
    }
  }, [window, data?.windowDates, inDateMode]);

  // Build a shareable query string from the current view (optionally focusing a section).
  const buildQuery = useCallback(
    (focusKey?: string) => {
      const p = new URLSearchParams();
      if (window !== 'L7') p.set('window', window);
      if (surfaceFocus !== 'all') p.set('surface', surfaceFocus);
      if (countryFocus) p.set('country', countryFocus);
      if (keywordFocus) p.set('keyword', keywordFocus);
      if (categoryFocus) p.set('category', categoryFocus);
      if (dateRange) {
        p.set('from', dateRange.from);
        p.set('to', dateRange.to);
      }
      if (splitMetric !== 'users') p.set('metric', splitMetric);
      if (focusKey) p.set('focus', focusKey);
      return p.toString();
    },
    [window, surfaceFocus, countryFocus, keywordFocus, categoryFocus, dateRange, splitMetric],
  );

  // Full URL-state sync: write the view back to the URL on every change (drops ?focus once consumed).
  useEffect(() => {
    if (embedded) return;
    const qs = buildQuery();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [embedded, buildQuery, pathname, router]);

  // Deep-link focus: scroll to + briefly ring the requested section once data is in.
  useEffect(() => {
    if (!focusTarget || isLoading) return;
    const el = document.getElementById(`sec-${focusTarget}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightKey(focusTarget);
    const t = setTimeout(() => setHighlightKey(null), 2600);
    return () => clearTimeout(t);
  }, [focusTarget, isLoading]);

  const copyLink = useCallback(
    (focusKey: string) => {
      const origin = globalThis.location?.origin ?? '';
      const qs = buildQuery(focusKey);
      void navigator.clipboard?.writeText(`${origin}${pathname}${qs ? `?${qs}` : ''}`);
      setCopiedKey(focusKey);
      setTimeout(() => setCopiedKey((k) => (k === focusKey ? null : k)), 1500);
    },
    [buildQuery, pathname],
  );

  const headlineWindow = data?.marketIndex.summary.find((s) => s.window === window);
  const composedVerdict = headlineWindow
    ? composeVerdict(headlineWindow.deltaWeightedPct, kpis.usersDeltaPct)
    : null;
  const verdictS = composedVerdict ? verdictBadgeStyle(composedVerdict) : null;
  const days = windowDays(window);
  const adsTargetExpected = useMemo(() => expectedAdsInstalls(days), [days]);
  const adsTargetPct = useMemo(() => {
    if (!channelSnapshot || !adsTargetExpected || adsTargetExpected <= 0) return null;
    return channelSnapshot.paidGetApp / adsTargetExpected;
  }, [channelSnapshot, adsTargetExpected]);
  const adsRunrate = useMemo(() => {
    if (!channelSnapshot) return null;
    return runrateAdsToMonthEnd(days, channelSnapshot.paidGetApp);
  }, [channelSnapshot, days]);
  const totalCr = useMemo(() => {
    if (!kpis.usersL) return null;
    return kpis.getAppL / kpis.usersL;
  }, [kpis]);
  const totalCrPrior = useMemo(() => {
    if (!channelSnapshot) return null;
    let u: number;
    let g: number;
    if (surfaceFocus === 'organic') {
      u = channelSnapshot.organicUsersPrior;
      g = channelSnapshot.organicGetAppPrior;
    } else if (surfaceFocus === 'paid') {
      u = channelSnapshot.paidUsersPrior;
      g = channelSnapshot.paidGetAppPrior;
    } else {
      u = channelSnapshot.paidUsersPrior + channelSnapshot.organicUsersPrior;
      g = channelSnapshot.paidGetAppPrior + channelSnapshot.organicGetAppPrior;
    }
    return u > 0 ? g / u : null;
  }, [channelSnapshot, surfaceFocus]);

  // KPI values switch source in date mode (per-day) vs window mode (rolling L).
  const dispUsers = inDateMode ? dateKpi?.usersL ?? 0 : kpis.usersL;
  const dispUsersDelta = inDateMode ? dateKpi?.usersDeltaPct ?? null : kpis.usersDeltaPct;
  const dispGetApp = inDateMode ? dateKpi?.getAppL ?? 0 : kpis.getAppL;
  const dispGetAppDelta = inDateMode ? dateKpi?.getAppDeltaPct ?? null : kpis.getAppDeltaPct;
  const dispCr = inDateMode ? dateKpi?.cr ?? null : totalCr;
  const dispCrDelta = inDateMode
    ? null
    : totalCr !== null && totalCrPrior !== null && totalCrPrior > 0
    ? totalCr / totalCrPrior - 1
    : null;
  const kpiHelper = inDateMode ? 'vs kỳ trước cùng độ dài' : `vs prior ${days}d`;
  const kpiSuffix = inDateMode ? dateLabel : window;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <div className="font-semibold">Couldn’t load dashboard data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Market overview · last {days} day{days === 1 ? '' : 's'}
            </h1>
            {composedVerdict && verdictS && (
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-md text-xs',
                  verdictS.bg,
                  verdictS.text,
                  verdictS.bold && 'font-bold',
                )}
                title="Core = position-weighted basket · Total = raw user count"
              >
                {composedVerdict.label}
              </span>
            )}
            {surfaceFocus !== 'all' && (
              <button
                type="button"
                onClick={() => setSurfaceFocus('all')}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition',
                  surfaceFocus === 'organic'
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200',
                )}
                title="Click to clear surface filter"
              >
                {surfaceFocus === 'organic' ? 'Organic' : 'Paid'} <span className="text-slate-500">✕</span>
              </button>
            )}
            {countryFocus && (
              <button
                type="button"
                onClick={() => setCountryFocus(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-100 text-sky-800 hover:bg-sky-200 transition"
                title="Click to clear country filter"
              >
                {countryFocus} <span className="text-slate-500">✕</span>
              </button>
            )}
            {keywordFocus && (
              <button
                type="button"
                onClick={() => setKeywordFocus(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-violet-100 text-violet-800 hover:bg-violet-200 transition max-w-[240px]"
                title="Click to clear keyword filter"
              >
                <span className="truncate">{keywordFocus}</span> <span className="text-slate-500 shrink-0">✕</span>
              </button>
            )}
            {categoryFocus && (
              <button
                type="button"
                onClick={() => setCategoryFocus(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition"
                title="Click to clear category filter"
              >
                {categoryFocus} <span className="text-slate-500">✕</span>
              </button>
            )}
            {dateRange && (
              <button
                type="button"
                onClick={clearDateRange}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-100 text-rose-800 hover:bg-rose-200 transition"
                title="Click to exit date mode"
              >
                📅 {dateLabel} <span className="text-slate-500">✕</span>
              </button>
            )}
            {(surfaceFocus !== 'all' || countryFocus || keywordFocus || categoryFocus || dateRange) && (
              <button
                type="button"
                onClick={() => {
                  setSurfaceFocus('all');
                  setCountryFocus(null);
                  setKeywordFocus(null);
                  setCategoryFocus(null);
                  clearDateRange();
                }}
                className="text-[11px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex items-start gap-2">
            {!embedded && (
              <DownloadMenu
                getSheets={() => buildOverviewSheets(data, { window, filters, dateRange })}
                filename={`aso-overview-${inDateMode ? dateLabel : window}`}
              />
            )}
            <div className="flex flex-col items-end gap-1.5">
              <WindowSelector value={window} onChange={handleWindowChange} />
            <div
              className={cn(
                'flex items-center gap-1 text-[11px] rounded-md border px-2 py-1',
                inDateMode ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white',
              )}
            >
              <span className="text-slate-500">{inDateMode ? 'Lọc ngày:' : 'Ngày (theo report):'}</span>
              <input
                type="date"
                value={rangeFrom}
                min={minDate}
                max={maxDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setRangeFrom(v);
                  applyRange(v, rangeTo);
                }}
                className="rounded border border-slate-200 px-1 py-0.5 text-[11px] text-slate-700"
                title={minDate ? `Có data từ ${minDate} đến ${maxDate}` : 'Chưa có data per-ngày'}
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom || minDate}
                max={maxDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setRangeTo(v);
                  applyRange(rangeFrom, v);
                }}
                className="rounded border border-slate-200 px-1 py-0.5 text-[11px] text-slate-700"
              />
              {dateRange && (
                <button
                  type="button"
                  onClick={clearDateRange}
                  className="ml-0.5 text-slate-400 hover:text-slate-700"
                  title="Thoát lọc ngày (về theo window)"
                >
                  ✕
                </button>
              )}
            </div>
            </div>
          </div>
        </div>
      </header>

      <section
        id="sec-kpis"
        className={cn(
          'grid grid-cols-2 lg:grid-cols-4 gap-3 scroll-mt-24 rounded-xl transition-shadow',
          highlightKey === 'kpis' && 'ring-2 ring-indigo-400 ring-offset-2',
        )}
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KpiTile
              label={`Users · ${kpiSuffix}`}
              value={formatNumber(dispUsers, { compact: true })}
              deltaPct={dispUsersDelta}
              helper={kpiHelper}
              Icon={Users}
            />
            <KpiTile
              label={`Install · ${kpiSuffix}`}
              value={dispGetApp !== null ? formatNumber(dispGetApp, { compact: true }) : '—'}
              deltaPct={dispGetAppDelta}
              helper={inDateMode ? 'per-day · vs kỳ trước' : kpiHelper}
              Icon={Target}
            />
            <KpiTile
              label={`CR Total · ${kpiSuffix}`}
              value={dispCr !== null ? formatPercent(dispCr) : '—'}
              deltaPct={dispCrDelta}
              helper={inDateMode ? 'install / users (kỳ này)' : `paid + organic · vs prior ${days}d`}
              Icon={Megaphone}
            />
            <AdsTargetTile
              label={inDateMode ? `Ads target · ${window} (window)` : `Ads target · ${window}`}
              pct={surfaceFocus === 'organic' ? null : adsTargetPct}
              actual={surfaceFocus === 'organic' ? 0 : channelSnapshot?.paidGetApp ?? 0}
              expected={surfaceFocus === 'organic' ? null : adsTargetExpected}
              runratePct={
                window !== 'L30' && window !== 'L90'
                  ? undefined
                  : surfaceFocus === 'organic'
                  ? null
                  : adsRunrate?.pct ?? null
              }
              runrateTooltip={
                adsRunrate
                  ? adsRunrate.mode === 'direct'
                    ? `Actual ${Math.round(adsRunrate.projectedInstalls)} / target L90 ${Math.round(adsRunrate.targetInstalls)} (tổng 3 tháng)`
                    : `Pace = ${channelSnapshot?.paidGetApp ?? 0} / ${adsRunrate.effectiveDays}d → project ${Math.round(adsRunrate.projectedInstalls)} / ${Math.round(adsRunrate.targetInstalls)} EOM`
                  : undefined
              }
            />
          </>
        )}
      </section>

      <section
        id="sec-channel-mix"
        className={cn(
          'space-y-2 scroll-mt-24 rounded-xl transition-shadow',
          highlightKey === 'channel-mix' && 'ring-2 ring-indigo-400 ring-offset-2',
        )}
      >
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Channel mix · {kpiSuffix}</h2>
            <p className="text-[11px] text-slate-500">
              Click a card to filter the whole page by that surface.
            </p>
          </div>
          {!embedded && (
            <CopyLinkButton onClick={() => copyLink('channel-mix')} copied={copiedKey === 'channel-mix'} />
          )}
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <ChannelMixCards
            snapshot={channelMixSnapshot}
            windowLabel={kpiSuffix}
            activeFocus={surfaceFocus}
            onSelect={setSurfaceFocus}
          />
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title="Market Performance · all windows"
          hint={`Click a window to focus the whole page.${winNote}`}
          cta={embedded ? undefined : 'Drill into Market Index'}
          href={embedded ? undefined : '/market-index'}
          anchorId="sec-market-performance"
          highlighted={highlightKey === 'market-performance'}
          onCopyLink={embedded ? undefined : () => copyLink('market-performance')}
          copied={copiedKey === 'market-performance'}
        >
            {isLoading ? (
              <Skeleton className="h-56" />
            ) : (
              <MarketTrajectoryChart
                data={trajectory}
                metric="usersDelta"
                activeWindow={window}
                onWindowClick={(w) => {
                  if (['L3', 'L7', 'L14', 'L30', 'L90'].includes(w)) {
                    setWindow(w as OverviewWindow);
                  }
                }}
              />
            )}
          </SectionCard>
          <SectionCard
            title="Channel split · all windows"
            hint={
              splitMetric === 'cr'
                ? `Organic CR vs Paid CR (install/users) theo từng window.${winNote}`
                : `Organic vs Paid share by ${splitMetric === 'users' ? 'Users' : 'Install'} across windows.${winNote}`
            }
            anchorId="sec-channel-split"
            highlighted={highlightKey === 'channel-split'}
            onCopyLink={embedded ? undefined : () => copyLink('channel-split')}
            copied={copiedKey === 'channel-split'}
          >
            <div className="mb-2 flex justify-end">
              <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setSplitMetric('users')}
                  className={cn(
                    'px-2.5 py-1 font-medium transition',
                    splitMetric === 'users'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  Users
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMetric('getapp')}
                  className={cn(
                    'px-2.5 py-1 font-medium transition border-l border-slate-200',
                    splitMetric === 'getapp'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  Install
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMetric('cr')}
                  className={cn(
                    'px-2.5 py-1 font-medium transition border-l border-slate-200',
                    splitMetric === 'cr'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  CR
                </button>
              </div>
            </div>
            {isLoading ? <Skeleton className="h-56" /> : <ChannelSplitChart data={split} metric={splitMetric} />}
          </SectionCard>
        </section>

      <SectionCard
        title="Daily trend (rolling 7 ngày)"
        hint="Users / Install / CR — mỗi điểm là tổng/giá trị rolling 7 ngày (đồng nhất, hết spike). Click 1 ngày để lọc."
        anchorId="sec-daily-trend"
        highlighted={highlightKey === 'daily-trend'}
        onCopyLink={embedded ? undefined : () => copyLink('daily-trend')}
        copied={copiedKey === 'daily-trend'}
      >
        {isLoading ? (
          <Skeleton className="h-56" />
        ) : (
          <DailyTrendChart
            data={dailyTrendData}
            lastNDays={days}
            countryFilter={countryFocus}
            keywordFilter={keywordFocus}
            selectedFrom={dateRange?.from ?? null}
            selectedTo={dateRange?.to ?? null}
            onDateSelect={pinSingleDay}
          />
        )}
      </SectionCard>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title={`Top countries · ${window}`}
          hint={`Click a country to filter the whole page.${winNote}`}
          anchorId="sec-top-countries"
          highlighted={highlightKey === 'top-countries'}
          onCopyLink={embedded ? undefined : () => copyLink('top-countries')}
          copied={copiedKey === 'top-countries'}
        >
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : topCountries.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No country data.</div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <TopCountriesChart
                data={topCountries}
                activeCountry={countryFocus}
                onCountryClick={(c) => setCountryFocus(countryFocus === c ? null : c)}
                height={Math.max(280, topCountries.length * 22)}
              />
            </div>
          )}
        </SectionCard>
        <SectionCard
          title={`Category share · ${kpiSuffix}`}
          hint={
            inDateMode
              ? 'Theo ngày đã ghim. Category suy ra từ keyword (data per-ngày không có cột category).'
              : 'Toggle Users / Install at the top right. Click a slice to filter the whole page + open details.'
          }
          anchorId="sec-category-share"
          highlighted={highlightKey === 'category-share'}
          onCopyLink={embedded ? undefined : () => copyLink('category-share')}
          copied={copiedKey === 'category-share'}
        >
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (inDateMode ? dateCategoryShares : categoryShares).length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No category data.</div>
          ) : (
            <CategoryShareDonut
              data={(inDateMode ? dateCategoryShares : categoryShares).slice(0, 8)}
              activeCategory={categoryFocus}
              onCategoryClick={(c) => {
                const next = categoryFocus === c ? null : c;
                setCategoryFocus(next);
                // In date mode the detail sheet (rolling-window scoped) would
                // contradict the per-day view, so only set the filter.
                if (next && !inDateMode) {
                  openCategoryDetail(c, window, {
                    country: countryFocus,
                    surface: surfaceFocus,
                  });
                }
              }}
            />
          )}
        </SectionCard>
      </section>

      <SectionCard
        title={`Top contribution · ${kpiSuffix}`}
        hint={
          inDateMode
            ? `Top keywords theo ${isSingleDay ? 'ngày' : 'khoảng'} đã chọn (per-day). Không có Δ.`
            : 'Top keywords by absolute Users and Installs, with share %.'
        }
        anchorId="sec-top-contribution"
        highlighted={highlightKey === 'top-contribution'}
        onCopyLink={embedded ? undefined : () => copyLink('top-contribution')}
        copied={copiedKey === 'top-contribution'}
      >
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        ) : (
          <TopContributors
            users={(inDateMode ? dateTopUsers : topUsers)?.rows ?? []}
            getApp={(inDateMode ? dateTopGetApp : topGetApp)?.rows ?? []}
            totalUsers={(inDateMode ? dateTopUsers : topUsers)?.total ?? 0}
            totalGetApp={(inDateMode ? dateTopGetApp : topGetApp)?.total ?? 0}
            activeKeyword={keywordFocus}
            activeSurface={surfaceFocus}
            activeCountry={countryFocus}
            onRowClick={(k) => setKeywordFocus(keywordFocus === k ? null : k)}
            onKeywordSelect={(k) => setKeywordFocus(k)}
          />
        )}
      </SectionCard>

      <SectionCard
        title={`Top volume movers · ${window}`}
        hint={`Keywords with the biggest |Δ users %|. VN + IN excluded.${winNote}`}
        anchorId="sec-volume-movers"
        highlighted={highlightKey === 'volume-movers'}
        onCopyLink={embedded ? undefined : () => copyLink('volume-movers')}
        copied={copiedKey === 'volume-movers'}
      >
        {isLoading ? (
          <Skeleton className="h-72" />
        ) : (
          <TopVolumeMovers
            organic={organicMovers}
            paid={paidMovers}
            activeKeyword={keywordFocus}
            activeSurface={surfaceFocus}
            activeCountry={countryFocus}
            onRowClick={(k) => setKeywordFocus(keywordFocus === k ? null : k)}
          />
        )}
      </SectionCard>
    </div>
  );
}
