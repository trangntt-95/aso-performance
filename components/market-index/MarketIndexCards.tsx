'use client';

import { useState, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { WindowCard } from './WindowCard';
import { FunnelBreakdownCard } from './FunnelBreakdown';
import { NarrativePanel } from './NarrativePanel';
import { ExecutiveSummaryCard } from './ExecutiveSummaryCard';
import { WowComparison } from './WowComparison';
import { DynamicBasketCard } from './DynamicBasketCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { Window } from '@/lib/sheets/types';

export function MarketIndexCards() {
  const { data, isLoading, error } = useSheetData();
  const [selected, setSelected] = useState<Window | null>('L7');

  const market = data?.marketIndex;
  const summary = useMemo(() => market?.summary ?? [], [market]);
  const funnels = useMemo(() => market?.funnels ?? [], [market]);
  const narratives = market?.narratives ?? {};

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
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <div className="font-semibold">Couldn’t load Market Health</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        market?.executiveSummary && <ExecutiveSummaryCard data={market.executiveSummary} />
      )}

      {!isLoading && market?.wow && market.wow.length > 0 && <WowComparison data={market.wow} />}

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Verdict by window</h2>
          <p className="text-[11px] text-slate-500">
            Tap a window to inspect funnel breakdown + Vietnamese narrative
          </p>
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
      </section>

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

      {!isLoading && market?.basket && market.basket.length > 0 && (
        <DynamicBasketCard data={market.basket} />
      )}
    </div>
  );
}
