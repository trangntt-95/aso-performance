'use client';

import type { ActionQueueRow } from '@/lib/sheets/types';
import { TopActionsList } from './TopActionsList';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  paid: ActionQueueRow[];
  organic: ActionQueueRow[];
  isLoading?: boolean;
  emptyAll?: boolean;
}

export function TopPriorityActionsBlock({ paid, organic, isLoading, emptyAll }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (emptyAll) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No P0 or P1 actions right now.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Paid bidding
          </span>
          <span className="text-[11px] text-slate-500">
            ({paid.length}) — cần quyết định bid / pause / scale
          </span>
        </div>
        {paid.length === 0 ? (
          <div className="border rounded-lg bg-white py-4 text-center text-xs text-slate-500">
            Không có paid action P0/P1.
          </div>
        ) : (
          <TopActionsList rows={paid} />
        )}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Organic / listing
          </span>
          <span className="text-[11px] text-slate-500">
            ({organic.length}) — cần check listing / expand to paid
          </span>
        </div>
        {organic.length === 0 ? (
          <div className="border rounded-lg bg-white py-4 text-center text-xs text-slate-500">
            Không có organic action P0/P1.
          </div>
        ) : (
          <TopActionsList rows={organic} />
        )}
      </div>
    </div>
  );
}
