'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FunnelBreakdown as FunnelData } from '@/lib/sheets/types';
import { formatNumber, formatPercent, formatPos } from '@/lib/utils/format';

function cellDelta(latest: number, prior: number, threshold = 0.1): 'sig-up' | 'sig-down' | null {
  if (!Number.isFinite(latest) || !Number.isFinite(prior)) return null;
  if (prior === 0) return null;
  const ratio = (latest - prior) / Math.abs(prior);
  if (Math.abs(ratio) < threshold) return null;
  return ratio > 0 ? 'sig-up' : 'sig-down';
}

// Position is inverted — a lower number (rank closer to #1) is better.
function posTone(latest: number | null, prior: number | null): 'sig-up' | 'sig-down' | null {
  if (latest == null || prior == null || latest === prior) return null;
  return latest < prior ? 'sig-up' : 'sig-down';
}

// One chronological cell: prior (muted) → latest (coloured by tone).
function TimeCell({
  prior,
  latest,
  tone,
  fmt,
  empty,
}: {
  prior: number | null;
  latest: number | null;
  tone: 'sig-up' | 'sig-down' | null;
  fmt: (n: number | null) => string;
  empty?: boolean;
}) {
  if (empty) return <td className="px-3 py-2 text-center text-slate-300">—</td>;
  const latestCls =
    tone === 'sig-up'
      ? 'text-emerald-700 font-semibold'
      : tone === 'sig-down'
        ? 'text-red-700 font-semibold'
        : 'text-slate-900 font-medium';
  return (
    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
      <span className="text-slate-400">{fmt(prior)}</span>
      <span className="text-slate-300 mx-1">→</span>
      <span className={latestCls}>{fmt(latest)}</span>
    </td>
  );
}

interface Props {
  funnel: FunnelData | undefined;
}

export function FunnelBreakdownCard({ funnel }: Props) {
  if (!funnel) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-slate-500">
          No funnel data for this window.
        </CardContent>
      </Card>
    );
  }

  const { organic, paid, total, window: w } = funnel;

  const usersTone = {
    org: cellDelta(organic.L.users, organic.P.users),
    paid: cellDelta(paid.L.users, paid.P.users),
    total: cellDelta(total.L.users, total.P.users),
  };
  const getAppTone = {
    org: cellDelta(organic.L.getapp, organic.P.getapp),
    paid: cellDelta(paid.L.getapp, paid.P.getapp),
    total: cellDelta(total.L.getapp, total.P.getapp),
  };
  const crTone = {
    org: cellDelta(organic.L.cr, organic.P.cr, 0.03),
    paid: cellDelta(paid.L.cr, paid.P.cr, 0.03),
  };

  const numFmt = (n: number | null) => formatNumber(n ?? 0, { compact: true });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Funnel Breakdown · {w}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Metric</th>
                <th className="px-3 py-2 text-right font-medium">Organic</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
              <tr className="text-[10px] text-slate-400">
                <th />
                <th className="px-3 pb-1 text-right font-normal" colSpan={3}>
                  mỗi ô: kỳ trước → kỳ này
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">Users</td>
                <TimeCell prior={organic.P.users} latest={organic.L.users} tone={usersTone.org} fmt={numFmt} />
                <TimeCell prior={paid.P.users} latest={paid.L.users} tone={usersTone.paid} fmt={numFmt} />
                <TimeCell prior={total.P.users} latest={total.L.users} tone={usersTone.total} fmt={numFmt} />
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">Install</td>
                <TimeCell prior={organic.P.getapp} latest={organic.L.getapp} tone={getAppTone.org} fmt={numFmt} />
                <TimeCell prior={paid.P.getapp} latest={paid.L.getapp} tone={getAppTone.paid} fmt={numFmt} />
                <TimeCell prior={total.P.getapp} latest={total.L.getapp} tone={getAppTone.total} fmt={numFmt} />
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">CR</td>
                <TimeCell prior={organic.P.cr} latest={organic.L.cr} tone={crTone.org} fmt={formatPercent} />
                <TimeCell prior={paid.P.cr} latest={paid.L.cr} tone={crTone.paid} fmt={formatPercent} />
                <TimeCell prior={null} latest={null} tone={null} fmt={numFmt} empty />
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">Avg Pos</td>
                <TimeCell prior={organic.P.pos} latest={organic.L.pos} tone={posTone(organic.L.pos, organic.P.pos)} fmt={formatPos} />
                <TimeCell prior={paid.P.pos} latest={paid.L.pos} tone={posTone(paid.L.pos, paid.P.pos)} fmt={formatPos} />
                <TimeCell prior={null} latest={null} tone={null} fmt={numFmt} empty />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
          Mỗi ô: <span className="text-slate-500">kỳ trước</span> → <span className="text-slate-700 font-medium">kỳ này</span> ·
          số kỳ này tô màu khi đổi ≥10% (CR 3pp) · xanh = tốt lên, đỏ = xấu đi (Avg Pos: nhỏ hơn = tốt hơn)
        </div>
      </CardContent>
    </Card>
  );
}
