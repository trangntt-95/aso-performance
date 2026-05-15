import type { BidAction } from '@/lib/sheets/types';
import { bidActionStyle } from '@/lib/utils/colors';
import { cn } from '@/lib/utils';

export function BidActionBadge({ action, suggest }: { action: BidAction | string; suggest?: string }) {
  const s = bidActionStyle(action as BidAction);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded text-xs whitespace-nowrap',
          s.bg,
          s.text,
          s.bold && 'font-semibold',
        )}
      >
        {action}
      </span>
      {suggest && suggest !== '—' && (
        <span className="text-[10px] text-slate-500 font-mono">{suggest}</span>
      )}
    </div>
  );
}
