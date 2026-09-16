'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { OriginCamp } from '@/lib/market/installOrigin';
import { cn } from '@/lib/utils';

// Camp chưa tắt đang bid một keyword, kèm bid ở camp đó — dùng chung cho mọi
// bảng theo keyword (Vị trí keyword, Đang bid mà không ai bấm). Dòng đầu hiện
// sẵn, còn lại sau nút +N để bảng 800 dòng không dài gấp năm.
//
// `dimmed(camp)` = camp không phủ nước của dòng (theo Geo Camp_Links): vẫn
// liệt kê vì Master không nói camp nào phục vụ nước nào, nhưng làm mờ để mắt
// rơi vào camp đúng nước trước.

const money = (n: number | null | undefined) => (n && n > 0 ? `$${n.toFixed(2)}` : '—');

function CampName({ camp, dim }: { camp: OriginCamp; dim: boolean }) {
  return (
    <span className={cn('flex items-baseline gap-1 whitespace-nowrap', dim && 'opacity-50')} title={dim ? `${camp.camp} — Geo không phủ nước này` : camp.camp}>
      {camp.url ? (
        <a href={camp.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[16rem] items-baseline gap-1 truncate text-[11px] text-indigo-600 hover:underline">
          <span className="truncate">{camp.camp}</span>
          <ExternalLink className="h-2.5 w-2.5 shrink-0 self-center" />
        </a>
      ) : (
        <span className="max-w-[16rem] truncate text-[11px] text-slate-700">{camp.camp}</span>
      )}
      <span className="text-[10px] text-slate-400">{money(camp.bidMax)}</span>
    </span>
  );
}

export function KeywordCampsList({
  camps,
  dimmed,
  emptyLabel = '—',
}: {
  camps: OriginCamp[];
  dimmed?: (camp: OriginCamp) => boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  if (camps.length === 0) return <span className="text-[11px] text-slate-400">{emptyLabel}</span>;
  // Camp phủ nước này lên trước; trong mỗi nhóm giữ thứ tự bid giảm dần.
  const ordered = dimmed ? [...camps.filter((c) => !dimmed(c)), ...camps.filter((c) => dimmed(c))] : camps;
  const [first, ...rest] = ordered;
  const isDim = (c: OriginCamp) => (dimmed ? dimmed(c) : false);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1">
        <CampName camp={first} dim={isDim(first)} />
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-600 hover:bg-slate-200"
            title={rest.map((c) => c.camp).join('\n')}
          >
            {open ? '−' : '+'}
            {rest.length}
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-slate-200 pl-2">
          {rest.map((c) => (
            <li key={c.camp}>
              <CampName camp={c} dim={isDim(c)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
