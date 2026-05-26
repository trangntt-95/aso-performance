'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FunnelBreakdown as FunnelData } from '@/lib/sheets/types';
import { formatNumber, formatPercent, formatPos, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

function cellDelta(latest: number, prior: number, threshold = 0.1): 'sig-up' | 'sig-down' | null {
  if (!Number.isFinite(latest) || !Number.isFinite(prior)) return null;
  if (prior === 0) return null;
  const ratio = (latest - prior) / Math.abs(prior);
  if (Math.abs(ratio) < threshold) return null;
  return ratio > 0 ? 'sig-up' : 'sig-down';
}

function highlightCls(tone: 'sig-up' | 'sig-down' | null) {
  if (tone === 'sig-up') return 'bg-emerald-50 text-emerald-900 font-medium';
  if (tone === 'sig-down') return 'bg-red-50 text-red-900 font-medium';
  return '';
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
                <th className="px-3 py-2 text-right font-medium" colSpan={2}>Organic</th>
                <th className="px-3 py-2 text-right font-medium" colSpan={2}>Paid</th>
                <th className="px-3 py-2 text-right font-medium" colSpan={2}>Total</th>
              </tr>
              <tr className="text-[10px] text-slate-400">
                <th />
                <th className="px-2 py-1 text-right font-normal">L</th>
                <th className="px-2 py-1 text-right font-normal">P</th>
                <th className="px-2 py-1 text-right font-normal">L</th>
                <th className="px-2 py-1 text-right font-normal">P</th>
                <th className="px-2 py-1 text-right font-normal">L</th>
                <th className="px-2 py-1 text-right font-normal">P</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">Users</td>
                <td className={cn('px-2 py-2 text-right', highlightCls(usersTone.org))}>{formatNumber(organic.L.users, { compact: true })}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatNumber(organic.P.users, { compact: true })}</td>
                <td className={cn('px-2 py-2 text-right', highlightCls(usersTone.paid))}>{formatNumber(paid.L.users, { compact: true })}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatNumber(paid.P.users, { compact: true })}</td>
                <td className={cn('px-2 py-2 text-right font-medium', highlightCls(usersTone.total))}>{formatNumber(total.L.users, { compact: true })}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatNumber(total.P.users, { compact: true })}</td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">Install</td>
                <td className={cn('px-2 py-2 text-right', highlightCls(getAppTone.org))}>{formatNumber(organic.L.getapp, { compact: true })}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatNumber(organic.P.getapp, { compact: true })}</td>
                <td className={cn('px-2 py-2 text-right', highlightCls(getAppTone.paid))}>{formatNumber(paid.L.getapp, { compact: true })}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatNumber(paid.P.getapp, { compact: true })}</td>
                <td className={cn('px-2 py-2 text-right font-medium', highlightCls(getAppTone.total))}>{formatNumber(total.L.getapp, { compact: true })}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatNumber(total.P.getapp, { compact: true })}</td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">CR</td>
                <td className={cn('px-2 py-2 text-right', highlightCls(crTone.org))}>{formatPercent(organic.L.cr)}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatPercent(organic.P.cr)}</td>
                <td className={cn('px-2 py-2 text-right', highlightCls(crTone.paid))}>{formatPercent(paid.L.cr)}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatPercent(paid.P.cr)}</td>
                <td className="px-2 py-2 text-right text-slate-300">—</td>
                <td className="px-2 py-2 text-right text-slate-300">—</td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">Avg Pos</td>
                <td className={cn('px-2 py-2 text-right', deltaTone((organic.P.pos ?? 0) - (organic.L.pos ?? 0)) === 'pos' ? 'text-emerald-700 font-medium' : '')}>{formatPos(organic.L.pos)}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatPos(organic.P.pos)}</td>
                <td className={cn('px-2 py-2 text-right', deltaTone((paid.P.pos ?? 0) - (paid.L.pos ?? 0)) === 'pos' ? 'text-emerald-700 font-medium' : '')}>{formatPos(paid.L.pos)}</td>
                <td className="px-2 py-2 text-right text-slate-400">{formatPos(paid.P.pos)}</td>
                <td className="px-2 py-2 text-right text-slate-300">—</td>
                <td className="px-2 py-2 text-right text-slate-300">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
          L = Latest window · P = Prior window · highlighted cells = ≥10% delta (3pp for CR)
        </div>
      </CardContent>
    </Card>
  );
}
