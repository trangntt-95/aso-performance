'use client';

import { useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import { countryMarketWeights, type CountryWeight, type OverviewWindow } from '@/components/overview/aggregate';
import type { SheetPayload } from '@/lib/sheets/types';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Which countries make up the core market.
//
// This card used to rank by GA4 users alone, which quietly put India and
// Vietnam inside the "core market" — they generate traffic but no revenue, and
// both are on the paid-exclude list. Traffic volume is the wrong axis for a
// question about which markets matter.
//
// The revenue answer is already in the account: PerGeo_CPI_Cap carries a
// 'Country Rank' column, which is the revenue ranking the CPI ceilings were
// derived from. India sits at rank 47 there and Vietnam has no rank at all, so
// ranking by revenue excludes them without any special-casing.
//
// The users view is kept, but relabelled as what it is — traffic, not market.

type Basis = 'revenue' | 'users';
type Metric = 'users' | 'install';

interface Props {
  data: SheetPayload | undefined;
  limit?: number;
}

const WINDOWS: OverviewWindow[] = ['L7', 'L30', 'L90'];

function fmtDelta(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '';
  const p = v * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;
}
function deltaCls(v: number | null): string {
  if (v === null || v === 0 || !Number.isFinite(v)) return 'text-slate-400';
  return v > 0 ? 'text-emerald-600' : 'text-rose-600';
}

/** A country in the basket, plus its revenue rank when one exists. */
interface Row extends CountryWeight {
  rank: number | null;
  tier1: boolean;
}

export function CoreMarketCountries({ data, limit = 15 }: Props) {
  const [basis, setBasis] = useState<Basis>('revenue');
  const [metric, setMetric] = useState<Metric>('users');
  const [window, setWindow] = useState<OverviewWindow>('L30');

  const { rows, totalCountries, effWindow } = useMemo(
    () => countryMarketWeights(data, window),
    [data, window],
  );

  const rankByCountry = useMemo(() => {
    const m = new Map<string, { rank: number | null; tier1: boolean }>();
    for (const c of data?.perGeoCpiCap ?? []) {
      m.set(c.country.trim().toLowerCase(), { rank: c.rank, tier1: c.tier1 });
    }
    return m;
  }, [data?.perGeoCpiCap]);

  const hasRevenueRank = useMemo(
    () => (data?.perGeoCpiCap ?? []).some((c) => c.rank !== null),
    [data?.perGeoCpiCap],
  );

  const enriched = useMemo<Row[]>(
    () =>
      rows.map((r) => {
        const cfg = rankByCountry.get(r.country.trim().toLowerCase());
        return { ...r, rank: cfg?.rank ?? null, tier1: cfg?.tier1 ?? false };
      }),
    [rows, rankByCountry],
  );

  const shown = useMemo(() => {
    const share = (r: Row) => (metric === 'users' ? r.usersShare : r.getAppShare);
    if (basis === 'revenue' && hasRevenueRank) {
      // Ranked countries only, in revenue order. A country with no rank is not
      // absent from the market — it simply has no revenue standing, which is
      // exactly what puts it outside the core.
      return enriched
        .filter((r) => r.rank !== null)
        .sort((a, b) => (a.rank as number) - (b.rank as number))
        .slice(0, limit);
    }
    return [...enriched].sort((a, b) => share(b) - share(a)).slice(0, limit);
  }, [enriched, basis, hasRevenueRank, metric, limit]);

  // Countries big enough by traffic to make the users top-N but not the revenue
  // one. Naming them is the point — this is the gap the old card hid.
  const trafficOnly = useMemo(() => {
    if (basis !== 'revenue' || !hasRevenueRank) return [];
    const inCore = new Set(shown.map((r) => r.country));
    const share = (r: Row) => (metric === 'users' ? r.usersShare : r.getAppShare);
    return [...enriched]
      .sort((a, b) => share(b) - share(a))
      .slice(0, limit)
      .filter((r) => !inCore.has(r.country));
  }, [enriched, shown, basis, hasRevenueRank, metric, limit]);

  if (rows.length === 0) return null;
  const share = (r: Row) => (metric === 'users' ? r.usersShare : r.getAppShare);
  const value = (r: Row) => (metric === 'users' ? r.users : r.getApp);
  const delta = (r: Row) => (metric === 'users' ? r.deltaUsersPct : r.deltaGetAppPct);
  const maxShare = shown.reduce((m, r) => Math.max(m, share(r)), 0);
  const shownShare = shown.reduce((s, r) => s + share(r), 0);
  const unit = metric === 'users' ? 'users' : 'install';
  const fellBack = effWindow !== window;
  const byRevenue = basis === 'revenue' && hasRevenueRank;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Globe className="h-4 w-4 text-indigo-600" />
              Core market — quốc gia &amp; trọng số
            </h2>
            <p className="text-[11px] text-slate-500">
              {byRevenue ? (
                <>
                  Top {shown.length} nước theo <b>rank doanh thu</b> (cột Country Rank trong PerGeo_CPI_Cap) · chiếm{' '}
                  {(shownShare * 100).toFixed(0)}% {metric === 'users' ? 'Users' : 'Install'} / {totalCountries} nước
                </>
              ) : (
                <>
                  Top {shown.length} nước theo <b>{metric === 'users' ? 'Users' : 'Install'}</b> — đây là lưu lượng,
                  không phải doanh thu · chiếm {(shownShare * 100).toFixed(0)}% / {totalCountries} nước
                </>
              )}
              {fellBack && <span className="text-amber-600"> · country data theo {effWindow}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {hasRevenueRank && (
              <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => setBasis('revenue')}
                  title="Xếp theo cột Country Rank trong PerGeo_CPI_Cap — thứ hạng doanh thu"
                  className={cn(
                    'px-2 py-0.5 font-medium transition',
                    basis === 'revenue' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  Doanh thu
                </button>
                <button
                  type="button"
                  onClick={() => setBasis('users')}
                  title="Xếp theo lưu lượng GA4 — gồm cả nước không tạo doanh thu"
                  className={cn(
                    'border-l border-slate-200 px-2 py-0.5 font-medium transition',
                    basis === 'users' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  Lưu lượng
                </button>
              </div>
            )}
            <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindow(w)}
                  className={cn(
                    'px-2 py-0.5 font-medium transition',
                    w !== WINDOWS[0] && 'border-l border-slate-200',
                    window === w ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
              <button
                type="button"
                onClick={() => setMetric('users')}
                className={cn('px-2 py-0.5 font-medium transition', metric === 'users' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
              >
                Users
              </button>
              <button
                type="button"
                onClick={() => setMetric('install')}
                className={cn('border-l border-slate-200 px-2 py-0.5 font-medium transition', metric === 'install' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
              >
                Install
              </button>
            </div>
          </div>
        </div>

        <ol className="space-y-1.5">
          {shown.map((r, i) => (
            <li key={r.country} className="flex items-center gap-2 text-sm">
              <span className="w-5 shrink-0 text-right font-mono text-[10px] text-slate-400">
                {byRevenue ? r.rank : i + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-800">
                    {r.country}
                    {r.tier1 && (
                      <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-600">T1</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-indigo-700">
                    {(share(r) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-indigo-500"
                    style={{ width: `${maxShare > 0 ? (share(r) / maxShare) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-500">
                {formatNumber(value(r), { compact: true })} {unit}
                <span className={cn('ml-1', deltaCls(delta(r)))}>{fmtDelta(delta(r))}</span>
              </div>
            </li>
          ))}
        </ol>

        {trafficOnly.length > 0 && (
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] leading-snug text-slate-600">
            <b>Có lưu lượng nhưng ngoài core market:</b>{' '}
            {trafficOnly
              .map((r) => `${r.country} (${(share(r) * 100).toFixed(1)}%${r.rank !== null ? `, rank ${r.rank}` : ', chưa có rank'})`)
              .join(' · ')}
            . Đủ traffic để lọt top {limit} theo {metric === 'users' ? 'Users' : 'Install'}, nhưng không nằm trong top{' '}
            {limit} doanh thu — nên không tính là core market.
          </div>
        )}

        <p className="border-t pt-2 text-[10px] text-slate-400">
          ⓘ{' '}
          {byRevenue ? (
            <>
              Thứ tự lấy từ cột <b>Country Rank</b> của <code className="text-[9px]">PerGeo_CPI_Cap</code> — thứ hạng
              doanh thu, cùng nguồn với trần CPI. India ở rank 47 và Vietnam chưa có rank, nên cả hai <b>không</b> nằm
              trong core market. % là share {metric === 'users' ? 'Users' : 'Install'} của nước đó trong window đã chọn.
            </>
          ) : (
            <>
              Đang xếp theo <b>lưu lượng</b>, nên danh sách này gồm cả nước không tạo doanh thu (India, Vietnam,
              Pakistan…). Đổi sang <b>Doanh thu</b> để lấy core market thật.
            </>
          )}
          {fellBack && ` Country_${window} chưa có data → dùng ${effWindow}.`} <b>Verdict</b> Market Health tính trên rổ{' '}
          <b>keyword</b> (Dynamic basket), không phải danh sách này.
        </p>
      </CardContent>
    </Card>
  );
}
