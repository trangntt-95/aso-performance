'use client';

import { useSheetData } from '@/lib/hooks/useSheetData';

// A one-line footer naming the spreadsheets a screen was built from.
//
// Deliberately tiny and last. It answers one question — "where does this come
// from" — that otherwise costs a trip through the code, and it stops being
// answerable at all once numbers are quoted out of context. The links come from
// the payload rather than being written here, so renaming a sheet or repointing
// an id never leaves stale prose behind.
export function SheetSources() {
  const { data } = useSheetData();
  const sources = data?.sheetSources ?? [];
  if (!sources.length) return null;
  return (
    <div className="text-[10px] text-slate-400">
      Nguồn:{' '}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ' · '}
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-600 hover:underline"
          >
            {s.label}
          </a>
        </span>
      ))}
      {data?.fetchedAt && (
        <>
          {' '}· đọc lúc{' '}
          {new Date(data.fetchedAt).toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
          })}
        </>
      )}
    </div>
  );
}
