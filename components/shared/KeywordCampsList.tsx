'use client';

import { useState } from 'react';
import { ExternalLink, Pin } from 'lucide-react';
import type { OriginCamp } from '@/lib/market/installOrigin';
import { cn } from '@/lib/utils';

// Camp chưa tắt đang bid một keyword, kèm bid ở camp đó — dùng chung cho mọi
// bảng theo keyword (Vị trí keyword, Đang bid mà không ai bấm). Dòng đầu hiện
// sẵn, còn lại sau nút +N để bảng 800 dòng không dài gấp năm.
//
// `rank(camp)` xếp camp theo Geo Camp_Links so với nước của dòng: 0 = Geo ghi
// rõ nước này, 1 = Geo trống hay dạng loại trừ (có thể phủ), 2 = không phủ →
// làm mờ. Vẫn liệt kê hết vì Master không nói camp nào phục vụ nước nào; thứ
// tự chỉ để mắt rơi vào camp đúng nước trước, trong cùng hạng giữ bid giảm dần.
//
// `pinned` + `onTogglePin`: camp Trang đánh dấu là camp mình thật sự chỉnh bid
// cho keyword này (scope 'underbid-camp', dùng chung với Underbid). Camp đã
// ghim luôn đứng đầu và hiện sẵn; có ghim rồi thì camp khác thu vào sau +N.

const money = (n: number | null | undefined) => (n && n > 0 ? `$${n.toFixed(2)}` : '—');

function CampName({ camp, dim, isPinned, maxW }: { camp: OriginCamp; dim: boolean; isPinned: boolean; maxW: string }) {
  return (
    <span className={cn('flex items-baseline gap-1 whitespace-nowrap', dim && 'opacity-50')} title={dim ? `${camp.camp} — Geo không phủ nước này` : camp.camp}>
      {isPinned && <Pin className="h-3 w-3 shrink-0 self-center text-indigo-500" />}
      {camp.url ? (
        <a href={camp.url} target="_blank" rel="noopener noreferrer" className={cn('inline-flex items-baseline gap-1 truncate text-[11px] text-indigo-600 hover:underline', maxW, isPinned && 'font-medium')}>
          <span className="truncate">{camp.camp}</span>
          <ExternalLink className="h-2.5 w-2.5 shrink-0 self-center" />
        </a>
      ) : (
        <span className={cn('truncate text-[11px] text-slate-700', maxW, isPinned && 'font-medium')}>{camp.camp}</span>
      )}
      <span className="text-[10px] text-slate-400">{money(camp.bidMax)}</span>
    </span>
  );
}

export function KeywordCampsList({
  camps,
  rank,
  pinned,
  onTogglePin,
  pinnedElsewhere,
  emptyLabel = '—',
  nameMaxClass = 'max-w-[16rem]',
}: {
  camps: OriginCamp[];
  rank?: (camp: OriginCamp) => 0 | 1 | 2;
  /** Tên camp đã ghim cho keyword này. */
  pinned?: string[];
  onTogglePin?: (camp: string) => void;
  /** Ghim ở lớp khác (vd. ghim theo keyword của Underbid khi bảng này ghim theo
   *  keyword × nước): hiện nhãn, xếp ngay sau ghim ở đây, không tính là ghim ở đây. */
  pinnedElsewhere?: { camps: string[]; label: string };
  emptyLabel?: string;
  /** Lớp max-width cho tên camp (mặc định 16rem); bảng nhiều cột dùng hẹp hơn. */
  nameMaxClass?: string;
}) {
  const [open, setOpen] = useState(false);
  if (camps.length === 0) return <span className="text-[11px] text-slate-400">{emptyLabel}</span>;
  const pinnedSet = new Set((pinned ?? []).map((p) => p.toLowerCase()));
  const isPinned = (c: OriginCamp) => pinnedSet.has(c.camp.toLowerCase());
  const elsewhereSet = new Set((pinnedElsewhere?.camps ?? []).map((p) => p.toLowerCase()));
  const isElsewhere = (c: OriginCamp) => !isPinned(c) && elsewhereSet.has(c.camp.toLowerCase());
  // Ghim ở đây lên trước, rồi ghim ở lớp khác, rồi hạng geo; cùng hạng giữ thứ tự bid giảm dần.
  const rankOf = (c: OriginCamp) => (isPinned(c) ? -2 : isElsewhere(c) ? -1 : rank ? rank(c) : 1);
  const ordered = camps.map((c, i) => ({ c, i })).sort((a, b) => rankOf(a.c) - rankOf(b.c) || a.i - b.i).map((x) => x.c);
  const isDim = (c: OriginCamp) => rankOf(c) >= 2;
  // Có ghim → hiện sẵn mọi camp đã ghim; chưa ghim → hiện camp đầu.
  const pinnedCount = ordered.filter(isPinned).length;
  const shownCount = Math.max(1, pinnedCount);
  const head = ordered.slice(0, shownCount);
  const rest = ordered.slice(shownCount);
  // Ghim trỏ tới camp không còn chạy (đổi tên, tắt) — báo thay vì lặng lẽ mất.
  const stale = (pinned ?? []).filter((p) => !camps.some((c) => c.camp.toLowerCase() === p.toLowerCase()));

  const Elsewhere = ({ c }: { c: OriginCamp }) =>
    isElsewhere(c) && pinnedElsewhere ? (
      <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 text-[9px] text-slate-500" title={`Đã ghim ở ${pinnedElsewhere.label} (theo keyword, không theo nước)`}>
        <Pin className="h-2.5 w-2.5" />
        {pinnedElsewhere.label}
      </span>
    ) : null;
  const PinBtn = ({ c }: { c: OriginCamp }) =>
    onTogglePin ? (
      <button
        type="button"
        onClick={() => onTogglePin(c.camp)}
        className={cn('rounded px-1 text-[10px]', isPinned(c) ? 'text-indigo-600 hover:bg-indigo-50' : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-700')}
        title={isPinned(c) ? 'Bỏ ghim camp này' : 'Ghim camp này — camp mình thật sự chỉnh bid cho keyword; ghim dùng chung với Underbid'}
      >
        {isPinned(c) ? 'bỏ ghim' : 'ghim'}
      </button>
    ) : null;

  return (
    <div className="min-w-0">
      {head.map((c, idx) => (
        <div key={c.camp} className={cn('flex items-baseline gap-1', idx > 0 && 'mt-0.5')}>
          <CampName camp={c} dim={isDim(c)} isPinned={isPinned(c)} maxW={nameMaxClass} />
          <Elsewhere c={c} />
          <PinBtn c={c} />
          {idx === head.length - 1 && rest.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-600 hover:bg-slate-200"
              title={rest.map((x) => x.camp).join('\n')}
            >
              {open ? '−' : '+'}
              {rest.length}
            </button>
          )}
        </div>
      ))}
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-slate-200 pl-2">
          {rest.map((c) => (
            <li key={c.camp} className="flex items-baseline gap-1">
              <CampName camp={c} dim={isDim(c)} isPinned={isPinned(c)} maxW={nameMaxClass} />
              <Elsewhere c={c} />
              <PinBtn c={c} />
            </li>
          ))}
        </ul>
      )}
      {stale.length > 0 && (
        <div className="mt-0.5 text-[9px] text-amber-600" title={`Camp đã ghim không còn trong danh sách đang chạy: ${stale.join(', ')}`}>
          ⚠️ {stale.length} camp đã ghim không còn chạy
        </div>
      )}
    </div>
  );
}
