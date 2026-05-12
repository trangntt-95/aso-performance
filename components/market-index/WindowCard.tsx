'use client';

import { ArrowDown, ArrowUp, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { verdictStyle } from '@/lib/utils/colors';
import { formatDeltaPct, deltaTone } from '@/lib/utils/format';
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
  const toneColor = tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-red-700' : 'text-gray-500';

  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-gray-500">{label}</span>
      <span className={cn('inline-flex items-center gap-0.5 font-medium', toneColor)}>
        <Arrow className="h-3 w-3" />
        {formatDeltaPct(value)}
      </span>
    </div>
  );
}

export function WindowCard({ row, isSelected, onClick }: Props) {
  const v = verdictStyle(row.verdict);
  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition border-2',
        isSelected ? 'border-gray-900 shadow-md' : 'border-transparent hover:border-gray-300',
      )}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-gray-500">{row.window}</span>
        </div>
        <div
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-[11px]',
            v.bg,
            v.text,
            v.bold && 'font-bold',
          )}
          title={row.verdict}
        >
          <span className="truncate max-w-[8.5rem]">{row.verdict}</span>
        </div>
        <div className="space-y-0.5">
          <DeltaLine label="Δ Users" value={row.deltaUsersPct} />
          <DeltaLine label="Δ GetApp" value={row.deltaGetAppPct} />
          <DeltaLine label="Δ Weighted" value={row.deltaWeightedPct} />
        </div>
        {row.primaryCause && (
          <div
            className="text-[10px] text-gray-600 leading-snug border-t pt-1.5 line-clamp-2"
            title={row.primaryCause}
          >
            {row.primaryCause}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
