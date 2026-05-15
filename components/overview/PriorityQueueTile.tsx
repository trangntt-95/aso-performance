import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  p0: number;
  p1: number;
  p2: number;
  p3: number;
}

const ITEMS: Array<{ key: 'p0' | 'p1' | 'p2' | 'p3'; label: string; barCls: string; textCls: string }> = [
  { key: 'p0', label: 'P0', barCls: 'bg-rose-600', textCls: 'text-rose-700' },
  { key: 'p1', label: 'P1', barCls: 'bg-orange-500', textCls: 'text-orange-700' },
  { key: 'p2', label: 'P2', barCls: 'bg-amber-400', textCls: 'text-amber-700' },
  { key: 'p3', label: 'P3', barCls: 'bg-slate-400', textCls: 'text-slate-600' },
];

export function PriorityQueueTile({ p0, p1, p2, p3 }: Props) {
  const counts = { p0, p1, p2, p3 };
  const total = p0 + p1 + p2 + p3;
  const danger = p0 > 0;

  return (
    <Link
      href="/actions"
      className={cn(
        'rounded-xl border bg-white p-4 sm:p-5 hover:shadow-sm transition group block',
        danger ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
          Action queue
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition" />
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
          {total}
        </span>
        <span className="text-xs text-slate-500">open</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {ITEMS.map(({ key, label, barCls, textCls }) => {
          const value = counts[key];
          return (
            <div key={key} className="flex flex-col items-center text-center gap-0.5">
              <span className={cn('text-[10px] font-medium', textCls)}>{label}</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
              <span className={cn('h-1 w-full rounded-full', value > 0 ? barCls : 'bg-slate-200')} />
            </div>
          );
        })}
      </div>
    </Link>
  );
}
