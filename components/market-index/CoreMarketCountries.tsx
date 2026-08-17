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
// The revenue answer lives in the same tab, in the block Trang refreshes each
// quarter (PerGeo_CPI_Cap columns I–P): real revenue per country, plus what one
// install is worth there. Ranking by that excludes India and Vietnam without
// any special-casing — India earns $0.86 per install, Vietnam is not in the
// block at all.
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

/** A country in the basket, plus what the revenue block says about it. */
interface Row extends CountryWeight {
  rank: number | null;
  tier1: boolean;
  revenue: number | null;
  revenueShare: number | null;
  /** Revenue ÷ installs — the ceiling any CPI has to stay under to pay off. */
  valuePerInstall: number | null;
}

export function CoreMarketCountries({ data, limit = 15 }: Props) {
  const [basis, setBasis] = useState<Basis>('revenue');
  const [metric, setMetric] = useState<Metric>('users');
  const [window, setWindow] = useState<OverviewWindow>('L30');

  const { rows, totalCountries, effWindow } = useMemo(
    () => countryMarketWeights(data, window),
    [data, window],
  );

  const tier1By = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of data?.perGeoCpiCap ?? []) m.set(c.country.trim().toLowerCase(), c.tier1);
    return m;
  }, [data?.perGeoCpiCap]);

  const revenueBy = useMemo(() => {
    const rows = data?.perGeoRevenue ?? [];
    const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.revenue) ? r.revenue : 0), 0);
    const m = new Map<string, { rank: number; revenue: number; share: number; vpi: number | null }>();
    for (const r of rows) {
      m.set(r.country.trim().toLowerCase(), {
        rank: r.rank,
        revenue: r.revenue,
        share: total > 0 ? r.revenue / total : 0,
        vpi: r.valuePerInstall,
      });
    }
    return m;
  }, [data?.perGeoRevenue]);

  const hasRevenueRank = revenueBy.size > 0;
  const revenuePeriod = data?.perGeoRevenuePeriod ?? '';

  const enriched = useMemo<Row[]>(
    () =>
      rows.map((r) => {
        const k = r.country.trim().toLowerCase();
        const rev = revenueBy.get(k);
        return {
          ...r,
          rank: rev?.rank ?? null,
          tier1: tier1By.get(k) ?? false,
          revenue: rev?.revenue ?? null,
          revenueShare: rev?.share ?? null,
          valuePerInstall: rev?.vpi ?? null,
        };
      }),
    [rows, revenueBy, tier1By],
  );

  // The revenue block lists countries GA4 may not have reported any traffic for
  // in the selected window. They are still core market — a country earning
  // money with no measured users this week has not stopped mattering.
  const coreRows = useMemo<Row[]>(() => {
    if (!hasRevenueRank) return [];
    const byCountry = new Map(enriched.map((r) => [r.country.trim().toLowerCase(), r]));
    const out: Row[] = [];
    for (const r of data?.perGeoRevenue ?? []) {
      const k = r.country.trim().toLowerCase();
      const hit = byCountry.get(k);
      const rev = revenueBy.get(k);
      out.push(
        hit ?? {
          country: r.country,
          users: 0,
          getApp: 0,
          usersShare: 0,
          getAppShare: 0,
          deltaUsersPct: null,
          deltaGetAppPct: null,
          rank: r.rank,
          tier1: tier1By.get(k) ?? false,
          revenue: rev?.revenue ?? r.revenue,
          revenueShare: rev?.share ?? null,
          valuePerInstall: r.valuePerInstall,
        },
      );
    }
    return out.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  }, [hasRevenueRank, enriched, data?.perGeoRevenue, revenueBy, tier1By]);

  const shown = useMemo(() => {
    const share = (r: Row) => (metric === 'users' ? r.usersShare : r.getAppShare);
    if (basis === 'revenue' && hasRevenueRank) return coreRows.slice(0, limit);
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
  const byRevenueBasis = basis === 'revenue' && hasRevenueRank;
  // Under the revenue basis the bar IS revenue share; under the traffic basis
  // it stays the users/install share it always was.
  const weight = (r: Row) => (byRevenueBasis ? (r.revenueShare ?? 0) : share(r));
  const maxShare = shown.reduce((m, r) => Math.max(m, weight(r)), 0);
  const shownShare = shown.reduce((s, r) => s + weight(r), 0);
  const unit = metric === 'users' ? 'users' : 'install';
  const fellBack = effWindow !== window;
  const byRevenue = byRevenueBasis;

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
                  Top {shown.length} nước theo <b>doanh thu thật</b> · chiếm {(shownShare * 100).toFixed(0)}% tổng doanh
                  thu{revenuePeriod ? ` (${revenuePeriod})` : ''}
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
                    {(weight(r) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-indigo-500"
                    style={{ width: `${maxShare > 0 ? (weight(r) / maxShare) * 100 : 0}%` }}
                  />
                </div>
              </div>
              {byRevenue ? (
                <div className="w-40 shrink-0 text-right font-mono text-[11px] tabular-nums">
                  <div className="text-slate-700">
                    ${formatNumber(Math.round(r.revenue ?? 0), { compact: true })}
                  </div>
                  <div
                    className="cursor-help text-[10px] text-slate-400"
                    title="Doanh thu ÷ install — một install ở nước này đáng bao nhiêu. Trần CPI phải nằm dưới con số này thì mới hoà vốn."
                  >
                    {r.valuePerInstall === null ? '—' : `$${r.valuePerInstall.toFixed(0)}/install`}
                    <span className="ml-1 text-slate-300">·</span>{' '}
                    <span className={cn(deltaCls(delta(r)))}>{fmtDelta(delta(r)) || '—'}</span>
                  </div>
                </div>
              ) : (
                <div className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-500">
                  {formatNumber(value(r), { compact: true })} {unit}
                  <span className={cn('ml-1', deltaCls(delta(r)))}>{fmtDelta(delta(r))}</span>
                </div>
              )}
            </li>
          ))}
        </ol>

        {trafficOnly.length > 0 && (
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] leading-snug text-slate-600">
            <b>Có lưu lượng nhưng ngoài core market:</b>{' '}
            {trafficOnly
              .map(
                (r) =>
                  `${r.country} (${(share(r) * 100).toFixed(1)}% ${metric === 'users' ? 'users' : 'install'}` +
                  `${r.valuePerInstall !== null ? `, $${r.valuePerInstall.toFixed(2)}/install` : ', chưa có doanh thu'})`,
              )
              .join(' · ')}
            . Đủ traffic để lọt top {limit} theo {metric === 'users' ? 'Users' : 'Install'}, nhưng không nằm trong top{' '}
            {limit} doanh thu — nên không tính là core market.
          </div>
        )}

        <p className="border-t pt-2 text-[10px] text-slate-400">
          ⓘ{' '}
          {byRevenue ? (
            <>
              Doanh thu lấy từ khối bên phải tab <code className="text-[9px]">PerGeo_CPI_Cap</code> (cột I–P), cập nhật
              theo quý{revenuePeriod ? ` — kỳ hiện tại: ${revenuePeriod}` : ''}. <b>%</b> là share doanh thu, không phải
              share traffic. <b>$/install</b> = doanh thu ÷ install ở nước đó: trần CPI phải nằm dưới con số này thì
              install mới tự trả được cho mình.
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
