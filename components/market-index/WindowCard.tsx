'use client';

import { ArrowDown, ArrowUp, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDeltaPct, deltaTone, composeVerdict, verdictBadgeStyle } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { MarketIndexSummaryRow } from '@/lib/sheets/types';
import type { WeightedStats } from '@/lib/market/revenueWeighting';

interface Props {
  row: MarketIndexSummaryRow;
  /** Có mặt khi trang đang cân theo doanh thu — Δ trên card là chỉ số cân. */
  weighted?: WeightedStats;
  isSelected: boolean;
  onClick: () => void;
}

function DeltaLine({ label, value }: { label: string; value: number | null | undefined }) {
  const tone = deltaTone(value);
  const Arrow = tone === 'pos' ? ArrowUp : tone === 'neg' ? ArrowDown : ArrowRight;
  const toneColor =
    tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-rose-700' : 'text-slate-500';

  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className={cn('inline-flex items-center gap-0.5 font-medium', toneColor)}>
        <Arrow className="h-3 w-3" />
        {formatDeltaPct(value)}
      </span>
    </div>
  );
}

const rawDelta = (l: number, p: number): number | null => (p > 0 ? (l - p) / p : null);

export function WindowCard({ row, weighted, isSelected, onClick }: Props) {
  const verdict = composeVerdict(row.deltaWeightedPct, row.deltaUsersPct);
  const v = verdictBadgeStyle(verdict);
  // Coverage thấp nghĩa là phần lớn traffic nằm ở nước không có doanh thu, nên
  // Δ ở đây chỉ nói về phần nhỏ có tiền — nói ra, chứ không tô như số chắc.
  const thin = !!weighted && !weighted.unavailable && !weighted.reliable;
  const noWeight = !!weighted && weighted.unavailable;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition border-2',
        isSelected ? 'border-slate-900 shadow-md' : 'border-transparent hover:border-slate-300',
      )}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-slate-500">{row.window}</span>
          {weighted && !weighted.unavailable && (
            <span
              className={cn('font-mono text-[9px]', thin ? 'text-amber-600' : 'text-slate-400')}
              title={
                `${Math.round(weighted.coverage * 100)}% users trong Country_${row.window} nằm ở nước có doanh thu` +
                (thin ? ' — Δ chỉ nói về phần đó' : '') +
                (weighted.tabCoverage !== null
                  ? `. Tab đó có ${Math.round(weighted.tabCoverage * 100)}% users của All_${row.window}.`
                  : '')
              }
            >
              phủ {Math.round(weighted.coverage * 100)}%
            </span>
          )}
        </div>
        <div
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-[11px] leading-tight',
            v.bg,
            v.text,
            v.bold && 'font-bold',
          )}
          title={
            weighted
              ? 'Verdict tính trên chỉ số cân theo doanh thu của nước'
              : 'Core = position-weighted basket · Total = raw user count'
          }
        >
          <span>{verdict.label}</span>
        </div>
        {noWeight ? (
          <div className="text-[10px] leading-snug text-slate-400">
            Không có tab <code className="text-[9px]">Country_{row.window}</code> → không cân được
            theo doanh thu ở window này.
          </div>
        ) : (
          <div className="space-y-0.5">
            <DeltaLine label={weighted ? 'Δ Users (cân)' : 'Δ Users'} value={row.deltaUsersPct} />
            <DeltaLine
              label={weighted ? 'Δ Install (cân)' : 'Δ Install'}
              value={row.deltaGetAppPct}
            />
            {weighted && (
              <div
                className="flex items-center justify-between pt-0.5 text-[9.5px] text-slate-400"
                title="Cùng dữ liệu Country_Lx nhưng không cân — mỗi user tính như nhau"
              >
                <span>thô</span>
                <span className="font-mono">
                  {formatDeltaPct(rawDelta(weighted.rawUsersL, weighted.rawUsersP))} ·{' '}
                  {formatDeltaPct(rawDelta(weighted.rawInstallL, weighted.rawInstallP))}
                </span>
              </div>
            )}
          </div>
        )}
        {row.primaryCause && (
          <div
            className="text-[10px] text-slate-600 leading-snug border-t pt-1.5 line-clamp-2"
            title={row.primaryCause}
          >
            {row.primaryCause}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
