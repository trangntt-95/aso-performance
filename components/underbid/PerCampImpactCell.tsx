'use client';

import { ArrowDown, ArrowUp, Clock, Minus } from 'lucide-react';
import { Sparkline } from '@/components/shared/Sparkline';
import { cn } from '@/lib/utils';
import type { CampBidImpact } from '@/lib/market/campBidImpact';

// Impact of a bid RAISE, per pinned campaign.
//
// A keyword is often split across campaigns on purpose — one per geo tier — so
// "did raising the bid work" has a different answer in each. The keyword-level
// paid-share read (ImpactCell) can't separate them: it sums History_Daily across
// every campaign at once. The per-day Shopify export can, so each pinned camp
// gets its own before/after.
//
// Direction is the mirror of the overbid page: here the bid went UP, so more
// impressions is the intended outcome. CPC rising is the expected cost of that,
// not a failure — it only matters if impressions didn't move.

const money = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`);

/** Below this the change reads as flat rather than a real move. */
const FLAT = 0.1;

export interface PerCampImpact {
  camp: string;
  impact: CampBidImpact;
}

function shortCamp(name: string): string {
  // Camp names are long and share a prefix; the tail is what distinguishes them.
  const parts = name.split(/\s+-\s+/);
  return parts.length > 2 ? parts.slice(-2).join(' - ') : name;
}

function OneCamp({ camp, impact }: PerCampImpact) {
  if (impact.status === 'no-data') {
    return (
      <div className="text-[10px] text-slate-400" title={`Không tìm thấy "${camp}" trong export Shopify theo ngày.`}>
        <span className="text-slate-500">{shortCamp(camp)}</span> · không có data
      </div>
    );
  }
  if (impact.status === 'too-recent') {
    return (
      <div className="inline-flex items-center gap-1 text-[10px] text-slate-400" title="Chưa đủ 7 ngày sau note để đo.">
        <Clock className="h-3 w-3" />
        <span className="text-slate-500">{shortCamp(camp)}</span> · chờ dữ liệu
      </div>
    );
  }
  if (impact.status === 'no-before' || !impact.before || !impact.after) {
    return (
      <div className="text-[10px] text-slate-400" title="Không có chi tiêu TRƯỚC ngày note nên không có mốc so.">
        <span className="text-slate-500">{shortCamp(camp)}</span> · thiếu mốc trước
      </div>
    );
  }

  const b = impact.before;
  const a = impact.after;
  // Raising a bid is meant to buy more visibility → impressions up = good.
  const tone =
    impact.impDelta == null || Math.abs(impact.impDelta) < FLAT
      ? 'flat'
      : impact.impDelta > 0
        ? 'good'
        : 'bad';
  const Icon = tone === 'good' ? ArrowUp : tone === 'bad' ? ArrowDown : Minus;
  const cls = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-slate-500';

  const title = [
    `${camp}`,
    `${b.days} ngày trước note (${b.from} → ${b.to}) vs ${a.days} ngày sau (${a.from} → ${a.to})`,
    '',
    `Imp/ngày ${Math.round(b.impPerDay)} → ${Math.round(a.impPerDay)}  (${pct(impact.impDelta)})`,
    `CPC      ${money(b.cpc)} → ${money(a.cpc)}  (${pct(impact.cpcDelta)})`,
    `Clicks   ${b.clicks} → ${a.clicks}`,
    `Installs ${b.installs} → ${a.installs}`,
    `Spend    $${Math.round(b.spend)} → $${Math.round(a.spend)}`,
    '',
    tone === 'good'
      ? '✅ Hiển thị tăng — tăng bid đã mua được thêm chỗ đứng.'
      : tone === 'bad'
        ? '⚠️ Hiển thị vẫn giảm dù đã tăng bid — đối thủ đẩy mạnh hơn, hoặc bid tăng chưa đủ.'
        : 'Hiển thị gần như không đổi — mức tăng bid chưa đủ để dịch chuyển.',
    impact.cpcReliable ? '' : `⚠️ Chỉ ${b.clicks} và ${a.clicks} click — CPC ở mức này là nhiễu.`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="flex flex-col gap-0.5" title={title}>
      <div className="truncate text-[9px] text-slate-500" style={{ maxWidth: '11rem' }}>
        {shortCamp(camp)}
      </div>
      <div className="inline-flex items-center gap-1 font-mono text-[10px]">
        <span className="text-slate-400">imp</span>
        <Icon className={cn('h-3 w-3', cls)} />
        <span className={cn('font-semibold', cls)}>{pct(impact.impDelta)}</span>
        <span className="text-slate-400">
          · CPC {money(b.cpc)}→
          <span className={impact.cpcReliable ? '' : 'text-slate-400'}>{money(a.cpc)}</span>
          {!impact.cpcReliable && <span className="text-amber-600" title="Quá ít click để tin CPC">?</span>}
        </span>
      </div>
      <Sparkline
        points={impact.series}
        markerT={impact.noteAt}
        width={80}
        height={18}
        stroke={tone === 'good' ? '#059669' : tone === 'bad' ? '#e11d48' : '#94a3b8'}
      />
    </div>
  );
}

export function PerCampImpactCell({ items }: { items: PerCampImpact[] }) {
  if (items.length === 0) {
    return <td className="px-2 py-2 text-center text-[11px] text-slate-300">·</td>;
  }
  return (
    <td className="px-2 py-2 align-top">
      <div className="flex flex-col gap-1.5">
        {items.map((it) => (
          <OneCamp key={it.camp} {...it} />
        ))}
      </div>
    </td>
  );
}
