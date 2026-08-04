'use client';

import { useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import { countryMarketWeights, type CountryWeight, type OverviewWindow } from '@/components/overview/aggregate';
import type { SheetPayload } from '@/lib/sheets/types';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

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

export function CoreMarketCountries({ data, limit = 15 }: Props) {
  const [metric, setMetric] = useState<Metric>('users');
  const [window, setWindow] = useState<OverviewWindow>('L30');

  const { rows, totalCountries, effWindow } = useMemo(
    () => countryMarketWeights(data, window),
    [data, window],
  );

  const shown = useMemo(() => {
    const share = (r: CountryWeight) => (metric === 'users' ? r.usersShare : r.getAppShare);
    return [...rows].sort((a, b) => share(b) - share(a)).slice(0, limit);
  }, [rows, metric, limit]);

  if (rows.length === 0) return null;
  const share = (r: CountryWeight) => (metric === 'users' ? r.usersShare : r.getAppShare);
  const value = (r: CountryWeight) => (metric === 'users' ? r.users : r.getApp);
  const delta = (r: CountryWeight) => (metric === 'users' ? r.deltaUsersPct : r.deltaGetAppPct);
  const maxShare = shown.reduce((m, r) => Math.max(m, share(r)), 0);
  const shownShare = shown.reduce((s, r) => s + share(r), 0);
  const unit = metric === 'users' ? 'users' : 'install';
  const fellBack = effWindow !== window;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-indigo-600" />
              Core market — quốc gia &amp; trọng số
            </h2>
            <p className="text-[11px] text-slate-500">
              Top {shown.length} nước theo {metric === 'users' ? 'Users' : 'Install'} · trọng số = share · top{' '}
              {shown.length} chiếm {(shownShare * 100).toFixed(0)}% / {totalCountries} nước
              {fellBack && <span className="text-amber-600"> · country data theo {effWindow}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
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
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
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
                className={cn('px-2 py-0.5 font-medium transition border-l border-slate-200', metric === 'install' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
              >
                Install
              </button>
            </div>
          </div>
        </div>
        <ol className="space-y-1.5">
          {shown.map((r, i) => (
            <li key={r.country} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-right font-mono text-[10px] text-slate-400 shrink-0">{i + 1}.</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-800 truncate">{r.country}</span>
                  <span className="font-mono tabular-nums text-[12px] font-semibold text-indigo-700 shrink-0">
                    {(share(r) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full"
                    style={{ width: `${maxShare > 0 ? (share(r) / maxShare) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 w-24 text-right font-mono tabular-nums text-[11px] text-slate-500">
                {formatNumber(value(r), { compact: true })} {unit}
                <span className={cn('ml-1', deltaCls(delta(r)))}>{fmtDelta(delta(r))}</span>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-[10px] text-slate-400 border-t pt-2">
          ⓘ Trọng số = share của <b>{metric === 'users' ? 'Users (nhu cầu)' : 'Install'}</b> theo nước, trong window đã chọn.
          {fellBack && ` Country_${window} chưa có data → dùng ${effWindow}.`} Đây là phân rã thị trường theo quốc gia;{' '}
          <b>verdict</b> Market Health tính trên rổ <b>keyword</b> (Dynamic basket). % = thay đổi vs kỳ trước.
        </p>
      </CardContent>
    </Card>
  );
}
