import type { AlertType } from '@/lib/sheets/types';
import { alertStyle } from '@/lib/utils/colors';
import { cn } from '@/lib/utils';

export function AlertBadge({ alert, compact }: { alert: AlertType | string; compact?: boolean }) {
  const s = alertStyle(alert as AlertType);
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded',
        s.bg,
        s.text,
        s.bold && 'font-semibold',
        compact ? 'text-[11px]' : 'text-xs',
      )}
      title={alert}
    >
      {alert}
    </span>
  );
}
