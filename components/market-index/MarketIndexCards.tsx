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
import { CoreMarketCountries } from './CoreMarketCountries';
import { WeightMismatchNote } from './WeightMismatchNote';
import { Skeleton } from '@/components/ui/skeleton';
import { deriveNarrativeEvidence } from '@/lib/market/narrativeEvidence';
import { accountFunnel, accountTotals } from '@/lib/market/accountAggregates';
import {
  buildRevenueWeights,
  revenueWeightedBasket,
  revenueWeightedFunnel,
  revenueWeightedStats,
  revenueWeightedWow,
  weightMismatch,
  type WeightedStats,
} from '@/lib/market/revenueWeighting';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { KeywordRow, Window } from '@/lib/sheets/types';

// Selected window → the matching All_* keyword rows for that window.
const WINDOW_ROWS: Record<string, (d: { allL3: KeywordRow[]; allL7: KeywordRow[]; allL14: KeywordRow[]; allL30: KeywordRow[]; allL90: KeywordRow[] }) => KeywordRow[]> = {
  L3: (d) => d.allL3,
  L7: (d) => d.allL7,
  L14: (d) => d.allL14,
  L30: (d) => d.allL30,
  L90: (d) => d.allL90,
};

// Cả trang chạy trên một trong hai cách cân, đổi bằng một công tắc duy nhất.
//
// Trang này trước đây cân theo users: mỗi user tính như nhau bất kể ở nước nào.
// Nay mặc định cân theo doanh thu — nước nào sinh tiền thì nặng. Cách cũ vẫn
// giữ lại vì nó trả lời một câu hỏi khác (có bao nhiêu người đang tìm), và vì
// bỏ hẳn thì không ai đối chiếu được số mới với số tuần trước.
//
// Một công tắc cho cả trang thay vì một công tắc mỗi card: nếu mỗi bảng cân một
// kiểu thì hai bảng cạnh nhau sẽ nói hai chuyện khác nhau mà không ai biết.
type Basis = 'revenue' | 'raw';

const WINDOWS: Window[] = ['L3', 'L7', 'L14', 'L30', 'L90'];

export function MarketIndexCards() {
  const { data, isLoading, error } = useSheetData();
  const [selected, setSelected] = useState<Window | null>('L7');
  const [basis, setBasis] = useState<Basis>('revenue');

  const market = data?.marketIndex;
  const narratives = market?.narratives ?? {};

  const weights = useMemo(() => buildRevenueWeights(data), [data]);
  const byRevenue = basis === 'revenue' && !!weights;

  // Chỉ số cân theo doanh thu cho từng window, tính một lần.
  const weighted = useMemo(() => {
    const m = new Map<Window, WeightedStats>();
    if (!data || !weights) return m;
    for (const w of WINDOWS) m.set(w, revenueWeightedStats(data, w, 'all', weights));
    return m;
  }, [data, weights]);

  const mismatch = useMemo(
    () => (data && weights ? weightMismatch(data, 'L90', weights) : null),
    [data, weights],
  );

  // Window cards: giữ verdict + prose của sheet, nhưng số Users/Install lấy
  // theo cách cân đang chọn — thô thì từ All_Lx (khớp Overview), cân doanh thu
  // thì từ Country_Lx nhân share doanh thu của nước.
  const summary = useMemo(() => {
    const rows = market?.summary ?? [];
    if (!data) return rows;
    return rows.map((r) => {
      const acc = accountTotals(data, r.window);
      const wgt = weighted.get(r.window);
      if (!byRevenue || !wgt || wgt.unavailable) {
        return { ...r, deltaUsersPct: acc.deltaUsersPct, deltaGetAppPct: acc.deltaGetAppPct };
      }
      return {
        ...r,
        deltaUsersPct: wgt.deltaIndexPct ?? 0,
        deltaGetAppPct: wgt.deltaInstallPct ?? 0,
        // Verdict so chỉ số cân tiền với tổng thô: lệch nhau nghĩa là mức
        // giảm/tăng đang dồn vào (hoặc tránh) đúng những nước sinh tiền.
        deltaWeightedPct: wgt.deltaIndexPct ?? 0,
      };
    });
  }, [market, data, weighted, byRevenue]);

  const selectedRow = useMemo(
    () => summary.find((s) => s.window === selected),
    [summary, selected],
  );
  const selectedWeighted = selected ? weighted.get(selected) : undefined;

  const selectedFunnel = useMemo(() => {
    if (!data || !selected) return undefined;
    if (byRevenue) return revenueWeightedFunnel(data, selected, weights) ?? undefined;
    return accountFunnel(data, selected);
  }, [data, selected, byRevenue, weights]);

  const selectedTotals = useMemo(
    () => (data && selected ? accountTotals(data, selected) : null),
    [data, selected],
  );

  // WoW card (L7 vs P7): cân doanh thu thì thay bằng chỉ số cân; còn không thì
  // vẫn override Users/Install bằng tổng toàn account như trước.
  const wow = useMemo(() => {
    const rows = market?.wow ?? [];
    if (!data) return rows;
    if (byRevenue) {
      const rw = revenueWeightedWow(data, weights);
      return rw.length > 0 ? rw : rows;
    }
    const acc = accountTotals(data, 'L7');
    return rows.map((m) => {
      if (/install/i.test(m.metric)) {
        return {
          ...m,
          thisPeriod: acc.getAppL,
          lastPeriod: acc.getAppP,
          deltaValue: acc.getAppL - acc.getAppP,
          deltaPct: acc.deltaGetAppPct,
        };
      }
      if (/user/i.test(m.metric)) {
        return {
          ...m,
          thisPeriod: acc.usersL,
          lastPeriod: acc.usersP,
          deltaValue: acc.usersL - acc.usersP,
          deltaPct: acc.deltaUsersPct,
        };
      }
      return m;
    });
  }, [market, data, byRevenue, weights]);

  // Concrete keyword examples backing the narrative's cause/action.
  const evidence = useMemo(() => {
    if (!data || !selected || !selectedRow) return null;
    const getRows = WINDOW_ROWS[selected];
    if (!getRows) return null;
    const cause = `${selectedRow.primaryCause} ${selectedRow.causeDetails}`;
    return deriveNarrativeEvidence(getRows(data), cause);
  }, [data, selected, selectedRow]);

  const basket = useMemo(() => {
    if (!byRevenue || !data) return undefined;
    return revenueWeightedBasket(data, 'L90', 10, weights);
  }, [byRevenue, data, weights]);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-center gap-2 text-rose-700">
          <AlertCircle className="h-4 w-4" />
          <div className="font-semibold">Couldn’t load Market Health</div>
        </div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {!isLoading && weights && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="min-w-0 text-[11px] leading-snug text-slate-500">
              {byRevenue ? (
                <>
                  Mọi số dưới đây cân theo <b>doanh thu của nước</b> sinh ra nó · {weights.count}{' '}
                  nước có doanh thu
                  {weights.period ? ` (${weights.period})` : ''}
                  {weights.top && (
                    <>
                      {' · '}
                      <span title={`Doanh thu $${formatNumber(Math.round(weights.top.revenue))}`}>
                        {weights.top.country} nặng nhất ({(weights.top.share * 100).toFixed(0)}%)
                      </span>
                    </>
                  )}
                </>
              ) : (
                <>
                  Đang cân <b>thô</b>: mỗi user tính như nhau, kể cả nước không sinh doanh thu.
                </>
              )}
            </div>
            <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-slate-200 text-[11px]">
              <button
                type="button"
                onClick={() => setBasis('revenue')}
                title="Cân theo share doanh thu của nước trong PerGeo_CPI_Cap"
                className={cn(
                  'px-2 py-0.5 font-medium transition',
                  byRevenue ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                Cân doanh thu
              </button>
              <button
                type="button"
                onClick={() => setBasis('raw')}
                title="Đếm users/install thô, không cân"
                className={cn(
                  'border-l border-slate-200 px-2 py-0.5 font-medium transition',
                  !byRevenue ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                Thô
              </button>
            </div>
          </div>
          {byRevenue && <WeightMismatchNote report={mismatch} />}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        market?.executiveSummary && <ExecutiveSummaryCard data={market.executiveSummary} />
      )}

      {!isLoading && wow.length > 0 && <WowComparison data={wow} weighted={byRevenue} />}

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Verdict by window</h2>
          <p className="text-[11px] text-slate-500">
            {byRevenue
              ? 'Δ là chỉ số cân theo doanh thu — bấm vào window để xem funnel + narrative'
              : 'Tap a window to inspect funnel breakdown + Vietnamese narrative'}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)
            : summary.map((row) => (
                <WindowCard
                  key={row.window}
                  row={row}
                  weighted={byRevenue ? weighted.get(row.window) : undefined}
                  isSelected={selected === row.window}
                  onClick={() => setSelected((s) => (s === row.window ? null : row.window))}
                />
              ))}
        </div>
      </section>

      {selected && selectedRow && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FunnelBreakdownCard
            funnel={selectedFunnel}
            weighted={byRevenue}
            stats={byRevenue ? selectedWeighted : undefined}
          />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!isLoading && (
          <DynamicBasketCard data={market?.basket ?? []} weighted={basket} period={weights?.period} />
        )}
        {!isLoading && <CoreMarketCountries data={data} basis={byRevenue ? 'revenue' : 'users'} />}
      </div>
    </div>
  );
}
