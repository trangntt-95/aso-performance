'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, AlertCircle, Megaphone, Target, Users } from 'lucide-react';
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

function SectionCard({
  title,
  hint,
  cta,
  href,
  children,
}: {
  title: string;
  hint?: string;
  cta?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex-row flex items-end justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
          {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
        </div>
        {cta && href && (
          <Link
            href={href}
            className="text-[11px] text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5 shrink-0"
          >
            {cta}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
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
  const [window, setWindow] = useState<OverviewWindow>('L7');
  const [surfaceFocus, setSurfaceFocus] = useState<SurfaceFocus>('all');
  const [countryFocus, setCountryFocus] = useState<string | null>(null);
  const [keywordFocus, setKeywordFocus] = useState<string | null>(null);
  const [categoryFocus, setCategoryFocus] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [splitMetric, setSplitMetric] = useState<'users' | 'getapp'>('users');
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
  const rangeDays = dateRange
    ? Math.round((Date.parse(dateRange.to) - Date.parse(dateRange.from)) / 86400000) + 1
    : 0;

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

      {inDateMode && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 flex items-start gap-1.5">
          <span>
            📅 <b>Date mode</b> · {isSingleDay ? 'ngày' : `${rangeDays} ngày`} <b>{dateLabel}</b> — KPIs ·
            Channel mix · Top KW · Category <b>theo ngày</b>. Country &amp; so-sánh-window vẫn là snapshot{' '}
            <b>{window}</b> (xem badge).
          </span>
          <span
            className="shrink-0 mt-px cursor-help inline-flex h-4 w-4 items-center justify-center rounded-full border border-rose-300 text-[10px] font-bold text-rose-500"
            title={
              `Vì sao chia 2 nhóm:\n` +
              `History_Daily (nguồn per-ngày) KHÔNG có cột country và KHÔNG có so sánh giữa các window.\n\n` +
              `• Theo ngày được: KPIs, Channel mix (có surface), Top contribution (có keyword), Category share.\n` +
              `• Vẫn theo window ${window}: Market Performance, Channel split, Top countries, Volume movers, Ads target.` +
              (!isSingleDay
                ? `\n\nKhoảng nhiều ngày chỉ cộng cột per-ngày thật (usersDaily/getAppDaily). ` +
                  `Ngày chỉ có L7D rolling bị bỏ (tránh đếm trùng ~7×) — backfill per-ngày hiện chỉ tới ~26/05.`
                : '')
            }
          >
            i
          </span>
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <section className="space-y-2">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Channel mix · {kpiSuffix}</h2>
            <p className="text-[11px] text-slate-500">
              Click a card to filter the whole page by that surface.
            </p>
          </div>
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
            title="Channel split % · all windows"
            hint={`Organic vs Paid share by ${splitMetric === 'users' ? 'Users' : 'Install'} across windows.${winNote}`}
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
              </div>
            </div>
            {isLoading ? <Skeleton className="h-56" /> : <ChannelSplitChart data={split} metric={splitMetric} />}
          </SectionCard>
        </section>

      <SectionCard
        title="Daily trend (rolling 7 ngày)"
        hint="Users / Install / CR — mỗi điểm là tổng/giá trị rolling 7 ngày (đồng nhất, hết spike). Click 1 ngày để lọc."
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
