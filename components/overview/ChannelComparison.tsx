'use client';

import { formatNumber, formatPercent } from '@/lib/utils/format';
import { FX_NOTE } from '@/lib/config/fx';
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

/** Signed change vs the prior period, or nothing when there's no baseline. */
function Delta({ v, invert, title }: { v: number | null; invert?: boolean; title?: string }) {
  if (v === null) return <span className="text-[9px] text-slate-300">—</span>;
  // For cost-style metrics (CPI) a rise is bad, so the tone flips.
  const good = invert ? v < 0 : v > 0;
  const flat = Math.abs(v) < 0.05;
  return (
    <span
      className={cn(
        'text-[9px] font-medium',
        flat ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-rose-600',
      )}
      title={title}
    >
      {v >= 0 ? '+' : ''}
      {Math.round(v * 100)}%
    </span>
  );
}

const CHANNEL_SOURCE: Record<'appstore' | 'google', string> = {
  appstore: 'Shopify Ads (App Store Ads)',
  google: 'Google Ads',
};

/** Up to `max` dates, then "+N nữa" — a 90-day filter can be short by 66 days. */
function briefDates(dates: string[], max = 3): string {
  if (dates.length <= max) return dates.join(', ');
  return `${dates.slice(0, max).join(', ')} +${dates.length - max} nữa`;
}

/**
 * Says so when the window actually compared is shorter than the one picked.
 *
 * The two channels are separate exports covering different spans, so the
 * comparison is clipped to the days both of them have. Silent, that shortfall
 * reads as the paid channels having a quiet stretch; named, it reads as one
 * export not going back that far — which is what it is. Renders nothing when the
 * filter was honoured in full, so the ordinary case stays uncluttered.
 *
 * The missing days get split by WHERE they fall, because the three cases have
 * different answers. Days before the overlap starts mean one export doesn't go
 * back that far (a 90-day filter against a 25-day Google export). Days after it
 * ends mean an export is behind by a day or two — that one resolves itself.
 * Blaming the tail for a head-shaped shortfall was the trap here: the channel
 * missing the most recent day is usually not the one missing the other sixty.
 */
function ShortfallBadge({ data }: { data: Comparison }) {
  const asked = data.requestedDays;
  if (asked === null || data.missingDays.length === 0 || data.days >= asked) return null;

  const head = data.missingBecause.filter((m) => m.date < data.availableFrom);
  const tail = data.missingBecause.filter((m) => m.date > data.availableTo);
  const gaps = data.missingBecause.filter(
    (m) => m.date >= data.availableFrom && m.date <= data.availableTo,
  );

  const nameFor = (ms: { channels: ('appstore' | 'google')[] }[]): string => {
    const all = new Set(ms.flatMap((m) => m.channels));
    if (all.size === 0) return 'một trong hai export';
    return Array.from(all).map((k) => CHANNEL_SOURCE[k]).join(' và ');
  };

  const parts: string[] = [];
  if (head.length > 0) {
    parts.push(`${nameFor(head)} chỉ có data từ ${data.availableFrom}`);
  }
  if (tail.length > 0) {
    parts.push(`${nameFor(tail)} chưa có ${briefDates(tail.map((m) => m.date))}`);
  }
  if (gaps.length > 0) {
    parts.push(`thiếu rời rạc ${briefDates(gaps.map((m) => m.date))}`);
  }

  return (
    <div
      className="flex flex-wrap items-baseline gap-x-1.5 text-[10px]"
      title={
        `Bảng này chỉ so những ngày mà CẢ HAI kênh đều có dữ liệu, nên không kênh nào bị tính những ` +
        `ngày kênh kia chưa thấy. Kỳ so sánh cũng khớp ${data.days} ngày thật chứ không phải ${asked} — ` +
        `so ${data.days} ngày với baseline ${asked} ngày sẽ tạo ra một cú giảm giả.\n\n` +
        `Khoảng cả hai kênh cùng có: ${data.availableFrom} → ${data.availableTo}\n` +
        `Đang so: ${data.from} → ${data.to} (${data.days} ngày)\n` +
        `Thiếu ${data.missingDays.length} ngày: ${briefDates(data.missingDays, 8)}`
      }
    >
      <span className="cursor-help rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-800">
        {data.days}/{asked} ngày
      </span>
      <span className="text-slate-500">{parts.join(' · ')}</span>
    </div>
  );
}

export function ChannelComparisonCard({ data }: { data: Comparison }) {
  if (data.noOverlap || data.channels.length === 0) {
    return (
      <div className="text-xs text-slate-500">
        Hai kênh chưa có ngày nào trùng nhau nên chưa so được.
      </div>
    );
  }

  const totalUsd = data.channels.reduce((s, c) => s + (c.spendUsd ?? 0), 0);
  const best = data.channels
    .filter((c) => c.cpiUsd !== null)
    .sort((a, b) => (a.cpiUsd as number) - (b.cpiUsd as number))[0];

  return (
    <div className="space-y-2">
      <ShortfallBadge data={data} />

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
                  <div
                    className="font-mono text-base font-bold text-slate-900"
                    // A USD figure that was converted has to say so somewhere, or
                    // the reader takes it for a number the channel reported.
                    title={c.currency !== 'USD' ? FX_NOTE : undefined}
                  >
                    {usd(c.spendUsd)}
                  </div>
                  {c.currency !== 'USD' && (
                    <div className="cursor-help text-[9px] text-slate-400" title={FX_NOTE}>
                      {Math.round(c.spendNative).toLocaleString('vi-VN')}₫
                    </div>
                  )}
                  <div className="text-[9px] text-slate-400">
                    <Delta v={c.spendDelta} title={`Kỳ trước: ${usd(c.prevSpendUsd)}`} />
                    {c.prevSpendUsd !== null && <span className="ml-1">vs {usd(c.prevSpendUsd)}</span>}
                  </div>
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
                  <div className="text-[9px] text-slate-400">
                    <Delta v={c.cpiDelta} invert title={`Kỳ trước: ${usd(c.prevCpiUsd)}`} />
                    {c.prevCpiUsd !== null && <span className="ml-1">vs {usd(c.prevCpiUsd)}</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Clicks</div>
                  <div className="font-mono text-sm text-slate-800">{formatNumber(c.clicks)}</div>
                  <div className="text-[9px] text-slate-400">
                    <Delta v={c.clicksDelta} title={`Kỳ trước: ${formatNumber(c.prevClicks)} click`} />
                    <span className="ml-1">vs {formatNumber(c.prevClicks)}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Installs</div>
                  <div className="font-mono text-sm text-slate-800">
                    {c.installs % 1 === 0 ? c.installs : c.installs.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    <Delta v={c.installsDelta} title={`Kỳ trước: ${c.prevInstalls} install`} />
                    <span className="ml-1">vs {c.prevInstalls}</span>
                    <span className="ml-1 cursor-help" title={c.installBasis}>
                      ⓘ
                    </span>
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
