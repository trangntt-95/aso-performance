'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, AlertCircle, BarChart3, Globe2, Layers, ListChecks, Megaphone, Sprout, Target, Trophy, Users } from 'lucide-react';
import { expectedAdsInstalls } from '@/lib/config/ads-targets';
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
  windowDays,
  type OverviewWindow,
} from './aggregate';
import { KpiTile } from './KpiTile';
import { WindowSelector } from './WindowSelector';
import { ChannelMixCards } from './ChannelMixCards';
import { MarketTrajectoryChart } from './MarketTrajectoryChart';
import { ChannelSplitChart } from './ChannelSplitChart';
import { TopCountriesChart } from './TopCountriesChart';
import { CategoryShareDonut } from './CategoryShareDonut';
import { TopVolumeMovers } from './TopVolumeMovers';
import { TopContributors } from './TopContributors';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, formatPercent, composeVerdict, verdictBadgeStyle } from '@/lib/utils/format';
import { useCountryDetailStore } from '@/lib/store/countryDetailStore';
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

  const kpis = useMemo(() => computeKpis(data, window), [data, window]);
  const trajectory = useMemo(() => marketTrajectory(data), [data]);
  const split = useMemo(() => channelSplit(data), [data]);
  const topCountries = useMemo(() => topCountriesFor(data, window), [data, window]);
  const categoryShares = useMemo(() => categoryShareFor(data, window), [data, window]);
  const volumeMovers = useMemo(() => topVolumeMovers(data, window, { limit: 8 }), [data, window]);
  const topUsers = useMemo(() => topContributors(data, window, 'users', 20), [data, window]);
  const topGetApp = useMemo(() => topContributors(data, window, 'getApp', 20), [data, window]);
  const channelSnapshot = useMemo(() => channelSnapshotForWindow(data, window), [data, window]);
  const openCountryDetail = useCountryDetailStore((s) => s.openCountry);
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
          </div>
          <WindowSelector value={window} onChange={setWindow} />
        </div>
        {headlineWindow?.primaryCause && (
          <p className="text-sm text-slate-600 max-w-3xl">
            <span className="font-medium text-slate-900">Primary driver:</span>{' '}
            {headlineWindow.primaryCause}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
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
              label={`CR Paid · ${window}`}
              value={formatPercent(channelSnapshot?.paidCr ?? 0)}
              deltaPct={
                channelSnapshot && channelSnapshot.paidCrPrior > 0
                  ? channelSnapshot.paidCr / channelSnapshot.paidCrPrior - 1
                  : null
              }
              helper={`vs prior ${days}d`}
              Icon={Megaphone}
            />
            <KpiTile
              label={`CR Organic · ${window}`}
              value={formatPercent(channelSnapshot?.organicCr ?? 0)}
              deltaPct={
                channelSnapshot && channelSnapshot.organicCrPrior > 0
                  ? channelSnapshot.organicCr / channelSnapshot.organicCrPrior - 1
                  : null
              }
              helper={`vs prior ${days}d`}
              Icon={Sprout}
            />
            <KpiTile
              label={`Ads target · ${window}`}
              value={adsTargetPct !== null ? formatPercent(adsTargetPct) : '—'}
              helper={
                adsTargetExpected !== null && channelSnapshot
                  ? `${formatNumber(channelSnapshot.paidGetApp)} / ${formatNumber(Math.round(adsTargetExpected))}`
                  : 'target out of range'
              }
              Icon={Trophy}
              tone={
                adsTargetPct === null
                  ? 'default'
                  : adsTargetPct < 0.9
                    ? 'warn'
                    : 'default'
              }
            />
          </>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Channel mix · {window}</h2>
            <p className="text-[11px] text-slate-500">Organic vs paid · last {days}d vs prior {days}d</p>
          </div>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <ChannelMixCards snapshot={channelSnapshot} windowLabel={window} />
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title="Market trajectory · all windows"
          hint="Δ Users % across recency windows. Hover to see GetApp and Weighted deltas + verdict."
          cta={embedded ? undefined : 'Drill into Market Index'}
          href={embedded ? undefined : '/market-index'}
        >
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : (
            <MarketTrajectoryChart data={trajectory} metric="usersDelta" />
          )}
        </SectionCard>
        <SectionCard
          title="Channel split % · all windows"
          hint="Tỉ trọng Organic vs Paid (theo Users) qua từng window — line chart, hover thấy số tuyệt đối."
        >
          {isLoading ? <Skeleton className="h-56" /> : <ChannelSplitChart data={split} metric="users" />}
        </SectionCard>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title={`Top countries · ${window}`}
          hint="Click a bar to see paid/organic split + top contributing keywords"
        >
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : topCountries.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No country data.</div>
          ) : (
            <TopCountriesChart
              data={topCountries}
              onCountryClick={(c) => openCountryDetail(c, window)}
            />
          )}
        </SectionCard>
        <SectionCard
          title={`Category share · ${window}`}
          hint="Click a slice to see channel split + top contributing keywords"
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
        hint="Top keyword đóng góp Users (demand) và GetApp (install) lớn nhất, kèm % share so với tổng. Sort theo absolute volume."
      >
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        ) : (
          <TopContributors users={topUsers} getApp={topGetApp} />
        )}
      </SectionCard>

      <SectionCard
        title={`Top biến động volume · ${window}`}
        hint="Keyword có biến động volume mạnh nhất (theo |Δ users %|). Sàng floor 30 users để loại noise, đã loại Vietnam + India. Số liệu → insight → action."
      >
        {isLoading ? <Skeleton className="h-72" /> : <TopVolumeMovers movers={volumeMovers} />}
      </SectionCard>

      {!embedded && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: '/actions', label: 'Action queue', Icon: ListChecks },
            { href: '/market-index', label: 'Market index', Icon: BarChart3 },
            { href: '/geo-opportunity', label: 'Geo opportunity', Icon: Target },
            { href: '/tier1-watch', label: 'Tier 1 watch', Icon: Globe2 },
          ].map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition group"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-indigo-600" />
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-500 transition" />
              </div>
              <div className="text-sm font-medium text-slate-900 mt-2">{label}</div>
            </Link>
          ))}
          <Link
            href="/categories"
            className="hidden md:block rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition group"
          >
            <div className="flex items-center justify-between">
              <Layers className="h-4 w-4 text-indigo-600" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-500 transition" />
            </div>
            <div className="text-sm font-medium text-slate-900 mt-2">Categories</div>
          </Link>
        </section>
      )}
    </div>
  );
}
