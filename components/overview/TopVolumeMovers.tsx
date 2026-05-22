'use client';

import { TrendingUp, TrendingDown, Leaf, DollarSign, Lightbulb, Target } from 'lucide-react';
import type { VolumeMover } from './aggregate';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { actionCopy } from '@/lib/utils/copy';
import { formatNumber, formatPos } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

function pct(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${(p * 100).toFixed(0)}%`;
}

interface Diagnosis {
  changes: { label: string; value: string; tone: 'pos' | 'neg' | 'flat' }[];
  cause: string;
}

function tone(delta: number | null | undefined, posIsBad = false): 'pos' | 'neg' | 'flat' {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return 'flat';
  if (Math.abs(delta) < 0.03) return 'flat';
  if (posIsBad) return delta > 0 ? 'neg' : 'pos';
  return delta > 0 ? 'pos' : 'neg';
}

function diagnose(m: VolumeMover): Diagnosis {
  const changes: Diagnosis['changes'] = [];
  changes.push({ label: 'Users', value: pct(m.deltaUsersPct), tone: tone(m.deltaUsersPct) });
  if (m.deltaGetAppPct !== null) {
    changes.push({ label: 'Installs', value: pct(m.deltaGetAppPct), tone: tone(m.deltaGetAppPct) });
  }
  if (m.deltaCrPct !== null) {
    changes.push({ label: 'CR', value: pct(m.deltaCrPct), tone: tone(m.deltaCrPct) });
  }
  let posDiff: number | null = null;
  if (m.posL !== null && m.posP !== null) {
    posDiff = m.posL - m.posP;
    if (Math.abs(posDiff) >= 0.5) {
      const sign = posDiff > 0 ? '↓' : '↑';
      changes.push({
        label: 'Rank',
        value: `${sign}${Math.abs(posDiff).toFixed(1)} bậc`,
        tone: posDiff > 0 ? 'neg' : 'pos',
      });
    }
  }

  const up = m.direction === 'up';
  const dUsers = m.deltaUsersPct;
  const dCr = m.deltaCrPct ?? 0;
  const posDrop = posDiff !== null && posDiff >= 2;
  const posLift = posDiff !== null && posDiff <= -2;
  const crDrop = dCr < -0.05;
  const crLift = dCr > 0.05;
  const usersFlat = Math.abs(dUsers) < 0.05;

  let cause = '';
  if (up) {
    if (posLift) cause = `Rank cải thiện ${Math.abs(posDiff!).toFixed(1)} bậc → impression tăng → users + installs tăng`;
    else if (crLift && usersFlat) cause = 'Users ổn định, CR cải thiện → installs lên dù demand ko đổi';
    else if (crLift) cause = 'Cả demand và CR cùng tăng';
    else if (m.surface === 'paid') cause = 'Pace ads tăng (bid/budget?). Rank không đổi đáng kể';
    else cause = 'Search demand tăng tự nhiên';
  } else {
    if (posDrop && crDrop) cause = `Rank tụt ${Math.abs(posDiff!).toFixed(1)} bậc + CR rớt → double hit`;
    else if (posDrop) cause = `Rank tụt ${Math.abs(posDiff!).toFixed(1)} bậc → impression giảm → users giảm`;
    else if (crDrop && usersFlat) cause = 'Users gần ko đổi, CR rớt → listing/page conversion issue';
    else if (crDrop) cause = 'Demand giảm + CR rớt';
    else if (m.surface === 'paid') cause = 'Có thể giảm bid/budget hoặc đối thủ outbid (rank ổn)';
    else cause = 'Demand giảm tự nhiên (rank + CR vẫn ổn)';
  }
  return { changes, cause };
}

function toneCls(t: 'pos' | 'neg' | 'flat'): string {
  if (t === 'pos') return 'text-emerald-700';
  if (t === 'neg') return 'text-rose-700';
  return 'text-slate-700';
}

function MetricPair({
  label,
  prior,
  latest,
  delta,
  t,
}: {
  label: string;
  prior: string;
  latest: string;
  delta: string | null;
  t: 'pos' | 'neg' | 'flat';
}) {
  return (
    <span>
      <span className="text-slate-500">{label}:</span>{' '}
      <span className="font-mono text-slate-500">{prior}</span>
      <span className="text-slate-400 mx-0.5">→</span>
      <span className={cn('font-mono font-medium', toneCls(t))}>{latest}</span>
      {delta && (
        <>
          {' '}
          <span className={cn('text-[11px]', toneCls(t))}>({delta})</span>
        </>
      )}
    </span>
  );
}

function deriveAction(m: VolumeMover): string {
  if (m.bidAction) return actionCopy(m.bidAction);
  if (m.direction === 'up') {
    if (m.surface === 'paid') return 'Scale / tăng bid để chiếm thêm share';
    return 'Theo dõi, cân nhắc mở camp paid để bắt sóng';
  }
  if (m.posL !== null && m.posP !== null && m.posL > m.posP) {
    return 'Audit rank — có thể đối thủ outbid';
  }
  return 'Kiểm tra listing / CR — volume rớt bất thường';
}

function MoverRow({
  m,
  isActive,
  activeSurface,
  activeCountry,
  onRowClick,
}: {
  m: VolumeMover;
  isActive: boolean;
  activeSurface?: 'all' | 'organic' | 'paid';
  activeCountry?: string | null;
  onRowClick?: (kw: string) => void;
}) {
  const up = m.direction === 'up';
  const accent = up ? 'bg-emerald-500' : 'bg-rose-500';
  const deltaCls = up ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50';
  const Icon = up ? TrendingUp : TrendingDown;
  const diag = diagnose(m);

  return (
    <article
      onClick={() => onRowClick && onRowClick(m.keyword)}
      className={cn(
        'relative px-3 py-2.5 transition',
        onRowClick && 'cursor-pointer',
        isActive ? 'bg-violet-50 ring-1 ring-violet-300' : 'hover:bg-slate-50/60',
      )}
      title={onRowClick ? 'Click to filter page by this keyword' : undefined}
    >
      <span className={cn('absolute left-0 top-0 bottom-0 w-1', accent)} aria-hidden />
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums shrink-0',
            deltaCls,
          )}
        >
          <Icon className="h-3 w-3" />
          {pct(m.deltaUsersPct)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <KeywordLink
              keyword={m.keyword}
              country={activeCountry ?? (m.country !== '(global)' ? m.country : undefined)}
              surface={activeSurface ?? (m.surface as 'organic' | 'paid')}
              className="font-semibold text-[13px]"
            />
            <CategoryChip category={m.category} compact />
            <span className="text-[10px] text-slate-500">{m.country}</span>
          </div>

          {/* Số liệu: abs → abs (delta %) cho từng metric */}
          <div className="mt-1 text-[12px] text-slate-700 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
            <MetricPair label="Users" prior={formatNumber(m.usersP)} latest={formatNumber(m.usersL)} delta={pct(m.deltaUsersPct)} t={tone(m.deltaUsersPct)} />
            {(m.getAppP > 0 || m.getAppL > 0) && (
              <MetricPair
                label="GetApp"
                prior={formatNumber(m.getAppP)}
                latest={formatNumber(m.getAppL)}
                delta={m.deltaGetAppPct !== null ? pct(m.deltaGetAppPct) : null}
                t={m.deltaGetAppPct !== null ? tone(m.deltaGetAppPct) : 'flat'}
              />
            )}
            {m.crP !== null && m.crL !== null && (
              <MetricPair
                label="CR"
                prior={`${(m.crP * 100).toFixed(1)}%`}
                latest={`${(m.crL * 100).toFixed(1)}%`}
                delta={m.deltaCrPct !== null ? pct(m.deltaCrPct) : null}
                t={m.deltaCrPct !== null ? tone(m.deltaCrPct) : 'flat'}
              />
            )}
            {m.posL !== null && m.posP !== null && (
              <MetricPair
                label="Rank"
                prior={formatPos(m.posP)}
                latest={formatPos(m.posL)}
                delta={null}
                t={tone(m.posL - m.posP, true)}
              />
            )}
          </div>

          {/* Insight: phân loại nguyên nhân */}
          <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-700">
            <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
            <span className="flex-1">{diag.cause}</span>
          </div>

          {/* Hành động */}
          <div className="mt-0.5 flex items-start gap-1.5 text-[12px]">
            <Target className={cn('h-3 w-3 mt-0.5 shrink-0', up ? 'text-emerald-600' : 'text-rose-600')} />
            <span className="flex-1">
              <span className={cn('font-semibold', up ? 'text-emerald-700' : 'text-rose-700')}>
                {deriveAction(m)}
              </span>
              {m.bidSuggest && m.bidSuggest !== '—' && (
                <span className="ml-2 text-slate-600 font-mono text-[11px]">Bid {m.bidSuggest}</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

interface VolumeMoversProps {
  organic: VolumeMover[];
  paid: VolumeMover[];
  activeKeyword?: string | null;
  activeSurface?: 'all' | 'organic' | 'paid';
  activeCountry?: string | null;
  onRowClick?: (keyword: string) => void;
}

function ColumnHeader({
  title,
  Icon,
  iconCls,
  count,
}: {
  title: string;
  Icon: typeof Leaf;
  iconCls: string;
  count: number;
}) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 border-b bg-slate-50/60', iconCls)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold">{title}</span>
      <span className="text-[10px] text-slate-500 ml-auto">{count} kw</span>
    </div>
  );
}

export function TopVolumeMovers({
  organic,
  paid,
  activeKeyword,
  activeSurface,
  activeCountry,
  onRowClick,
}: VolumeMoversProps) {
  if (organic.length === 0 && paid.length === 0) {
    return (
      <div className="border rounded-lg bg-white py-4 text-center text-xs text-slate-500">
        Không có keyword nào biến động đủ mạnh để flag.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="border rounded-lg overflow-hidden bg-white">
        <ColumnHeader title="Organic" Icon={Leaf} iconCls="text-emerald-700" count={organic.length} />
        {organic.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">Không có kw organic biến động.</div>
        ) : (
          <div className="divide-y">
            {organic.map((m, i) => (
              <MoverRow
                key={`${m.keyword}-${m.country}-${i}`}
                m={m}
                isActive={activeKeyword?.toLowerCase() === m.keyword.toLowerCase()}
                activeSurface={activeSurface}
                activeCountry={activeCountry}
                onRowClick={onRowClick}
              />
            ))}
          </div>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        <ColumnHeader title="Paid (Ads)" Icon={DollarSign} iconCls="text-amber-700" count={paid.length} />
        {paid.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">Không có kw paid biến động.</div>
        ) : (
          <div className="divide-y">
            {paid.map((m, i) => (
              <MoverRow
                key={`${m.keyword}-${m.country}-${i}`}
                m={m}
                isActive={activeKeyword?.toLowerCase() === m.keyword.toLowerCase()}
                activeSurface={activeSurface}
                activeCountry={activeCountry}
                onRowClick={onRowClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
