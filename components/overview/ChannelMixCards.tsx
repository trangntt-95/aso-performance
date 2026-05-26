import { Leaf, DollarSign, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import type { ChannelSnapshot, SurfaceFocus } from './aggregate';
import { formatNumber, formatPercent, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface Props {
  snapshot: ChannelSnapshot | null;
  windowLabel: string;
  activeFocus?: SurfaceFocus;
  onSelect?: (focus: SurfaceFocus) => void;
}

function deltaPct(latest: number, prior: number): number {
  if (!prior) return 0;
  return (latest - prior) / Math.abs(prior);
}

function DeltaPill({ value, mode = 'rel' }: { value: number; mode?: 'rel' | 'pp' }) {
  const t = deltaTone(value);
  const Arrow = t === 'pos' ? ArrowUp : t === 'neg' ? ArrowDown : ArrowRight;
  const cls = t === 'pos' ? 'text-emerald-700' : t === 'neg' ? 'text-rose-700' : 'text-slate-500';
  const sign = value > 0 ? '+' : '';
  const display = mode === 'pp' ? `${(value * 100).toFixed(1)}pp` : `${(value * 100).toFixed(1)}%`;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', cls)}>
      <Arrow className="h-3 w-3" />
      {sign}
      {display}
    </span>
  );
}

function Channel({
  label,
  Icon,
  iconCls,
  users,
  usersDelta,
  getApp,
  getAppDelta,
  cr,
  crDelta,
  active,
  dimmed,
  onClick,
  accentRing,
}: {
  label: string;
  Icon: typeof Leaf;
  iconCls: string;
  users: number;
  usersDelta: number;
  getApp: number;
  getAppDelta: number;
  cr: number;
  crDelta: number;
  active?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  accentRing?: string;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        'rounded-xl border bg-white p-4 sm:p-5 text-left transition w-full',
        onClick && 'hover:border-slate-300 hover:shadow-sm cursor-pointer',
        active ? cn('border-transparent ring-2', accentRing) : 'border-slate-200',
        dimmed && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('h-7 w-7 rounded-lg grid place-items-center', iconCls)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        {active && (
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Filtering · click to clear
          </span>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Users</dt>
          <dd className="text-lg font-semibold text-slate-900 leading-tight tabular-nums">
            {formatNumber(users, { compact: true })}
          </dd>
          <DeltaPill value={usersDelta} />
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Install</dt>
          <dd className="text-lg font-semibold text-slate-900 leading-tight tabular-nums">
            {formatNumber(getApp, { compact: true })}
          </dd>
          <DeltaPill value={getAppDelta} />
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">CR</dt>
          <dd className="text-lg font-semibold text-slate-900 leading-tight tabular-nums">
            {formatPercent(cr)}
          </dd>
          <DeltaPill value={crDelta} />
        </div>
      </dl>
    </Wrapper>
  );
}

export function ChannelMixCards({ snapshot, windowLabel, activeFocus = 'all', onSelect }: Props) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No funnel data for {windowLabel}.
      </div>
    );
  }
  const handle = (focus: 'organic' | 'paid') => () => {
    if (!onSelect) return;
    onSelect(activeFocus === focus ? 'all' : focus);
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Channel
        label="Organic"
        Icon={Leaf}
        iconCls="bg-emerald-100 text-emerald-700"
        users={snapshot.organicUsers}
        usersDelta={deltaPct(snapshot.organicUsers, snapshot.organicUsersPrior)}
        getApp={snapshot.organicGetApp}
        getAppDelta={deltaPct(snapshot.organicGetApp, snapshot.organicGetAppPrior)}
        cr={snapshot.organicCr}
        crDelta={deltaPct(snapshot.organicCr, snapshot.organicCrPrior)}
        active={activeFocus === 'organic'}
        dimmed={activeFocus === 'paid'}
        onClick={onSelect ? handle('organic') : undefined}
        accentRing="ring-emerald-400"
      />
      <Channel
        label="Paid"
        Icon={DollarSign}
        iconCls="bg-amber-100 text-amber-700"
        users={snapshot.paidUsers}
        usersDelta={deltaPct(snapshot.paidUsers, snapshot.paidUsersPrior)}
        getApp={snapshot.paidGetApp}
        getAppDelta={deltaPct(snapshot.paidGetApp, snapshot.paidGetAppPrior)}
        cr={snapshot.paidCr}
        crDelta={deltaPct(snapshot.paidCr, snapshot.paidCrPrior)}
        active={activeFocus === 'paid'}
        dimmed={activeFocus === 'organic'}
        onClick={onSelect ? handle('paid') : undefined}
        accentRing="ring-amber-400"
      />
    </div>
  );
}
