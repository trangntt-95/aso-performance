'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildDataGapReport, type FeedCoverage } from '@/lib/market/dataGaps';
import { cn } from '@/lib/utils';

// A footnote at the very bottom of Overview: which per-day exports are missing
// days, and which are behind the others.
//
// Kept small and last on purpose. It is not a finding about the market, it is a
// caveat about the data every block above was drawn from — so it belongs where a
// footnote belongs, and it renders nothing at all when every feed is complete
// rather than sitting there permanently saying "all good", which would train the
// eye to skip it on the day it matters.

/** Up to `max` dates, then "+N nữa". A feed can be short by dozens of days. */
function brief(dates: string[], max = 6): string {
  if (dates.length <= max) return dates.join(', ');
  return `${dates.slice(0, max).join(', ')} +${dates.length - max} nữa`;
}

function line(f: FeedCoverage): string {
  if (f.empty) return `${f.feed}: không có dòng nào đọc được`;
  const bits: string[] = [];
  if (f.missing.length > 0) bits.push(`thiếu ${f.missing.length} ngày`);
  if (f.lagWorthNoting) bits.push(`chậm ${f.lagDays} ngày (mới nhất ${f.to})`);
  if (f.unreadableRows > 0) bits.push(`${f.unreadableRows} dòng không đọc được ngày`);
  return `${f.feed}: ${bits.join(' · ')}`;
}

export function DataGapNote() {
  const { data, isLoading } = useSheetData();
  const report = useMemo(() => buildDataGapReport(data ?? null), [data]);
  const [open, setOpen] = useState(false);

  if (isLoading || !report || report.problems.length === 0) return null;

  const gapFeeds = report.problems.filter((f) => f.missing.length > 0 || f.empty);
  const lagFeeds = report.problems.filter((f) => f.lagWorthNoting && f.missing.length === 0 && !f.empty);

  // The headline says which of the two faults is present, because they need
  // different responses: a gap is permanent and needs the job re-run, a lag
  // clears itself on the next refresh.
  const summary = [
    gapFeeds.length > 0 ? `${gapFeeds.length} nguồn thiếu ngày` : null,
    lagFeeds.length > 0 ? `${lagFeeds.length} nguồn chậm ≥2 ngày` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="text-[11px] font-medium text-amber-900">Dữ liệu theo ngày: {summary}</span>
        <span className="hidden text-[10px] text-amber-700 sm:inline">
          — các khối phía trên chỉ tính trên số ngày thật sự có data
        </span>
        <ChevronDown
          className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-amber-600 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t border-amber-200 px-3 py-2">
          <div className="text-[10px] leading-snug text-slate-600">
            Mỗi khối theo ngày ở trên được ghép từ 5 export độc lập, cập nhật bởi các job khác nhau
            và về không cùng lúc. Ngày mới nhất bất kỳ nguồn nào có:{' '}
            <b className="font-mono">{report.newestDay}</b> — độ chậm tính so với ngày đó, không so
            với hôm nay, vì mọi export đều trễ thực tế 1–2 ngày. Lệch 1 ngày giữa các nguồn là bình
            thường nên không báo ở đây; trường hợp nó thật sự cắt ngắn window thì card{' '}
            <b>Kênh trả phí</b> đã báo đỏ ngay tại chỗ.
          </div>

          {gapFeeds.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-amber-900">
                Thiếu ngày (job không chạy hôm đó — ngày đã mất sẽ không tự quay lại)
              </div>
              {gapFeeds.map((f) => (
                <div key={f.feed} className="text-[10px] leading-snug text-slate-700">
                  <span className="font-medium">{line(f)}</span>
                  {!f.empty && (
                    <>
                      <span className="text-slate-500">
                        {' '}
                        · phủ {f.from} → {f.to} ({f.days} ngày)
                      </span>
                      <div className="font-mono text-[9px] text-slate-500">{brief(f.missing)}</div>
                    </>
                  )}
                  <div className="text-[9px] text-slate-400">ảnh hưởng: {f.drives}</div>
                </div>
              ))}
            </div>
          )}

          {lagFeeds.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-amber-900">
                Chậm ≥2 ngày so với nguồn mới nhất (tự hết sau lần refresh tới)
              </div>
              {lagFeeds.map((f) => (
                <div key={f.feed} className="text-[10px] leading-snug text-slate-700">
                  <span className="font-medium">{line(f)}</span>
                  <div className="text-[9px] text-slate-400">ảnh hưởng: {f.drives}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
