import type { AlertType } from '@/lib/sheets/types';
import { alertStyle } from '@/lib/utils/colors';
import { cn } from '@/lib/utils';

export function AlertBadge({ alert, compact }: { alert: AlertType | string; compact?: boolean }) {
  const s = alertStyle(alert as AlertType);
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs whitespace-nowrap',
        s.bg,
        s.text,
        s.bold && 'font-semibold',
        compact ? 'max-w-[10rem] truncate' : 'max-w-[16rem] truncate',
      )}
      title={alert}
    >
      {alert}
    </span>
  );
}
