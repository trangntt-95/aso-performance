'use client';

import { Clock } from 'lucide-react';
import { BidImpactBody, bidImpactTitle } from '@/components/shared/BidImpactBody';
import type { CampBidImpact } from '@/lib/market/campBidImpact';

// Impact of a bid RAISE, per pinned campaign.
//
// A keyword is often split across campaigns on purpose — one per geo tier — so
// "did raising the bid work" has a different answer in each. The keyword-level
// paid-share read (ImpactCell) can't separate them: it sums History_Daily across
// every campaign at once. The per-day Shopify export can, so each pinned camp
// gets its own before/after.
//
// Direction is the mirror of the overbid page: the bid went UP, so more
// impressions is the intended outcome and a higher CPC is its expected price —
// what matters is whether the impressions moved at all.

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
  const label = (
    <div className="truncate text-[9px] font-medium text-slate-500" style={{ maxWidth: '12rem' }} title={camp}>
      {shortCamp(camp)}
    </div>
  );

  if (impact.status === 'no-data') {
    return (
      <div title={`Không tìm thấy "${camp}" trong export Shopify theo ngày.`}>
        {label}
        <div className="text-[10px] text-slate-400">không có data</div>
      </div>
    );
  }
  if (impact.status === 'too-recent') {
    return (
      <div title="Chưa đủ 7 ngày sau note để đo.">
        {label}
        <div className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          <Clock className="h-3 w-3" />
          chờ dữ liệu
        </div>
      </div>
    );
  }
  if (impact.status === 'no-before' || !impact.before || !impact.after) {
    return (
      <div title="Không có chi tiêu TRƯỚC ngày note nên không có mốc so.">
        {label}
        <div className="text-[10px] text-slate-400">thiếu mốc trước</div>
      </div>
    );
  }

  return (
    <div title={bidImpactTitle(impact, 'raise', camp)}>
      {label}
      <BidImpactBody impact={impact} direction="raise" />
    </div>
  );
}

export function PerCampImpactCell({ items }: { items: PerCampImpact[] }) {
  if (items.length === 0) {
    return <td className="px-2 py-2 text-center text-[11px] text-slate-300">·</td>;
  }
  return (
    <td className="px-2 py-2 align-top">
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <OneCamp key={it.camp} {...it} />
        ))}
      </div>
    </td>
  );
}
