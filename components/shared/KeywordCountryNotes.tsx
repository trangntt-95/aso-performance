'use client';

import { Pin } from 'lucide-react';
import { useNotesStore } from '@/lib/store/notesStore';
import { readKeywordCountryNotes } from '@/lib/store/keywordNotes';
import { cn } from '@/lib/utils';

// Note và ghim theo NƯỚC của một keyword (ghi ở tab Vị trí keyword), hiện
// đọc-chỉ dưới ô note keyword ở Underbid / Paid Coverage / trend sheet. Đọc-chỉ
// vì sửa "profit ở Úc" phải làm ở dòng profit × Australia, nơi có số của Úc.

export function KeywordCountryNotes({ keyword, highlight, className }: { keyword: string; highlight?: string; className?: string }) {
  const items = useNotesStore((s) => readKeywordCountryNotes(s.notes, keyword));
  if (items.length === 0) return null;
  return (
    <div className={cn('mt-1 space-y-0.5 border-t border-slate-100 pt-1', className)}>
      <div className="text-[9px] font-medium text-slate-400">Theo nước (từ Vị trí keyword)</div>
      {items.map((it) => (
        <div
          key={it.country}
          className={cn('text-[10px] leading-snug text-slate-600', highlight && it.country === highlight && 'rounded bg-amber-50 px-1 text-amber-900')}
          title={`${keyword} × ${it.country}${it.pins.length ? ` · ghim: ${it.pins.join(', ')}` : ''}`}
        >
          <span className="font-medium">{it.country}:</span>{' '}
          {it.note && <span className="italic whitespace-pre-line">“{it.note}”</span>}
          {it.pins.length > 0 && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-indigo-600">
              <Pin className="h-2.5 w-2.5" />
              {it.pins.join(', ')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
