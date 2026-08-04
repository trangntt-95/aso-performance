'use client';

import { ArrowUp, ArrowDown, Minus, Clock } from 'lucide-react';
import { Sparkline } from '@/components/shared/Sparkline';
import { formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { NoteImpact } from '@/lib/market/noteImpact';

// Impact of the bid change you noted on an underbid keyword: paid SHARE before
// the note → ~10 days after. Share climbing = paid is now catching the organic
// demand it was missing (what raising the bid should do) → good (emerald).

const pct = (v: number | null): string => (v == null ? '—' : formatPercent(v));

export function ImpactCell({ impact, onOpen }: { impact: NoteImpact | null; onOpen: () => void }) {
  // Not noted → nothing to measure.
  if (!impact) {
    return <td className="px-2 py-2 text-center text-[11px] text-slate-300">·</td>;
  }

  if (impact.status === 'no-history') {
    return (
      <td className="px-2 py-2 text-center text-[11px] text-slate-400" title="Đã note, nhưng keyword chưa có lịch sử paid trong History_Daily để đo.">
        chưa có paid
      </td>
    );
  }

  if (impact.status === 'too-recent') {
    return (
      <td className="px-2 py-2 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1" title="Đã note nhưng chưa đủ ~10 ngày dữ liệu sau đó để đo tác động.">
          <Clock className="h-3 w-3" />
          chờ dữ liệu
        </span>
      </td>
    );
  }

  if (impact.status === 'no-paid-yet') {
    return (
      <td className="px-2 py-2 text-[11px]">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-amber-600 hover:underline"
          title="Đã đủ thời gian sau note nhưng vẫn chưa ghi nhận paid traffic — tăng bid chưa ăn thua. Bấm để xem chi tiết."
        >
          ⚠️ chưa lên paid
        </button>
      </td>
    );
  }

  // measured
  const before = impact.before?.paidShare ?? null;
  const after = impact.after?.paidShare ?? null;
  const delta = before != null && after != null ? after - before : null;
  const tone = delta == null ? 'flat' : delta > 0.02 ? 'up' : delta < -0.02 ? 'down' : 'flat';
  const Arrow = tone === 'up' ? ArrowUp : tone === 'down' ? ArrowDown : Minus;
  const toneCls =
    tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-600' : 'text-slate-400';

  return (
    <td className="px-2 py-2">
      <button
        type="button"
        onClick={onOpen}
        className="group flex flex-col items-start gap-0.5 text-left"
        title={`Paid share ${pct(before)} → ${pct(after)} sau ${impact.spanDays} ngày kể từ note. Bấm để xem biểu đồ.`}
      >
        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
          <span className="text-slate-500">{pct(before)}</span>
          <Arrow className={cn('h-3 w-3', toneCls)} />
          <span className={cn('font-semibold', toneCls)}>{pct(after)}</span>
        </span>
        <span className="flex items-center gap-1">
          <Sparkline
            points={impact.points.map((p) => ({ t: p.t, v: p.paidShare }))}
            markerT={impact.noteAt}
            stroke={tone === 'down' ? '#e11d48' : '#0891b2'}
            className="group-hover:opacity-80"
          />
          <span className="text-[9px] text-slate-400">{impact.spanDays}n</span>
        </span>
      </button>
    </td>
  );
}
