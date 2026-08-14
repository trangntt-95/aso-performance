'use client';

import { formatNumber, formatPercent } from '@/lib/utils/format';
import { FX_NOTE, VND_PER_USD } from '@/lib/config/fx';
import type { ChannelComparison as Comparison } from '@/lib/market/crossChannel';
import { cn } from '@/lib/utils';

// The two paid channels side by side, over the window both actually cover.
//
// Deliberately no combined total. The install counts are produced by different
// attribution systems — the App Store side only sees visits carrying a
// `surface_type=` parameter, which Google-driven traffic never has — so adding
// them would invent a number neither source supports. Cost, being a real
// outflow, is the one figure that can be summed once converted.

const usd = (n: number | null) => (n === null ? '—' : `$${formatNumber(Math.round(n))}`);

export function ChannelComparisonCard({ data }: { data: Comparison }) {
  if (data.noOverlap || data.channels.length === 0) {
    return (
      <div className="text-xs text-slate-500">
        Hai kênh chưa có ngày nào trùng nhau nên chưa so được.
      </div>
    );
  }

  const totalUsd = data.channels.reduce((s, c) => s + (c.spendUsd ?? 0), 0);
  const totalClicks = data.channels.reduce((s, c) => s + c.clicks, 0);
  const best = data.channels
    .filter((c) => c.cpiUsd !== null)
    .sort((a, b) => (a.cpiUsd as number) - (b.cpiUsd as number))[0];

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-500" title={`Khoảng mà cả hai kênh đều có dữ liệu. ${FX_NOTE}`}>
        {data.from} → {data.to} · {data.days} ngày · {VND_PER_USD.toLocaleString('vi-VN')}₫ = $1
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.channels.map((c) => {
          const shareOfSpend = totalUsd > 0 ? (c.spendUsd ?? 0) / totalUsd : null;
          const isBest = best && c.key === best.key;
          return (
            <div key={c.key} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[12px] font-semibold text-slate-900">{c.label}</div>
                {shareOfSpend !== null && (
                  <div className="text-[10px] text-slate-400">{formatPercent(shareOfSpend)} chi phí</div>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-slate-500">Chi phí</div>
                  <div className="font-mono text-base font-bold text-slate-900">{usd(c.spendUsd)}</div>
                  {c.currency !== 'USD' && (
                    <div className="text-[9px] text-slate-400">
                      {Math.round(c.spendNative).toLocaleString('vi-VN')}₫
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">CPI</div>
                  <div
                    className={cn(
                      'font-mono text-base font-bold',
                      isBest ? 'text-emerald-700' : 'text-slate-900',
                    )}
                  >
                    {c.cpiUsd === null ? '—' : `$${c.cpiUsd.toFixed(2)}`}
                  </div>
                  <div className="text-[9px] text-slate-400">{isBest ? 'rẻ hơn' : 'chi phí / install'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Clicks</div>
                  <div className="font-mono text-sm text-slate-800">{formatNumber(c.clicks)}</div>
                  <div className="text-[9px] text-slate-400">
                    {totalClicks > 0 ? formatPercent(c.clicks / totalClicks) : '—'} tổng click
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Installs</div>
                  <div className="font-mono text-sm text-slate-800">
                    {c.installs % 1 === 0 ? c.installs : c.installs.toFixed(1)}
                  </div>
                  <div className="cursor-help text-[9px] text-slate-400" title={c.installBasis}>
                    ⓘ
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="cursor-help text-[10px] text-amber-700"
        title={
          'App Store chỉ đếm lượt vào listing có tham số surface_type= (tức từ App Store search) — traffic do ' +
          'Google Ads đưa sang không mang tham số đó. Google Ads đếm theo attribution click của chính nó. Hai con ' +
          'số đo hai thứ khác nhau, phần lớn rời nhau, nhưng cùng đọc một sự kiện GA4 shopify_app_install nên vẫn ' +
          'có thể chồng lấn ở mức tổng.'
        }
      >
        Không cộng hai cột install lại ⓘ
      </div>
    </div>
  );
}
