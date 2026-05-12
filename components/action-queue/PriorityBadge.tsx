import type { Priority } from '@/lib/sheets/types';
import { PRIORITY_STYLES } from '@/lib/utils/colors';
import { cn } from '@/lib/utils';

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.P3;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded text-xs',
        s.bg,
        s.text,
        s.bold && 'font-bold',
      )}
    >
      {priority}
    </span>
  );
}
