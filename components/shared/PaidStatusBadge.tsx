import type { PaidStatus } from '@/lib/sheets/paidStatus';
import { cn } from '@/lib/utils';

export function PaidStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: PaidStatus;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const text = size === 'xs' ? 'text-[9px]' : 'text-[10px]';
  const pad = size === 'xs' ? 'px-1 py-0' : 'px-1.5 py-0.5';
  // In the Negative KW list (and not bid elsewhere) → explicitly handled, no badge.
  if (status.negative) {
    return null;
  }
  if (!status.inPaid) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded font-medium bg-slate-100 text-slate-500',
          pad,
          text,
          className,
        )}
        title="Không tìm thấy trong Master KW Lookup, KW_Added_Manual và Negative KW list"
      >
        ❌ Not in Paid
      </span>
    );
  }
  if (status.source === 'manual') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded font-medium bg-indigo-100 text-indigo-900',
          pad,
          text,
          className,
        )}
        title={[status.manualCamp, status.manualNote].filter(Boolean).join(' · ') || 'Manual add'}
      >
        ✍️ Added (manual)
      </span>
    );
  }
  const camps = status.masterCamps ?? [];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-medium bg-amber-100 text-amber-900',
        pad,
        text,
        className,
      )}
      title={
        camps.length > 0
          ? `Master KW Lookup · ${camps.length} camp${camps.length === 1 ? '' : 's'}: ${camps.slice(0, 3).join(' · ')}${camps.length > 3 ? ` (+${camps.length - 3})` : ''}`
          : 'Master KW Lookup'
      }
    >
      📌 In Paid
    </span>
  );
}
