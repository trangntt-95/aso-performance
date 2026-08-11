'use client';

import { ArrowDown, ArrowUp, Check, Clock, Minus } from 'lucide-react';
import { Sparkline } from '@/components/shared/Sparkline';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { CampBidImpact } from '@/lib/market/campBidImpact';

// What the bid change you noted actually did to the campaign — read from the
// per-day Shopify Ads export, 14 days before the note vs 14 days after.
//
// Reading order is deliberate. CPC is the number the decision was about, so it
// leads — but these campaigns average well under one click a day, so a 14-day
// block often holds too few clicks for CPC to mean anything. When that happens
// we say so and fall back to impressions, which are ~275x denser and therefore
// still readable. Showing a confident-looking CPC off two clicks would be worse
// than showing nothing.

const money = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`);

/** Below this the change is treated as flat rather than a real move. */
const FLAT = 0.1;

export function CampImpactCell({ impact }: { impact: CampBidImpact | null }) {
  if (!impact) {
    return <td className="px-2 py-2 text-center text-[11px] text-slate-300">·</td>;
  }

  if (impact.status === 'no-data') {
    return (
      <td
        className="px-2 py-2 text-center text-[11px] text-slate-400"
        title="Đã note nhưng không tìm thấy camp này trong export Shopify theo ngày."
      >
        không có data
      </td>
    );
  }

  if (impact.status === 'too-recent') {
    return (
      <td className="px-2 py-2 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1" title="Đã note nhưng chưa đủ 7 ngày dữ liệu sau đó để đo.">
          <Clock className="h-3 w-3" />
          chờ dữ liệu
        </span>
      </td>
    );
  }

  if (impact.status === 'no-before' || !impact.before || !impact.after) {
    return (
      <td
        className="px-2 py-2 text-center text-[11px] text-slate-400"
        title="Không có dữ liệu chi tiêu TRƯỚC ngày note nên không có mốc để so."
      >
        thiếu mốc trước
      </td>
    );
  }

  const b = impact.before;
  const a = impact.after;

  // Lowering a bid is meant to bring CPC down. Down = good (emerald).
  const cpcTone =
    impact.cpcDelta == null || Math.abs(impact.cpcDelta) < FLAT
      ? 'flat'
      : impact.cpcDelta < 0
        ? 'good'
        : 'bad';
  const CpcIcon = cpcTone === 'good' ? ArrowDown : cpcTone === 'bad' ? ArrowUp : Minus;
  const cpcCls =
    cpcTone === 'good' ? 'text-emerald-600' : cpcTone === 'bad' ? 'text-rose-600' : 'text-slate-500';

  // Impressions falling off a cliff means the cut went too deep.
  const impTone =
    impact.impDelta == null || Math.abs(impact.impDelta) < FLAT
      ? 'held'
      : impact.impDelta < -0.35
        ? 'lost'
        : impact.impDelta < 0
          ? 'soft'
          : 'grew';
  const impCls =
    impTone === 'lost'
      ? 'text-rose-600'
      : impTone === 'soft'
        ? 'text-amber-600'
        : impTone === 'grew'
          ? 'text-slate-500'
          : 'text-emerald-600';

  const title = [
    `Đo từ export Shopify theo ngày: ${b.days} ngày trước note (${b.from} → ${b.to}) vs ${a.days} ngày sau (${a.from} → ${a.to}).`,
    '',
    `CPC      ${money(b.cpc)} → ${money(a.cpc)}  (${pct(impact.cpcDelta)})`,
    `Imp/ngày ${Math.round(b.impPerDay)} → ${Math.round(a.impPerDay)}  (${pct(impact.impDelta)})`,
    `Clicks   ${b.clicks} → ${a.clicks}`,
    `Installs ${b.installs} → ${a.installs}  (${pct(impact.installDelta)})`,
    `Spend    $${Math.round(b.spend)} → $${Math.round(a.spend)}  (${pct(impact.spendDelta)})`,
    `CPI      ${money(b.cpi)} → ${money(a.cpi)}`,
    '',
    impact.cpcReliable
      ? '✅ Đủ click ở cả hai kỳ → CPC đáng tin.'
      : `⚠️ Chỉ ${b.clicks} và ${a.clicks} click — quá ít để tin CPC. Đọc theo impressions.`,
    impTone === 'lost'
      ? '⚠️ Impressions rơi mạnh — nhiều khả năng hạ bid quá tay, camp mất hiển thị.'
      : impTone === 'held'
        ? '✅ Impressions giữ nguyên — hạ bid mà không mất hiển thị.'
        : impTone === 'grew'
          ? 'Impressions tăng — bid có thể chưa được hạ, hoặc đối thủ rút.'
          : 'Impressions giảm nhẹ — theo dõi thêm.',
  ].join('\n');

  return (
    <td className="px-2 py-2">
      <span className="flex flex-col items-start gap-0.5" title={title}>
        {/* CPC first — the number the bid decision was about. */}
        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
          <span className="text-slate-400">CPC</span>
          <span className="text-slate-500">{money(b.cpc)}</span>
          <CpcIcon className={cn('h-3 w-3', cpcCls)} />
          <span className={cn('font-semibold', impact.cpcReliable ? cpcCls : 'text-slate-400')}>
            {money(a.cpc)}
          </span>
          {!impact.cpcReliable && (
            <span className="text-[9px] text-amber-600" title="Quá ít click để tin CPC">
              ?
            </span>
          )}
        </span>

        {/* Impressions — dense enough to trust even when CPC isn't. */}
        <span className="inline-flex items-center gap-1 font-mono text-[10px]">
          <span className="text-slate-400">imp</span>
          <span className={impCls}>{pct(impact.impDelta)}</span>
          <span className="text-slate-400">
            {formatNumber(Math.round(b.impPerDay), { compact: true })}→
            {formatNumber(Math.round(a.impPerDay), { compact: true })}/ngày
          </span>
        </span>

        <span className="flex items-center gap-1">
          <Sparkline
            points={impact.series}
            markerT={impact.noteAt}
            stroke={impTone === 'lost' ? '#e11d48' : impTone === 'held' ? '#059669' : '#94a3b8'}
          />
          {impTone === 'held' && <Check className="h-3 w-3 text-emerald-600" />}
        </span>
      </span>
    </td>
  );
}
