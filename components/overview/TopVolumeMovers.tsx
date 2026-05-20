'use client';

import { TrendingUp, TrendingDown, Lightbulb, Target } from 'lucide-react';
import type { VolumeMover } from './aggregate';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { alertCopy, actionCopy } from '@/lib/utils/copy';
import { formatNumber, formatPos } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

function deriveAction(m: VolumeMover): string {
  if (m.bidAction) return actionCopy(m.bidAction);
  if (m.direction === 'up') {
    if (m.surface === 'paid') return 'Cân nhắc scale / tăng bid để chiếm thêm share';
    return 'Theo dõi, cân nhắc mở camp paid để bắt sóng';
  }
  if (m.posL !== null && m.posP !== null && m.posL > m.posP) {
    return 'Audit rank — có thể đối thủ đang outbid';
  }
  return 'Kiểm tra listing / CR — volume rớt bất thường';
}

function deltaSign(pct: number): string {
  const v = pct * 100;
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(0)}%`;
}

function posDeltaText(posL: number | null, posP: number | null): string | null {
  if (posL === null || posP === null) return null;
  const diff = posL - posP;
  if (Math.abs(diff) < 0.5) return null;
  const sign = diff > 0 ? 'tụt' : 'lên';
  return `Rank ${sign} ${Math.abs(diff).toFixed(1)} bậc (${formatPos(posP)} → ${formatPos(posL)})`;
}

interface VolumeMoversProps {
  movers: VolumeMover[];
  activeKeyword?: string | null;
  onRowClick?: (keyword: string) => void;
}

export function TopVolumeMovers({ movers, activeKeyword, onRowClick }: VolumeMoversProps) {
  if (movers.length === 0) {
    return (
      <div className="border rounded-lg bg-white py-4 text-center text-xs text-slate-500">
        Không có keyword nào biến động đủ mạnh để flag.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden divide-y bg-white">
      {movers.map((m, i) => {
        const up = m.direction === 'up';
        const accent = up ? 'bg-emerald-500' : 'bg-rose-500';
        const deltaCls = up ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50';
        const Icon = up ? TrendingUp : TrendingDown;
        const posDelta = posDeltaText(m.posL, m.posP);
        const isActive = activeKeyword?.toLowerCase() === m.keyword.toLowerCase();

        return (
          <article
            key={`${m.keyword}-${m.country}-${m.surface}-${i}`}
            onClick={() => onRowClick && onRowClick(m.keyword)}
            className={cn(
              'relative px-4 py-3 transition',
              onRowClick && 'cursor-pointer',
              isActive ? 'bg-violet-50 ring-1 ring-violet-300' : 'hover:bg-slate-50/60',
            )}
            title={onRowClick ? 'Click to filter page by this keyword' : undefined}
          >
            <span className={cn('absolute left-0 top-0 bottom-0 w-1', accent)} aria-hidden />
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold tabular-nums shrink-0',
                  deltaCls,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {deltaSign(m.deltaUsersPct)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <KeywordLink
                    keyword={m.keyword}
                    country={m.country !== '(global)' ? m.country : undefined}
                    className="font-semibold text-sm"
                  />
                  <CategoryChip category={m.category} compact />
                  <span className="text-[11px] text-slate-500">
                    {m.country} · {m.surface}
                  </span>
                </div>

                <div className="mt-1.5 text-[13px] text-slate-700">
                  <span className="font-medium text-slate-900">Số liệu:</span>{' '}
                  <span className="font-mono text-slate-700">
                    {formatNumber(m.usersP)} → {formatNumber(m.usersL)} users
                  </span>
                  {posDelta && <span className="ml-2 text-[12px] text-slate-500">· {posDelta}</span>}
                </div>

                <div className="mt-1 flex items-start gap-1.5 text-[13px] text-slate-700">
                  <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <span className="flex-1">
                    <span className="font-medium text-slate-900">Insight:</span> {alertCopy(m.alert)}
                  </span>
                </div>

                <div className="mt-1 flex items-start gap-1.5 text-[13px] text-slate-700">
                  <Target
                    className={cn(
                      'h-3.5 w-3.5 mt-0.5 shrink-0',
                      up ? 'text-emerald-600' : 'text-rose-600',
                    )}
                  />
                  <span className="flex-1">
                    <span className="font-medium text-slate-900">Hành động:</span>{' '}
                    <span className={cn('font-semibold', up ? 'text-emerald-700' : 'text-rose-700')}>
                      {deriveAction(m)}
                    </span>
                    {m.bidSuggest && m.bidSuggest !== '—' && (
                      <span className="ml-2 text-slate-600 font-mono text-xs">Bid {m.bidSuggest}</span>
                    )}
                  </span>
                </div>

                {m.note && (
                  <p className="mt-1.5 text-[12px] text-slate-500 italic line-clamp-2">{m.note}</p>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
