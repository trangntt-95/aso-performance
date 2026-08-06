'use client';

import { ArrowUp, ArrowDown, Check, Clock } from 'lucide-react';
import { Sparkline } from '@/components/shared/Sparkline';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { CampImpactSeries, NoteImpact } from '@/lib/market/noteImpact';

// Impact of the bid cut you noted on an OVERBID camp — the mirror of the
// underbid column, with the good outcome inverted.
//
// The camp has no daily cost series (Shopify_daily is one aggregate row), so we
// read the TRAFFIC its keywords hold: paid share before the note → ~10 days
// after. Cutting a bid that was too high should keep that share roughly FLAT —
// same demand captured, cheaper taps (emerald). A collapse means the cut went
// too deep and the camp lost the traffic (amber/rose). A jump means paid grew
// instead — the bid probably wasn't lowered, or a competitor pulled out (slate).

const pct = (v: number | null): string => (v == null ? '—' : formatPercent(v));
const users = (v: number | null): string => (v == null ? '—' : formatNumber(Math.round(v), { compact: true }));

/** How flat counts as "held" — same ±2pp band the underbid column uses. */
const FLAT_BAND = 0.02;

export function CampImpactCell({
  impact,
  series,
}: {
  impact: NoteImpact | null;
  series: CampImpactSeries | undefined;
}) {
  // Not noted → nothing to measure.
  if (!impact) {
    return <td className="px-2 py-2 text-center text-[11px] text-slate-300">·</td>;
  }

  if (impact.status === 'no-history') {
    return (
      <td
        className="px-2 py-2 text-center text-[11px] text-slate-400"
        title={
          series
            ? 'Đã note, nhưng keyword của camp chưa có lịch sử paid trong History_Daily để đo.'
            : 'Đã note, nhưng không map được camp này sang keyword nào trong Master KW Lookup → không đo được.'
        }
      >
        {series ? 'chưa có paid' : 'không map được kw'}
      </td>
    );
  }

  if (impact.status === 'too-recent') {
    return (
      <td className="px-2 py-2 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1" title="Đã note hạ bid nhưng chưa đủ ~10 ngày dữ liệu sau đó để đo tác động.">
          <Clock className="h-3 w-3" />
          chờ dữ liệu
        </span>
      </td>
    );
  }

  if (impact.status === 'no-paid-yet') {
    return (
      <td
        className="px-2 py-2 text-[11px] text-rose-600"
        title="Đã đủ thời gian sau note nhưng camp không còn ghi nhận paid traffic — hạ bid quá tay / camp mất hẳn hiển thị paid."
      >
        ⚠️ mất hẳn paid
      </td>
    );
  }

  // measured
  const before = impact.before?.paidShare ?? null;
  const after = impact.after?.paidShare ?? null;
  const delta = before != null && after != null ? after - before : null;
  const tone =
    delta == null ? 'unknown' : Math.abs(delta) <= FLAT_BAND ? 'held' : delta < 0 ? 'lost' : 'grew';

  const Icon = tone === 'held' ? Check : tone === 'lost' ? ArrowDown : ArrowUp;
  const toneCls =
    tone === 'held' ? 'text-emerald-600' : tone === 'lost' ? 'text-amber-600' : 'text-slate-500';
  const verdict =
    tone === 'held'
      ? 'giữ traffic'
      : tone === 'lost'
        ? 'mất traffic'
        : tone === 'grew'
          ? 'paid tăng'
          : '';

  const title = [
    `Paid share ${pct(before)} → ${pct(after)} sau ${impact.spanDays} ngày kể từ note hạ bid.`,
    `Paid users ${users(impact.before?.paidUsers ?? null)} → ${users(impact.after?.paidUsers ?? null)} · organic ${users(impact.before?.organicUsers ?? null)} → ${users(impact.after?.organicUsers ?? null)}.`,
    series ? `Gộp từ ${series.keywords}/${series.keywordsTotal} keyword của camp có lịch sử.` : '',
    tone === 'held'
      ? '✅ Share giữ nguyên (±2đ%) — hạ bid mà không mất traffic.'
      : tone === 'lost'
        ? '⚠️ Share giảm — có thể đã hạ bid quá tay, camp mất traffic cho organic/đối thủ.'
        : 'Share tăng — bid có thể chưa được hạ, hoặc đối thủ rút khỏi các keyword này.',
    'Chỉ là tương quan: không đo được CPC theo ngày (Shopify_daily chỉ có tổng cả kỳ).',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <td className="px-2 py-2">
      <span className="flex flex-col items-start gap-0.5" title={title}>
        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
          <span className="text-slate-500">{pct(before)}</span>
          <Icon className={cn('h-3 w-3', toneCls)} />
          <span className={cn('font-semibold', toneCls)}>{pct(after)}</span>
        </span>
        <span className="flex items-center gap-1">
          <Sparkline
            points={impact.points.map((p) => ({ t: p.t, v: p.paidShare }))}
            markerT={impact.noteAt}
            stroke={tone === 'lost' ? '#d97706' : tone === 'held' ? '#059669' : '#94a3b8'}
          />
          <span className="text-[9px] text-slate-400">{impact.spanDays}n</span>
        </span>
        {verdict && <span className={cn('text-[9px]', toneCls)}>{verdict}</span>}
      </span>
    </td>
  );
}
