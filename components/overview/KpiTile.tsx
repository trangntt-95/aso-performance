import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDeltaPct, deltaTone } from '@/lib/utils/format';

interface Props {
  label: string;
  value: string;
  deltaPct?: number | null;
  helper?: string;
  Icon?: LucideIcon;
  tone?: 'default' | 'warn' | 'danger';
}

const toneStyles = {
  default: 'border-slate-200',
  warn: 'border-amber-200 bg-amber-50/30',
  danger: 'border-rose-200 bg-rose-50/30',
};

export function KpiTile({ label, value, deltaPct, helper, Icon, tone = 'default' }: Props) {
  const dTone = deltaPct !== undefined && deltaPct !== null ? deltaTone(deltaPct) : null;
  const Arrow = dTone === 'pos' ? ArrowUp : dTone === 'neg' ? ArrowDown : ArrowRight;
  const arrowColor =
    dTone === 'pos' ? 'text-emerald-600' : dTone === 'neg' ? 'text-rose-600' : 'text-slate-400';

  return (
    <div className={cn('rounded-xl border bg-white p-4 sm:p-5', toneStyles[tone])}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      </div>
      <div className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
        {value}
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-xs">
        {deltaPct !== undefined && deltaPct !== null ? (
          <span className={cn('inline-flex items-center gap-0.5 font-medium', arrowColor)}>
            <Arrow className="h-3 w-3" />
            {formatDeltaPct(deltaPct)}
          </span>
        ) : null}
        {helper && <span className="text-slate-500">{helper}</span>}
      </div>
    </div>
  );
}
