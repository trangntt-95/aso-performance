'use client';

import { Layers } from 'lucide-react';
import type { DynamicBasketItem } from '@/lib/sheets/types';
import { Card, CardContent } from '@/components/ui/card';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { formatNumber } from '@/lib/utils/format';

interface Props {
  data: DynamicBasketItem[];
}

export function DynamicBasketCard({ data }: Props) {
  if (data.length === 0) return null;
  const maxUsers = data.reduce((m, d) => Math.max(m, d.l90Users), 0);
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-indigo-600" />
              Dynamic basket
            </h2>
            <p className="text-[11px] text-slate-500">
              Top {data.length} keyword theo Users L90 — basket được Apps Script dùng để tính weighted verdict
            </p>
          </div>
        </div>
        <ol className="space-y-1">
          {data.map((d) => (
            <li
              key={d.rank}
              className="flex items-center gap-2 text-sm"
            >
              <span className="w-5 text-right font-mono text-[10px] text-slate-400 shrink-0">
                {d.rank}.
              </span>
              <div className="flex-1 min-w-0">
                <KeywordLink keyword={d.searchTerm} className="font-medium truncate block" />
                <div className="relative h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full"
                    style={{ width: `${maxUsers > 0 ? (d.l90Users / maxUsers) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <span className="font-mono tabular-nums text-[12px] text-slate-700 shrink-0 w-14 text-right">
                {formatNumber(d.l90Users, { compact: true })}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
