'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, AlertCircle, AlertTriangle, BarChart3, Globe2, Layers, ListChecks, Target, Users } from 'lucide-react';
import { PriorityQueueTile } from './PriorityQueueTile';
import { useSheetData } from '@/lib/hooks/useSheetData';
import {
  computeKpis,
  marketTrajectory,
  channelSplit,
  topCountriesFor,
  categoryShareFor,
  topP0Actions,
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
import { TopActionsList } from './TopActionsList';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, composeVerdict, verdictBadgeStyle } from '@/lib/utils/format';
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
  const trajectory = useMemo(() => marketTrajectory(data?.marketIndex.summary ?? []), [data]);
  const split = useMemo(() => channelSplit(data?.marketIndex.funnels ?? []), [data]);
  const topCountries = useMemo(() => topCountriesFor(data, window), [data, window]);
  const categoryShares = useMemo(() => categoryShareFor(data, window), [data, window]);
  const topActionsAll = useMemo(() => topP0Actions(data?.actionQueue ?? []), [data]);
  const topActionsPaid = useMemo(
    () => topActionsAll.filter((r) => r.surface === 'paid').slice(0, 5),
    [topActionsAll],
  );
  const topActionsOrganic = useMemo(
    () => topActionsAll.filter((r) => r.surface === 'organic').slice(0, 5),
    [topActionsAll],
  );
  const channelSnapshot = useMemo(() => channelSnapshotForWindow(data, window), [data, window]);
  const openCountryDetail = useCountryDetailStore((s) => s.openCountry);
  const openCategoryDetail = useCategoryDetailStore((s) => s.openCategory);

  const headlineWindow = data?.marketIndex.summary.find((s) => s.window === window);
  const composedVerdict = headlineWindow
    ? composeVerdict(headlineWindow.deltaWeightedPct, headlineWindow.deltaUsersPct)
    : null;
  const verdictS = composedVerdict ? verdictBadgeStyle(composedVerdict) : null;
  const days = windowDays(window);

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
              label="Active alerts"
              value={String(kpis.totalAlerts)}
              helper={`across ${data?.[`all${window}` as 'allL7']?.length ?? 0} keywords`}
              Icon={AlertTriangle}
              tone={kpis.totalAlerts > 30 ? 'warn' : 'default'}
            />
            <PriorityQueueTile
              p0={kpis.p0Count}
              p1={kpis.p1Count}
              p2={kpis.p2Count}
              p3={kpis.p3Count}
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
          title="Channel volume · all windows"
          hint="Organic vs paid Users stacked across each window"
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
        title="Top priority actions this week"
        hint="P0 + P1 từ daily ASO tracker, sort theo urgency score. Đã loại Vietnam + India (luôn exclude khỏi paid ads). Score = severity × volume × surface."
        cta={embedded ? undefined : 'Open full queue'}
        href={embedded ? undefined : '/actions'}
      >
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : topActionsAll.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No P0 or P1 actions right now.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Paid bidding
                </span>
                <span className="text-[11px] text-slate-500">
                  ({topActionsPaid.length}) — cần quyết định bid / pause / scale
                </span>
              </div>
              {topActionsPaid.length === 0 ? (
                <div className="border rounded-lg bg-white py-4 text-center text-xs text-slate-500">
                  Không có paid action P0/P1.
                </div>
              ) : (
                <TopActionsList rows={topActionsPaid} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Organic / listing
                </span>
                <span className="text-[11px] text-slate-500">
                  ({topActionsOrganic.length}) — cần check listing / expand to paid
                </span>
              </div>
              {topActionsOrganic.length === 0 ? (
                <div className="border rounded-lg bg-white py-4 text-center text-xs text-slate-500">
                  Không có organic action P0/P1.
                </div>
              ) : (
                <TopActionsList rows={topActionsOrganic} />
              )}
            </div>
          </div>
        )}
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
