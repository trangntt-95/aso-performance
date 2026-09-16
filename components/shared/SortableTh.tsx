'use client';

import type { ReactNode } from 'react';
import type { SortDir } from '@/lib/hooks/useTableSort';
import { cn } from '@/lib/utils';

// Tiêu đề cột sắp được: bấm để sắp theo cột, bấm lại để đảo chiều; mũi tên
// ▲/▼ ở cột đang sắp. Dùng cùng useTableSort. `children` cho tiêu đề hai
// dòng (nhãn + dòng phụ nhỏ); `label` cho tiêu đề một dòng.

export function SortableTh<K extends string>({
  col,
  sortKey,
  sortDir,
  onSort,
  label,
  children,
  align = 'right',
  title,
  className,
  colSpan,
}: {
  col: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  label?: ReactNode;
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  title?: string;
  className?: string;
  colSpan?: number;
}) {
  const active = sortKey === col;
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      onClick={() => onSort(col)}
      title={title ? `${title} · bấm để sắp, bấm lại để đảo chiều` : 'Bấm để sắp theo cột này, bấm lại để đảo chiều'}
      colSpan={colSpan}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('cursor-pointer select-none font-medium hover:text-slate-900', alignCls, active && 'text-indigo-700', className)}
    >
      <span className={cn('inline-flex items-start gap-0.5', align === 'right' && 'flex-row-reverse')}>
        <span>{children ?? label}</span>
        <span className="w-2 text-[9px] leading-4 text-indigo-600">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
      </span>
    </th>
  );
}
