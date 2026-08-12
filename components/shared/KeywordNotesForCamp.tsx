'use client';

import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import type { KeywordNoteForCamp } from '@/lib/store/campNotes';

// Keyword notes that reached this campaign because the keyword pinned it on the
// Underbid page.
//
// Shown beside the campaign note, never merged into it: "raised the bid on
// 'attribution'" and "cut this camp's bid 20%" are different statements about
// different things, and one text box would have each overwrite the other. Read
// only — the keyword note is edited where it belongs, on Underbid.

export function KeywordNotesForCamp({ items }: { items: KeywordNoteForCamp[] }) {
  if (items.length === 0) return null;
  const withNote = items.filter((i) => i.note.trim());
  return (
    <div className="mt-1 border-t border-slate-100 pt-1">
      <div className="flex items-center gap-1 text-[9px] font-medium text-slate-400">
        <TrendingUp className="h-2.5 w-2.5" />
        Từ Underbid ({items.length} kw đã ghim camp này)
      </div>
      <div className="mt-0.5 space-y-0.5">
        {items.slice(0, 4).map((i) => (
          <Link
            key={i.keyword}
            href={`/underbid?keyword=${encodeURIComponent(i.keyword)}`}
            className="block text-[10px] leading-snug hover:bg-slate-50"
            title={i.note ? `${i.keyword}: ${i.note}` : `${i.keyword} — chưa có ghi chú`}
          >
            <span className="font-medium text-indigo-600">{i.keyword}</span>
            {i.note ? (
              <span className="text-slate-500"> · {i.note}</span>
            ) : (
              <span className="text-slate-300"> · (chưa ghi chú)</span>
            )}
          </Link>
        ))}
        {items.length > 4 && (
          <div className="text-[9px] text-slate-400">
            …còn {items.length - 4} keyword{withNote.length ? '' : ' (chưa ghi chú)'}
          </div>
        )}
      </div>
    </div>
  );
}
