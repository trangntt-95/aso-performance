'use client';

import { Clock } from 'lucide-react';
import { BidImpactBody, bidImpactTitle } from '@/components/shared/BidImpactBody';
import type { CampBidImpact } from '@/lib/market/campBidImpact';

// What the bid CUT you noted did to the campaign, from the per-day Shopify Ads
// export: 14 days before the note vs 14 days after.
//
// Impressions are drawn (they're the only metric dense enough to make a curve
// from), while CPC and CPI are spelled out underneath — those are the numbers
// the decision was about. Success here is cost coming down while impressions
// hold; impressions falling off a cliff means the cut went too deep.

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

  return (
    <td className="px-2 py-2" title={bidImpactTitle(impact, 'cut')}>
      <BidImpactBody impact={impact} direction="cut" />
    </td>
  );
}
