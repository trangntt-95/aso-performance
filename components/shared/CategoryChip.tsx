import type { Category } from '@/lib/sheets/types';
import { categoryStyle } from '@/lib/utils/colors';
import { cn } from '@/lib/utils';

export function CategoryChip({ category, compact }: { category: Category | string; compact?: boolean }) {
  const s = categoryStyle(category as Category);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]',
        s.bg,
        s.text,
      )}
      title={category}
    >
      <span>{s.emoji}</span>
      {!compact && <span>{category}</span>}
    </span>
  );
}
