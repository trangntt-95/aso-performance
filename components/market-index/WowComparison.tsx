'use client';

import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { WowMetric } from '@/lib/sheets/types';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber, formatDeltaPct, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface Props {
  data: WowMetric[];
  /** Khi cân theo doanh thu, con số là CHỈ SỐ chứ không phải số người/install. */
  weighted?: boolean;
}

export function WowComparison({ data, weighted }: Props) {
  if (data.length === 0) return null;
  // Chỉ số cân ra số thập phân (399 users × 0.48). Làm tròn về 1 chữ số thay vì
  // dùng compact, vì "0.4K" cho một chỉ số là vô nghĩa.
  const fmt = (n: number) => (weighted ? n.toFixed(1) : formatNumber(n, { compact: true }));
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">WoW comparison · L7 vs P7</h2>
          <p className="text-[11px] text-slate-500">
            Tuần này so với tuần trước
            {weighted && (
              <>
                {' '}
                · số là <b>chỉ số cân theo doanh thu</b>, không phải số người —{' '}
                <span className="text-slate-400">so sánh được theo thời gian, không đọc như count</span>
              </>
            )}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map((m) => {
            const tone = deltaTone(m.deltaPct);
            const Arrow = tone === 'pos' ? ArrowUp : tone === 'neg' ? ArrowDown : ArrowRight;
            const toneCls = tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-rose-700' : 'text-slate-500';
            return (
              <div key={m.metric} className="rounded-lg border border-slate-200 p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{m.metric}</div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div>
                    <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {fmt(m.thisPeriod)}
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1">vs {fmt(m.lastPeriod)}</span>
                  </div>
                  <span className={cn('inline-flex items-center gap-0.5 font-medium text-sm', toneCls)}>
                    <Arrow className="h-3.5 w-3.5" />
                    {formatDeltaPct(m.deltaPct)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Δ {m.deltaValue > 0 ? '+' : ''}
                  {weighted ? m.deltaValue.toFixed(1) : formatNumber(m.deltaValue)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
