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

function CampName({ camp, dim, isPinned, maxW, hint }: { camp: OriginCamp; dim: boolean; isPinned: boolean; maxW: string; hint?: string }) {
  // maxW rỗng = không cắt tên (Trang 22/09/2026: tên camp phải đọc đủ, bảng kéo ngang).
  const clip = maxW ? 'truncate' : '';
  return (
    <span className={cn('flex items-baseline gap-1 whitespace-nowrap', dim && 'opacity-50')} title={[camp.camp, hint, dim ? 'không phủ nước này' : ''].filter(Boolean).join(' — ')}>
      {isPinned && <Pin className="h-3 w-3 shrink-0 self-center text-indigo-500" />}
      {camp.url ? (
        <a href={camp.url} target="_blank" rel="noopener noreferrer" className={cn('inline-flex items-baseline gap-1 text-[11px] text-indigo-600 hover:underline', clip, maxW, isPinned && 'font-medium')}>
          <span className={clip}>{camp.camp}</span>
          <ExternalLink className="h-2.5 w-2.5 shrink-0 self-center" />
        </a>
      ) : (
        <span className={cn('text-[11px] text-slate-700', clip, maxW, isPinned && 'font-medium')}>{camp.camp}</span>
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
  nameMaxClass = '',
  hintOf,
  noCoverLabel,
  suggested,
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
  /** Lớp max-width cho tên camp; mặc định rỗng = hiện đủ tên, bảng kéo ngang. */
  nameMaxClass?: string;
  /** Dòng giải thích vì sao camp xếp ở đó (vd. "Geo: Spain", "Tên: Tier 2") — vào tooltip. */
  hintOf?: (camp: OriginCamp) => string | undefined;
  /** Hiện khi không camp nào ở hạng 0/1 — tức chưa có camp phủ nước của dòng. */
  noCoverLabel?: string;
  /** Camp Camp_Links có Geo gồm nước của dòng nhưng Master KW Lookup không có
   *  keyword nào của nó → có thể đang bid keyword này mà dashboard không biết.
   *  Liệt kê như gợi ý thường (tên + URL, nhãn "Geo") khi không camp nào trong
   *  Master gọi tên nước rõ; không phải cảnh báo. */
  suggested?: { camps: { camp: string; url: string }[]; hint: string };
}) {
  const [open, setOpen] = useState(false);
  const pinnedLc = new Set((pinned ?? []).map((p) => p.toLowerCase()));
  const suggestedCamps: OriginCamp[] = (suggested?.camps ?? []).map((x) => ({ camp: x.camp, url: x.url || undefined, bidMax: null, paused: false }));
  const Suggested = ({ show }: { show: boolean }) =>
    show && suggested && suggestedCamps.length > 0 ? (
      <>
        {suggestedCamps.map((c) => (
          <div key={`geo-${c.camp}`} className="flex items-baseline gap-1">
            <CampName camp={c} dim={false} isPinned={pinnedLc.has(c.camp.toLowerCase())} maxW={nameMaxClass} hint={suggested.hint} />
            <span className="rounded bg-sky-50 px-1 text-[9px] text-sky-700" title={suggested.hint}>
              Geo
            </span>
            {onTogglePin && (
              <button
                type="button"
                onClick={() => onTogglePin(c.camp)}
                className={cn('rounded px-1 text-[10px]', pinnedLc.has(c.camp.toLowerCase()) ? 'text-indigo-600 hover:bg-indigo-50' : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-700')}
              >
                {pinnedLc.has(c.camp.toLowerCase()) ? 'bỏ ghim' : 'ghim'}
              </button>
            )}
          </div>
        ))}
      </>
    ) : null;
  if (camps.length === 0) {
    return (
      <div className="min-w-0">
        <Suggested show />
        {suggestedCamps.length === 0 && <span className="text-[11px] text-slate-400">{emptyLabel}</span>}
      </div>
    );
  }
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
  const stale = (pinned ?? []).filter((p) => !camps.concat(suggestedCamps).some((c) => c.camp.toLowerCase() === p.toLowerCase()));

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

  const noneCovers = rank ? ordered.every((c) => !isPinned(c) && rankOf(c) >= 2) : false;
  // Không camp nào gọi tên nước này rõ (Geo hoặc tên) → camp Geo thiếu trong
  // Master có thể chính là camp thật đang bid: gợi ý nó lên đầu.
  const noneExplicit = rank ? ordered.every((c) => !isPinned(c) && rank(c) !== 0) : false;
  return (
    <div className="min-w-0">
      <Suggested show={noneExplicit} />
      {noneCovers && noCoverLabel && (
        <div className="mb-0.5 text-[10px] text-amber-700" title="Mọi camp đang bid keyword này đều có Geo hoặc tên không gồm nước của dòng.">
          ⚠️ {noCoverLabel}
        </div>
      )}
      {head.map((c, idx) => (
        <div key={c.camp} className={cn('flex items-baseline gap-1', idx > 0 && 'mt-0.5')}>
          <CampName camp={c} dim={isDim(c)} isPinned={isPinned(c)} maxW={nameMaxClass} hint={hintOf?.(c)} />
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
              <CampName camp={c} dim={isDim(c)} isPinned={isPinned(c)} maxW={nameMaxClass} hint={hintOf?.(c)} />
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
