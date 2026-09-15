'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeKeywordQuery, parseKeywordQuery } from '@/lib/utils/keywordQuery';

// Ô tìm kiếm hiểu "chứa / không chứa", dùng chung cho mọi bảng keyword.
//
// Một ô duy nhất thay cho một hàng dropdown điều kiện: xem lib/utils/
// keywordQuery.ts để biết vì sao chọn cú pháp. Điều kiện đã hiểu được hiện lại
// thành chip — nếu không thấy điều kiện mình vừa gõ, tức là nó chưa được hiểu.

export const KEYWORD_QUERY_TITLE =
  'Nhiều điều kiện cùng lúc:\n' +
  '  profit calculator   → chứa CẢ HAI từ\n' +
  '  profit -test        → chứa "profit", KHÔNG chứa "test"\n' +
  '  "true profit"       → đúng cụm, có dấu cách\n' +
  '  -"low bid"          → loại cả cụm\n' +
  'Dấu ! dùng thay được cho −.';

export function KeywordSearchBox({
  value,
  onChange,
  placeholder = 'Tìm: profit -test  ·  cách = VÀ, dấu − = loại',
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const conditions = describeKeywordQuery(parseKeywordQuery(value));
  return (
    <div className={cn('flex min-w-[180px] flex-1 items-center gap-2', className)}>
      <div className="relative min-w-[170px] max-w-xs flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          title={KEYWORD_QUERY_TITLE}
          className="h-7 w-full rounded-md border border-slate-200 py-1 pl-7 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Xóa tìm kiếm"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        )}
      </div>
      {conditions.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {conditions.map((c) => (
            <span
              key={(c.negated ? '-' : '+') + c.label}
              className={
                c.negated
                  ? 'rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700 ring-1 ring-rose-200'
                  : 'rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700'
              }
              title={c.negated ? 'không chứa' : 'có chứa'}
            >
              {c.negated ? '−' : ''}
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
