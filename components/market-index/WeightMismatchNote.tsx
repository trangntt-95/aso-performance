'use client';

import { useState } from 'react';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import type { MismatchReport, MismatchRow } from '@/lib/market/countryWeighting';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Nước mà traffic và doanh thu không đi cùng nhau.
//
// Mặc định thu lại một dòng. Đây là cảnh báo chẩn đoán, không phải số cần theo
// dõi hằng ngày: mở ra khi muốn biết trọng số đang lệch ở đâu, còn lại thì nó
// không nên chiếm chỗ.

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Row({ r, kind }: { r: MismatchRow; kind: 'traffic' | 'revenue' }) {
  return (
    <li className="flex items-baseline gap-2 text-[11px]">
      <span className="min-w-0 flex-1 truncate text-slate-700">{r.country}</span>
      <span className="w-24 shrink-0 text-right font-mono text-[10px] text-slate-500">
        {formatNumber(r.users, { compact: true })} u · {pct(r.usersShare)}
      </span>
      <span
        className={cn(
          'w-24 shrink-0 text-right font-mono text-[10px]',
          kind === 'traffic' ? 'text-rose-600' : 'text-emerald-700',
        )}
        title={`Doanh thu $${formatNumber(Math.round(r.revenue))}`}
      >
        {pct(r.revenueShare)} tiền
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[10px] text-slate-400">
        {r.valuePerInstall === null ? 'chưa có' : `$${r.valuePerInstall.toFixed(0)}/inst`}
      </span>
    </li>
  );
}

export function WeightMismatchNote({ report }: { report: MismatchReport | null }) {
  const [open, setOpen] = useState(false);
  if (!report) return null;
  const { trafficHeavy, revenueHeavy } = report;
  if (trafficHeavy.length === 0 && revenueHeavy.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1 text-[11px] text-amber-900">
          <b>{trafficHeavy.length} nước</b> nhiều traffic ít tiền ({pct(report.trafficHeavyShare)}{' '}
          traffic) · <b>{revenueHeavy.length} nước</b> nhiều tiền ít traffic (
          {pct(report.revenueHeavyShare)} doanh thu)
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-amber-600 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="grid gap-3 border-t border-amber-200 px-3 py-2 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-rose-700">
              Traffic nhiều, tiền ít — cân nhắc cắt
            </div>
            {trafficHeavy.length === 0 ? (
              <div className="text-[11px] text-slate-400">Không có.</div>
            ) : (
              <ul className="space-y-0.5">
                {trafficHeavy.slice(0, 8).map((r) => (
                  <Row key={r.country} r={r} kind="traffic" />
                ))}
                {trafficHeavy.length > 8 && (
                  <li className="text-[10px] text-slate-400">…+{trafficHeavy.length - 8} nước nữa</li>
                )}
              </ul>
            )}
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
              Tiền nhiều, traffic mỏng — đáng đẩy thêm
            </div>
            {revenueHeavy.length === 0 ? (
              <div className="text-[11px] text-slate-400">Không có.</div>
            ) : (
              <ul className="space-y-0.5">
                {revenueHeavy.slice(0, 8).map((r) => (
                  <Row key={r.country} r={r} kind="revenue" />
                ))}
                {revenueHeavy.length > 8 && (
                  <li className="text-[10px] text-slate-400">…+{revenueHeavy.length - 8} nước nữa</li>
                )}
              </ul>
            )}
          </div>
          <p className="text-[10px] leading-relaxed text-slate-500 sm:col-span-2">
            So share users trong <code className="text-[9px]">Country_{report.window}</code> với share
            doanh thu trong <code className="text-[9px]">Countries performance</code>. Vào danh sách khi lệch
            từ <b>2,5 lần</b> trở lên. Nước dưới <b>10 users</b> không được so theo tỷ lệ — tỷ lệ tính
            trên 2 users lệch bao nhiêu cũng không nói lên điều gì — nhưng nếu nó nắm từ 1% doanh thu
            thì vẫn được nêu ở cột phải, vì nước có tiền mà không có traffic là loại dễ bị bỏ qua nhất.
          </p>
        </div>
      )}
    </div>
  );
}
