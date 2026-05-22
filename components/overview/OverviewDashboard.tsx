'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
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
  dailyTrend,
  windowDays,
  type OverviewWindow,
  type SurfaceFocus,
} from './aggregate';
import { KpiTile } from './KpiTile';
import { WindowSelector } from './WindowSelector';
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
  const [splitMetric, setSplitMetric] = useState<'users' | 'getapp'>('users');

  const filters = useMemo(
    () => ({ surface: surfaceFocus, country: countryFocus, keyword: keywordFocus }),
    [surfaceFocus, countryFocus, keywordFocus],
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
        surface: 'organic',
      }),
    [data, window, filters.country, filters.keyword],
  );
  const paidMovers = useMemo(
    () =>
      topVolumeMovers(data, window, {
        limit: 8,
        country: filters.country,
        keyword: filters.keyword,
        surface: 'paid',
      }),
    [data, window, filters.country, filters.keyword],
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
  const openCategoryDetail = useCategoryDetailStore((s) => s.openCategory);

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
            {(surfaceFocus !== 'all' || countryFocus || keywordFocus) && (
              <button
                type="button"
                onClick={() => {
                  setSurfaceFocus('all');
                  setCountryFocus(null);
                  setKeywordFocus(null);
                }}
                className="text-[11px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
              >
                Clear all
              </button>
            )}
          </div>
          <WindowSelector value={window} onChange={setWindow} />
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KpiTile
              label={`Users · ${window}`}
              value={formatNumber(kpis.usersL, { compact: true })}
              deltaPct={kpis.usersDeltaPct}
              helper={`vs prior ${days}d`}
              Icon={Users}
            />
            <KpiTile
              label={`GetApp · ${window}`}
              value={formatNumber(kpis.getAppL, { compact: true })}
              deltaPct={kpis.getAppDeltaPct}
              helper={`vs prior ${days}d`}
              Icon={Target}
            />
            <KpiTile
              label={`CR Total · ${window}`}
              value={totalCr !== null ? formatPercent(totalCr) : '—'}
              deltaPct={
                totalCr !== null && totalCrPrior !== null && totalCrPrior > 0
                  ? totalCr / totalCrPrior - 1
                  : null
              }
              helper={`paid + organic · vs prior ${days}d`}
              Icon={Megaphone}
            />
            <AdsTargetTile
              label={`Ads target · ${window}`}
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
            <h2 className="text-sm font-semibold text-slate-900">Channel mix · {window}</h2>
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
            snapshot={channelSnapshot}
            windowLabel={window}
            activeFocus={surfaceFocus}
            onSelect={setSurfaceFocus}
          />
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title="Market Performance · all windows"
          hint="Click a window to focus the whole page."
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
          hint={`Organic vs Paid share by ${splitMetric === 'users' ? 'Users' : 'GetApp'} across windows.`}
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
                GetApp
              </button>
            </div>
          </div>
          {isLoading ? <Skeleton className="h-56" /> : <ChannelSplitChart data={split} metric={splitMetric} />}
        </SectionCard>
      </section>

      <SectionCard
        title="Daily trend · last 30 days"
        hint="Per-day Users / GetApp / CR (toggle). Falls back to L7D rolling for days without daily data."
      >
        {isLoading ? (
          <Skeleton className="h-56" />
        ) : (
          <DailyTrendChart data={dailyTrendData} />
        )}
      </SectionCard>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title={`Top countries · ${window}`}
          hint="Click a country to filter the whole page."
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
          title={`Category share · ${window}`}
          hint="Toggle Users / GetApp at the top right. Click a slice for details."
        >
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : categoryShares.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No category data.</div>
          ) : (
            <CategoryShareDonut
              data={categoryShares.slice(0, 8)}
              onCategoryClick={(c) => openCategoryDetail(c, window)}
            />
          )}
        </SectionCard>
      </section>

      <SectionCard
        title={`Top contribution · ${window}`}
        hint="Top keywords by absolute Users and Installs, with share %."
      >
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        ) : (
          <TopContributors
            users={topUsers.rows}
            getApp={topGetApp.rows}
            totalUsers={topUsers.total}
            totalGetApp={topGetApp.total}
            activeKeyword={keywordFocus}
            activeSurface={surfaceFocus}
            activeCountry={countryFocus}
            onRowClick={(k) => setKeywordFocus(keywordFocus === k ? null : k)}
          />
        )}
      </SectionCard>

      <SectionCard
        title={`Top volume movers · ${window}`}
        hint="Keywords with the biggest |Δ users %|. VN + IN excluded."
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
