'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildDataGapReport, type DataSourceKey, type SourceHealth } from '@/lib/market/dataGaps';
import { cn } from '@/lib/utils';

// A footnote at the very bottom of a screen: what is missing from the data that
// screen was drawn from.
//
// Each page passes the sources it actually reads, so the note only ever talks
// about data behind what you are looking at. It renders nothing when those
// sources are complete — no permanent "all good" line, because a warning that is
// always on screen is one nobody reads on the day it matters.

/** Up to `max` dates, then "+N nữa". A feed can be short by dozens of days. */
function brief(items: string[], max = 6): string {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} +${items.length - max} nữa`;
}

function line(s: SourceHealth): string {
  if (s.empty) {
    return s.kind === 'tabset'
      ? `${s.label}: không tab nào có dữ liệu`
      : `${s.label}: không có dòng nào đọc được`;
  }
  const bits: string[] = [];
  if (s.emptyMembers.length > 0) bits.push(`${s.emptyMembers.join(', ')} rỗng`);
  if (s.missing.length > 0) bits.push(`thiếu ${s.missing.length} ngày`);
  if (s.lagWorthNoting) bits.push(`chậm ${s.lagDays} ngày (mới nhất ${s.to})`);
  if (s.unreadableRows > 0) bits.push(`${s.unreadableRows} dòng không đọc được ngày`);
  return `${s.label}: ${bits.join(' · ')}`;
}

function Group({ title, note, items }: { title: string; note: string; items: SourceHealth[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold text-amber-900">{title}</div>
      <div className="text-[9px] text-slate-500">{note}</div>
      {items.map((s) => (
        <div key={s.key} className="text-[10px] leading-snug text-slate-700">
          <span className="font-medium">{line(s)}</span>
          {s.kind === 'dated' && !s.empty && (
            <>
              <span className="text-slate-500">
                {' '}
                · phủ {s.from} → {s.to} ({s.days} ngày)
              </span>
              {s.missing.length > 0 && (
                <div className="font-mono text-[9px] text-slate-500">{brief(s.missing)}</div>
              )}
            </>
          )}
          <div className="text-[9px] text-slate-400">ảnh hưởng: {s.drives}</div>
        </div>
      ))}
    </div>
  );
}

export function DataGapNote({ sources }: { sources: readonly DataSourceKey[] }) {
  const { data, isLoading } = useSheetData();
  const report = useMemo(() => buildDataGapReport(data ?? null, sources), [data, sources]);
  const [open, setOpen] = useState(false);

  if (isLoading || !report || report.problems.length === 0) return null;

  // Split by what the reader would have to DO about it, not by source.
  const gone = report.problems.filter((s) => s.empty || s.emptyMembers.length > 0);
  const gaps = report.problems.filter((s) => s.missing.length > 0 && !s.empty);
  const lags = report.problems.filter(
    (s) => s.lagWorthNoting && s.missing.length === 0 && !s.empty,
  );
  const unreadable = report.problems.filter(
    (s) => s.unreadableRows > 0 && s.missing.length === 0 && !s.empty && !s.lagWorthNoting,
  );

  const summary = [
    gone.length > 0 ? `${gone.length} nguồn rỗng` : null,
    gaps.length > 0 ? `${gaps.length} nguồn thiếu ngày` : null,
    lags.length > 0 ? `${lags.length} nguồn chậm ≥2 ngày` : null,
    unreadable.length > 0 ? `${unreadable.length} nguồn có dòng lỗi ngày` : null,
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
        <span className="text-[11px] font-medium text-amber-900">Dữ liệu nguồn: {summary}</span>
        <span className="hidden text-[10px] text-amber-700 sm:inline">
          — các khối trên trang này chỉ tính trên phần data thật sự có
        </span>
        <ChevronDown
          className={cn(
            'ml-auto h-3.5 w-3.5 shrink-0 text-amber-600 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t border-amber-200 px-3 py-2">
          {report.newestDay && (
            <div className="text-[10px] leading-snug text-slate-600">
              Ngày mới nhất trong các nguồn của trang này:{' '}
              <b className="font-mono">{report.newestDay}</b> — độ chậm tính so với ngày đó, không so
              với hôm nay, vì mọi export đều trễ thực tế 1–2 ngày. Lệch 1 ngày giữa các nguồn là bình
              thường nên không báo.
            </div>
          )}

          <Group
            title="Nguồn rỗng"
            note="cả tab không có dữ liệu — phần phụ thuộc vào nó đang chạy bằng fallback hoặc không chạy"
            items={gone}
          />
          <Group
            title="Thiếu ngày"
            note="job không chạy hôm đó — ngày đã mất sẽ không tự quay lại, phải chạy lại job"
            items={gaps}
          />
          <Group
            title="Chậm ≥2 ngày"
            note="export chưa theo kịp — tự hết sau lần refresh tới"
            items={lags}
          />
          <Group
            title="Dòng lỗi ngày"
            note="ô ngày không đọc được (thường là Excel serial chưa convert) — những dòng đó bị bỏ qua"
            items={unreadable}
          />
        </div>
      )}
    </div>
  );
}
