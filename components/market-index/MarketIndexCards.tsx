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
import { deriveNarrativeEvidence } from '@/lib/market/narrativeEvidence';
import { accountFunnel, accountTotals } from '@/lib/market/accountAggregates';
import type { KeywordRow, Window } from '@/lib/sheets/types';

// Selected window → the matching All_* keyword rows for that window.
const WINDOW_ROWS: Record<string, (d: { allL3: KeywordRow[]; allL7: KeywordRow[]; allL14: KeywordRow[]; allL30: KeywordRow[]; allL90: KeywordRow[] }) => KeywordRow[]> = {
  L3: (d) => d.allL3,
  L7: (d) => d.allL7,
  L14: (d) => d.allL14,
  L30: (d) => d.allL30,
  L90: (d) => d.allL90,
};

export function MarketIndexCards() {
  const { data, isLoading, error } = useSheetData();
  const [selected, setSelected] = useState<Window | null>('L7');

  const market = data?.marketIndex;
  const narratives = market?.narratives ?? {};

  // Window cards: keep the sheet's core (weighted) verdict + cause prose, but
  // override Users/Install deltas with whole-account numbers (All_Lx) so they
  // match Overview instead of the core-basket subset.
  const summary = useMemo(() => {
    const rows = market?.summary ?? [];
    if (!data) return rows;
    return rows.map((r) => {
      const acc = accountTotals(data, r.window);
      return { ...r, deltaUsersPct: acc.deltaUsersPct, deltaGetAppPct: acc.deltaGetAppPct };
    });
  }, [market, data]);

  const selectedRow = useMemo(
    () => summary.find((s) => s.window === selected),
    [summary, selected],
  );
  // Funnel + narrative data line recomputed from All_Lx (all keywords).
  const selectedFunnel = useMemo(
    () => (data && selected ? accountFunnel(data, selected) : undefined),
    [data, selected],
  );
  const selectedTotals = useMemo(
    () => (data && selected ? accountTotals(data, selected) : null),
    [data, selected],
  );

  // WoW card (L7 vs P7): override Users/Install with whole-account totals
  // (All_L7) so it matches Overview instead of the sheet's GA account total.
  const wow = useMemo(() => {
    const raw = market?.wow ?? [];
    if (!data || raw.length === 0) return raw;
    const acc = accountTotals(data, 'L7');
    return raw.map((m) => {
      if (/install/i.test(m.metric)) {
        return { ...m, thisPeriod: acc.getAppL, lastPeriod: acc.getAppP, deltaValue: acc.getAppL - acc.getAppP, deltaPct: acc.deltaGetAppPct };
      }
      if (/user/i.test(m.metric)) {
        return { ...m, thisPeriod: acc.usersL, lastPeriod: acc.usersP, deltaValue: acc.usersL - acc.usersP, deltaPct: acc.deltaUsersPct };
      }
      return m;
    });
  }, [market, data]);

  // Concrete keyword examples backing the narrative's cause/action.
  const evidence = useMemo(() => {
    if (!data || !selected || !selectedRow) return null;
    const getRows = WINDOW_ROWS[selected];
    if (!getRows) return null;
    const cause = `${selectedRow.primaryCause} ${selectedRow.causeDetails}`;
    return deriveNarrativeEvidence(getRows(data), cause);
  }, [data, selected, selectedRow]);

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

      {!isLoading && wow.length > 0 && <WowComparison data={wow} />}

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
            evidence={evidence}
            dataOverride={selectedTotals}
          />
        </div>
      )}

      {!isLoading && market?.basket && market.basket.length > 0 && (
        <DynamicBasketCard data={market.basket} />
      )}
    </div>
  );
}
