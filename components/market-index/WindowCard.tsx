'use client';

import { ArrowDown, ArrowUp, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDeltaPct, deltaTone, composeVerdict, verdictBadgeStyle } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { MarketIndexSummaryRow } from '@/lib/sheets/types';

interface Props {
  row: MarketIndexSummaryRow;
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

export function WindowCard({ row, isSelected, onClick }: Props) {
  const verdict = composeVerdict(row.deltaWeightedPct, row.deltaUsersPct);
  const v = verdictBadgeStyle(verdict);
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
        </div>
        <div
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-[11px] leading-tight',
            v.bg,
            v.text,
            v.bold && 'font-bold',
          )}
          title="Core = position-weighted basket · Total = raw user count"
        >
          <span>{verdict.label}</span>
        </div>
        <div className="space-y-0.5">
          <DeltaLine label="Δ Users" value={row.deltaUsersPct} />
          <DeltaLine label="Δ Install" value={row.deltaGetAppPct} />
        </div>
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
