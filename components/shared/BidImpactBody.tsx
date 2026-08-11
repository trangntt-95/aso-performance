'use client';

import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Sparkline } from '@/components/shared/Sparkline';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { CampBidImpact } from '@/lib/market/campBidImpact';

// The shared read-out for "what did the bid change do", used by both the overbid
// and underbid tables.
//
// Impressions carry the picture — they're the only metric dense enough here to
// draw a curve from (~2.15M impressions against 19k clicks and 3.1k installs
// over the same span). Cost is what the decision was actually about though, so
// CPC and CPI sit right underneath as numbers rather than being buried in a
// tooltip.
//
// Direction differs by page: cutting a bid should pull CPC/CPI down while
// impressions hold; raising one should push impressions up and costs are the
// expected price. `direction` picks which reading counts as good.

const money = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`);

/** Moves smaller than this read as flat rather than a real change. */
const FLAT = 0.1;

type Tone = 'good' | 'bad' | 'flat';

function toneCls(t: Tone): string {
  return t === 'good' ? 'text-emerald-600' : t === 'bad' ? 'text-rose-600' : 'text-slate-500';
}

/** Cost falling is good on both pages; the difference is only how much it matters. */
function costTone(delta: number | null): Tone {
  if (delta == null || Math.abs(delta) < FLAT) return 'flat';
  return delta < 0 ? 'good' : 'bad';
}

function impTone(delta: number | null, direction: 'cut' | 'raise'): Tone {
  if (delta == null || Math.abs(delta) < FLAT) return direction === 'cut' ? 'good' : 'flat';
  if (direction === 'raise') return delta > 0 ? 'good' : 'bad';
  // After a cut, holding impressions is the win; a collapse means it went too deep.
  return delta < -0.35 ? 'bad' : 'flat';
}

/** One cost line: label, before → after, and a reliability marker. */
function CostLine({
  label,
  before,
  after,
  delta,
  reliable,
  reliabilityNote,
}: {
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  reliable: boolean;
  reliabilityNote: string;
}) {
  const t = costTone(delta);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] whitespace-nowrap">
      <span className="w-6 text-slate-400">{label}</span>
      <span className="text-slate-500">{money(before)}</span>
      <span className="text-slate-300">→</span>
      <span className={cn('font-semibold', reliable ? toneCls(t) : 'text-slate-400')}>{money(after)}</span>
      {delta != null && (
        <span className={cn(reliable ? toneCls(t) : 'text-slate-400')}>({pct(delta)})</span>
      )}
      {!reliable && (
        <span className="text-amber-600" title={reliabilityNote}>
          ?
        </span>
      )}
    </span>
  );
}

export function BidImpactBody({
  impact,
  direction,
}: {
  impact: CampBidImpact;
  direction: 'cut' | 'raise';
}) {
  const b = impact.before;
  const a = impact.after;
  if (!b || !a) return null;

  const it = impTone(impact.impDelta, direction);
  const ImpIcon = impact.impDelta == null || Math.abs(impact.impDelta) < FLAT ? Minus : impact.impDelta > 0 ? ArrowUp : ArrowDown;

  return (
    <span className="flex flex-col items-start gap-0.5">
      {/* Impressions — the shape of what happened. */}
      <span className="inline-flex items-center gap-1 font-mono text-[11px] whitespace-nowrap">
        <span className="w-6 text-slate-400">imp</span>
        <ImpIcon className={cn('h-3 w-3', toneCls(it))} />
        <span className={cn('font-semibold', toneCls(it))}>{pct(impact.impDelta)}</span>
        <span className="text-[9px] text-slate-400">
          {formatNumber(Math.round(b.impPerDay), { compact: true })}→
          {formatNumber(Math.round(a.impPerDay), { compact: true })}/ngày
        </span>
      </span>

      <Sparkline
        points={impact.series}
        markerT={impact.noteAt}
        width={96}
        height={20}
        stroke={it === 'good' ? '#059669' : it === 'bad' ? '#e11d48' : '#94a3b8'}
      />

      {/* Cost — what the bid decision was actually about. */}
      <CostLine
        label="CPC"
        before={b.cpc}
        after={a.cpc}
        delta={impact.cpcDelta}
        reliable={impact.cpcReliable}
        reliabilityNote={`Chỉ ${b.clicks} click trước và ${a.clicks} click sau — quá ít để tin CPC.`}
      />
      <CostLine
        label="CPI"
        before={b.cpi}
        after={a.cpi}
        delta={impact.cpiDelta}
        reliable={impact.cpiReliable}
        reliabilityNote={`Chỉ ${b.installs} install trước và ${a.installs} install sau — CPI ở mức này là nhiễu, đọc tham khảo.`}
      />
    </span>
  );
}

/** Full breakdown for the cell's tooltip — every number behind the three lines. */
export function bidImpactTitle(
  impact: CampBidImpact,
  direction: 'cut' | 'raise',
  header?: string,
): string {
  const b = impact.before;
  const a = impact.after;
  if (!b || !a) return header ?? '';
  const it = impTone(impact.impDelta, direction);
  return [
    header,
    `${b.days} ngày trước note (${b.from} → ${b.to}) vs ${a.days} ngày sau (${a.from} → ${a.to})`,
    '',
    `Imp/ngày ${Math.round(b.impPerDay)} → ${Math.round(a.impPerDay)}  (${pct(impact.impDelta)})`,
    `CPC      ${money(b.cpc)} → ${money(a.cpc)}  (${pct(impact.cpcDelta)})`,
    `CPI      ${money(b.cpi)} → ${money(a.cpi)}  (${pct(impact.cpiDelta)})`,
    `Clicks   ${b.clicks} → ${a.clicks}`,
    `Installs ${b.installs} → ${a.installs}`,
    `Spend    $${Math.round(b.spend)} → $${Math.round(a.spend)}`,
    '',
    impact.cpcReliable ? '✅ Đủ click → CPC đáng tin.' : `⚠️ ${b.clicks}/${a.clicks} click — CPC là nhiễu.`,
    impact.cpiReliable ? '✅ Đủ install → CPI đáng tin.' : `⚠️ ${b.installs}/${a.installs} install — CPI là nhiễu.`,
    '',
    direction === 'cut'
      ? it === 'bad'
        ? '⚠️ Hiển thị rơi mạnh — nhiều khả năng hạ bid quá tay.'
        : '✅ Hiển thị giữ được — hạ bid mà không mất chỗ đứng.'
      : it === 'good'
        ? '✅ Hiển thị tăng — tăng bid đã mua thêm được chỗ đứng.'
        : it === 'bad'
          ? '⚠️ Hiển thị vẫn giảm dù đã tăng bid — đối thủ đẩy mạnh hơn, hoặc mức tăng chưa đủ.'
          : 'Hiển thị gần như không đổi — mức tăng bid chưa đủ để dịch chuyển.',
  ]
    .filter((x) => x !== undefined)
    .join('\n');
}
