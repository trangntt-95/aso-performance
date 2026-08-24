'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ArrowRight, AlertCircle, AlertTriangle, Check, Link2, Megaphone, Target, Users } from 'lucide-react';
import { expectedAdsInstalls, runrateAdsToMonthEnd } from '@/lib/config/ads-targets';
import { AdsTargetTile } from './AdsTargetTile';
import { useSheetData } from '@/lib/hooks/useSheetData';
import {
  computeKpis,
  marketTrajectory,
  channelSplit,
  topCountriesFor,
  effectiveCountryWindow,
  categoryShareFor,
  topVolumeMovers,
  topContributors,
  channelSnapshotForWindow,
  channelSnapshotForRange,
  dailyTrend,
  availableDailyDates,
  countryDateModeAvailable,
  isoAddDays,
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
import { ChannelComparisonCard } from './ChannelComparison';
import { compareChannels } from '@/lib/market/crossChannel';
import { MarketTrajectoryChart } from './MarketTrajectoryChart';
import { ChannelSplitChart } from './ChannelSplitChart';
import { DailyTrendChart } from './DailyTrendChart';
import { TopCountriesChart } from './TopCountriesChart';
import { CategoryShareDonut } from './CategoryShareDonut';
import { CategoryCpiStrip } from './CategoryCpiStrip';
import { TopVolumeMovers } from './TopVolumeMovers';
import { TopContributors } from './TopContributors';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, formatPercent, composeVerdict, verdictBadgeStyle } from '@/lib/utils/format';
import { useCategoryDetailStore } from '@/lib/store/categoryDetailStore';
import { useDashboardContext } from '@/lib/store/dashboardContextStore';
import { useNotesStore } from '@/lib/store/notesStore';
import { readChangelog } from '@/lib/store/changelog';
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
    return (['L3', 'L7', 'L14', 'L30', 'L90', 'L365'] as const).includes(w as OverviewWindow)
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
  // Market Performance series: core basket, everything, or both side by side.
  const [marketSeries, setMarketSeries] = useState<'core' | 'all'>('all');
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
  const split = useMemo(() => channelSplit(data, filters), [data, filters]);
  const topCountries = useMemo(
    () => topCountriesFor(data, window, 55, filters),
    [data, window, filters],
  );
  // Country_L90 / Country_L365 tabs are empty in the sheet → Top countries falls
  // back to the nearest window that has country data; note it when it differs.
  const countryWin = useMemo(() => effectiveCountryWindow(data, window), [data, window]);
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
    () => topContributors(data, window, 'users', Infinity, filters),
    [data, window, filters],
  );
  const topGetApp = useMemo(
    () => topContributors(data, window, 'getApp', Infinity, filters),
    [data, window, filters],
  );
  const channelSnapshot = useMemo(
    () => channelSnapshotForWindow(data, window, filters),
    [data, window, filters],
  );

  // ── Date mode (per-day / per-range snapshot from History_Daily) ──
  const availableDates = useMemo(() => availableDailyDates(data, filters), [data, filters]);

  // Logged changes, marked on the daily trend. Loaded from the same notes store
  // the rest of the app writes to, so a change typed on the Change log page shows
  // up here without any extra wiring.
  const notes = useNotesStore((s) => s.notes);
  const noteTimes = useNotesStore((s) => s.updatedAt);
  const notesLoaded = useNotesStore((s) => s.loaded);
  const loadNotes = useNotesStore((s) => s.load);
  useEffect(() => {
    if (!notesLoaded) void loadNotes();
  }, [notesLoaded, loadNotes]);
  const changeEntries = useMemo(() => readChangelog(notes, noteTimes), [notes, noteTimes]);
  const changeMarkers = useMemo(
    () => changeEntries.map((e) => ({ date: e.date, label: e.text })),
    [changeEntries],
  );

  // First day of the month containing the newest day that HAS data → that day.
  // Anchored to the data, not to today: the export lands a day or two behind, and
  // anchoring to today would show an empty tail every morning and, on the 1st,
  // a range with nothing in it at all.
  const thisMonthRange = useMemo(() => {
    if (availableDates.length === 0) return null;
    const last = availableDates[availableDates.length - 1];
    const from = `${last.slice(0, 7)}-01`;
    // Only offer it when the month actually has a day of data.
    return availableDates.some((d) => d >= from) ? { from, to: last } : null;
  }, [availableDates]);

  const applyThisMonth = () => {
    if (!thisMonthRange) return;
    setDateRange(thisMonthRange);
    setRangeFrom(thisMonthRange.from);
    setRangeTo(thisMonthRange.to);
  };

  const isThisMonth =
    !!dateRange &&
    !!thisMonthRange &&
    dateRange.from === thisMonthRange.from &&
    dateRange.to === thisMonthRange.to;

  const minDate = availableDates[0];
  const maxDate = availableDates[availableDates.length - 1];
  const dateKpi = useMemo(
    () => (dateRange ? kpisForRange(data, dateRange.from, dateRange.to, filters) : null),
    [data, dateRange, filters],
  );
  const dateTopUsers = useMemo(
    () => (dateRange ? topContributorsForRange(data, dateRange.from, dateRange.to, 'users', Infinity, filters) : null),
    [data, dateRange, filters],
  );
  const dateTopGetApp = useMemo(
    () => (dateRange ? topContributorsForRange(data, dateRange.from, dateRange.to, 'getApp', Infinity, filters) : null),
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
  // Can a country focus actually be honoured for this range? Only when the
  // Tier-1 per-day tab covers that country inside it.
  const countryDateOk = useMemo(
    () => (dateRange ? countryDateModeAvailable(data, dateRange.from, dateRange.to, countryFocus) : false),
    [data, dateRange, countryFocus],
  );

  // Days inside the picked range that contribute nothing to the totals, folded
  // into contiguous runs so the warning reads "13/07 → 31/07", not 19 dates.
  const coverageGaps = useMemo(() => {
    if (!dateKpi || dateKpi.coverage.missing.length === 0) return null;
    const { days, covered, missing } = dateKpi.coverage;
    const runs: Array<[string, string]> = [];
    for (const d of missing) {
      const last = runs[runs.length - 1];
      if (last && isoAddDays(last[1], 1) === d) last[1] = d;
      else runs.push([d, d]);
    }
    const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const shown = runs.slice(0, 3).map(([a, b]) => (a === b ? dm(a) : `${dm(a)} → ${dm(b)}`));
    // The per-day backfill only ever reaches YESTERDAY — today's numbers aren't
    // final until the day closes. A range ending today is therefore missing its
    // last day by design, not because the pipeline broke; saying "chạy lại
    // backfill" there would be crying wolf every single afternoon.
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const pendingToday = missing.length === 1 && missing[0] >= todayIso;
    return {
      days,
      covered,
      comparable: dateKpi.comparable,
      pendingToday,
      lastCovered: dateKpi.coverage.coveredDates[dateKpi.coverage.coveredDates.length - 1] ?? null,
      missingLabel: shown.join(', ') + (runs.length > 3 ? ` … (+${runs.length - 3} đoạn)` : ''),
    };
  }, [dateKpi]);

  // Note appended to window-based sections that can't be date-scoped.
  const winNote = inDateMode ? ` · ⚠️ theo window ${window}, chưa lọc ngày` : '';
  const dateLabel = dateRange ? (isSingleDay ? dateRange.from : `${dateRange.from} → ${dateRange.to}`) : '';

  // Paid channels side by side. Returns null until both sources have data, so
  // the section simply doesn't render on a dashboard without Google Ads wired up.
  //
  // Both channels are per-day, so this follows the page scope the same way the
  // category spend does: a pinned range wins, otherwise the selected window's
  // REAL dates (published per tab in windowDates) — passing only the pinned range
  // meant picking L14 left this section on the full two-channel overlap, silently
  // showing a different period from everything around it.
  const channelRange = useMemo(
    () => dateRange ?? data?.windowDates?.[window] ?? null,
    [dateRange, data?.windowDates, window],
  );
  const channelCompare = useMemo(() => compareChannels(data, channelRange), [data, channelRange]);

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
  const kpiHelper = 'vs kỳ trước';
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
      <header className="sticky top-[57px] z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-slate-50/95 backdrop-blur border-b border-slate-200 space-y-3">
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
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition',
                  // Struck through in date mode: the chip is still there, but the
                  // date-scoped numbers ignore it (History_Daily has no country).
                  inDateMode && !countryDateOk
                    ? 'bg-slate-100 text-slate-400 line-through decoration-amber-500 hover:bg-slate-200'
                    : 'bg-sky-100 text-sky-800 hover:bg-sky-200',
                )}
                title={
                  inDateMode && !countryDateOk
                    ? `Đang lọc ngày → filter nước KHÔNG áp dụng cho số bên dưới (History_Daily không có cột country). Click để bỏ.`
                    : 'Click to clear country filter'
                }
              >
                {countryFocus} <span className={inDateMode && !countryDateOk ? 'text-amber-600' : 'text-slate-500'}>✕</span>
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
              {/* Shortcut for the range asked for most often. Hidden when the
                  data has no day in the current month yet — a button that
                  produces an empty view is worse than no button. */}
              {thisMonthRange && (
                <button
                  type="button"
                  onClick={applyThisMonth}
                  title={`Từ ngày 1 của tháng tới ngày mới nhất có data (${thisMonthRange.from} → ${thisMonthRange.to})`}
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-medium transition',
                    isThisMonth
                      ? 'border-rose-300 bg-rose-100 text-rose-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900',
                  )}
                >
                  Tháng này
                </button>
              )}
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

      {/* A multi-day range can only sum the TRUE per-day columns of History_Daily.
          Days that only carry the rolling L7D snapshot add nothing, so the total
          quietly covers a shorter period than the one picked — say so. */}
      {/* Date mode sums History_Daily, which has NO country column — the only
          per-day source is date × keyword × surface. So a country focus is
          accepted by the UI, shown as a chip, and then silently dropped by the
          math: kpisForRange & friends never read opts.country. Rather than let
          the numbers quietly ignore a filter the user believes is on, say it. */}
      {inDateMode && countryFocus && !countryDateOk && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-0.5">
            <div>
              <b>Lọc ngày không cắt được theo nước</b> — các số bên dưới vẫn là{' '}
              <b>toàn bộ nước</b>, chưa lọc <b>{countryFocus}</b>.
            </div>
            <div className="text-[11px] text-amber-700">
              Nguồn dữ liệu theo ngày (<code className="text-[10px]">History_Daily</code>) chỉ có ngày × keyword ×
              surface, không có cột country. Dữ liệu ngày × nước chỉ có cho các thị trường Tier 1 (tab{' '}
              <code className="text-[10px]">History_Daily_Country</code>) —{' '}
              <b>{countryFocus}</b> chưa có số trong khoảng này.
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCountryFocus(null)}
                className="rounded border border-amber-400 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
              >
                Bỏ lọc {countryFocus}
              </button>
              <button
                type="button"
                onClick={clearDateRange}
                className="rounded border border-amber-400 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                title={`Thoát lọc ngày, quay về window ${window} — khi đó lọc nước chạy đúng.`}
              >
                Giữ nước, bỏ lọc ngày (về window {window})
              </button>
            </div>
          </div>
        </div>
      )}

      {coverageGaps?.pendingToday && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
          <div>
            Hôm nay chưa chốt số (dữ liệu theo ngày chỉ có đến hết hôm qua) → khoảng này tính tới{' '}
            <b>{coverageGaps.lastCovered ?? '—'}</b>, tức <b>{coverageGaps.covered}/{coverageGaps.days} ngày</b>.
            {!coverageGaps.comparable && ' % so kỳ trước tạm ẩn vì kỳ này ngắn hơn kỳ trước 1 ngày.'}
          </div>
        </div>
      )}

      {coverageGaps && !coverageGaps.pendingToday && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-0.5">
            <div>
              <b>Khoảng ngày đã chọn thiếu dữ liệu theo ngày</b> — chỉ{' '}
              <b>
                {coverageGaps.covered}/{coverageGaps.days} ngày
              </b>{' '}
              có số liệu. Thiếu: <b>{coverageGaps.missingLabel}</b>.
            </div>
            <div>
              Các số bên dưới <b>chỉ cộng {coverageGaps.covered} ngày có dữ liệu</b> nên{' '}
              <b>thấp hơn thực tế</b> — đừng đọc như tổng cả kỳ.
              {!coverageGaps.comparable && ' % so kỳ trước đã được ẩn vì hai kỳ không cùng số ngày có dữ liệu.'}
            </div>
            <div className="text-[11px] text-amber-700">
              Nguyên nhân: tab <code className="text-[10px]">History_Daily</code> chỉ có cột per-day (Users/Install theo
              ngày) đến <b>{coverageGaps.lastCovered ?? '—'}</b>; sau đó chỉ còn dòng{' '}
              <code className="text-[10px]">l7_snapshot</code> (rolling 7 ngày, không cộng dồn được). Cần chạy lại
              backfill per-day trong Apps Script của Sheet để lấp khoảng trống.
            </div>
          </div>
        </div>
      )}

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
              helper="paid + organic"
              Icon={Megaphone}
            />
            <AdsTargetTile
              label={inDateMode ? `Ads target · ${window} (window)` : `Ads target · ${window}`}
              pct={surfaceFocus === 'organic' ? null : adsTargetPct}
              actual={surfaceFocus === 'organic' ? 0 : channelSnapshot?.paidGetApp ?? 0}
              expected={surfaceFocus === 'organic' ? null : adsTargetExpected}
              runratePct={
                surfaceFocus === 'organic'
                  ? null
                  : adsRunrate
                  ? adsRunrate.pct
                  : undefined
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
            <h2 className="text-sm font-semibold text-slate-900">Shopify search · {kpiSuffix}</h2>
            <p className="text-[11px] text-slate-500">
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

      {channelCompare && !channelCompare.noOverlap && (
        <SectionCard
          title="Kênh trả phí · App Store Ads vs Google Ads"
          cta={embedded ? undefined : 'Chi tiết Google Ads'}
          href={embedded ? undefined : '/google-ads'}
          anchorId="sec-channels"
          highlighted={highlightKey === 'channels'}
          onCopyLink={embedded ? undefined : () => copyLink('channels')}
          copied={copiedKey === 'channels'}
        >
          <ChannelComparisonCard data={channelCompare} />
        </SectionCard>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title="Market Performance · all windows"
          hint={winNote.trim() || undefined}
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
              <>
                <div className="mb-2 flex justify-end">
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
                    {([
                      { id: 'all' as const, label: 'Toàn bộ', title: 'Mọi keyword, mọi nước' },
                      { id: 'core' as const, label: 'Core market', title: 'Chỉ rổ keyword chính, có trọng số theo nước' },
                    ]).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        title={o.title}
                        onClick={() => setMarketSeries(o.id)}
                        className={cn(
                          'px-2 py-1 font-medium transition',
                          marketSeries === o.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-100',
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <MarketTrajectoryChart
                  data={trajectory}
                  mode="single"
                  metric={marketSeries === 'core' ? 'weightedDelta' : 'getAppDelta'}
                  activeWindow={window}
                  onWindowClick={(w) => {
                    if (['L3', 'L7', 'L14', 'L30', 'L90', 'L365'].includes(w)) {
                      setWindow(w as OverviewWindow);
                    }
                  }}
                />
              </>
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
            markers={changeMarkers}
          />
        )}
      </SectionCard>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title={`Top countries · ${countryWin}`}
          hint={
            countryWin !== window
              ? `Country lấy theo ${countryWin} (dùng chung mọi window — phân bố nước gần như không đổi).`
              : winNote.trim()
          }
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
              : undefined
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
                // contradict the per-day view, so only set the filter. The
                // category detail sheet doesn't support L365 (snapshot-only) →
                // also just set the filter there.
                if (next && !inDateMode && window !== 'L365') {
                  openCategoryDetail(c, window, {
                    country: countryFocus,
                    surface: surfaceFocus,
                  });
                }
              }}
            />
          )}
          {/* Tiền, đặt dưới vòng nhu cầu: cùng bộ category, hai phép đo khác nhau. */}
          {!isLoading && (
            <CategoryCpiStrip
              // The SAME days the rest of the page is using. Each window's real
              // range is published per tab (windowDates), so L14 here means
              // exactly the 14 days L14 means everywhere else — deriving it from
              // a day count would anchor to the Shopify export's own last date
              // instead, and the two feeds don't always end on the same day.
              range={dateRange ?? data?.windowDates?.[window] ?? null}
              days={dateRange || data?.windowDates?.[window] ? null : windowDays(window)}
            />
          )}
        </SectionCard>
      </section>

      <SectionCard
        title={`Top contribution · ${kpiSuffix}`}
        hint={
          inDateMode
            ? `Theo ${isSingleDay ? 'ngày' : 'khoảng'} đã chọn (per-day) — không có Δ.`
            : undefined
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
            exportName={`top-contribution-${inDateMode ? (dateRange ? (dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from}_${dateRange.to}`) : 'date') : window}`}
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
