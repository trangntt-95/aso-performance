'use client';

import { useState, useMemo } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { WindowCard } from './WindowCard';
import { FunnelBreakdownCard } from './FunnelBreakdown';
import { NarrativePanel } from './NarrativePanel';
import { Skeleton } from '@/components/ui/skeleton';
import type { Window } from '@/lib/sheets/types';
import { AlertCircle } from 'lucide-react';

export function MarketIndexCards() {
  const { data, isLoading, error } = useSheetData();
  const [selected, setSelected] = useState<Window | null>(null);

  const summary = useMemo(() => data?.marketIndex.summary ?? [], [data]);
  const funnels = useMemo(() => data?.marketIndex.funnels ?? [], [data]);
  const narratives = data?.marketIndex.narratives ?? {};

  const selectedRow = useMemo(
    () => summary.find((s) => s.window === selected),
    [summary, selected],
  );
  const selectedFunnel = useMemo(
    () => funnels.find((f) => f.window === selected),
    [funnels, selected],
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <div className="font-semibold">Couldn’t load Market Index</div>
        <div className="text-sm text-gray-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-1">Market Health</h2>
        <p className="text-xs text-gray-500">Tap a window to inspect funnel and narrative.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)
          : summary.map((row) => (
              <WindowCard
                key={row.window}
                row={row}
                isSelected={selected === row.window}
                onClick={() => setSelected((s) => (s === row.window ? null : row.window))}
              />
            ))}
      </div>
      {selected && selectedRow && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FunnelBreakdownCard funnel={selectedFunnel} />
          <NarrativePanel
            window={selected}
            narrative={narratives[selected]}
            primaryCause={selectedRow.primaryCause}
            causeDetails={selectedRow.causeDetails}
          />
        </div>
      )}
    </div>
  );
}
