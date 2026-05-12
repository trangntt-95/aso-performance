'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ActionQueueRow as Row } from '@/lib/sheets/types';
import { PriorityBadge } from './PriorityBadge';
import { AlertBadge } from './AlertBadge';
import { BidActionBadge } from './BidActionBadge';
import { StatusDropdown } from './StatusDropdown';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { SurfaceIcon } from '@/components/shared/SurfaceIcon';
import { useStatusStore, rowKeyOf } from '@/lib/store/statusStore';
import { cn } from '@/lib/utils';

export function ActionQueueRowItem({ row }: { row: Row }) {
  const [expanded, setExpanded] = useState(false);
  const rowKey = rowKeyOf(row);
  const status = useStatusStore((s) => s.statuses[rowKey]?.status ?? 'new');
  const faded = status === 'done' || status === 'skipped';

  return (
    <div className={cn('border-b transition-opacity', faded && 'opacity-50')}>
      <div
        className="flex items-center gap-2 md:gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="text-gray-400 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <PriorityBadge priority={row.priority} />
        <span className="text-[11px] text-gray-500 font-mono w-8 text-right shrink-0 hidden sm:inline">
          {row.score}
        </span>
        <CategoryChip category={row.category} compact />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate text-sm">{row.keyword}</div>
          <div className="text-[11px] text-gray-500 flex gap-2 items-center">
            <SurfaceIcon surface={row.surface} />
            <span>{row.country}</span>
            <span className="text-gray-300">·</span>
            <span>{row.window}</span>
          </div>
        </div>
        <div className="hidden md:block">
          <AlertBadge alert={row.alert} compact />
        </div>
        <BidActionBadge action={row.bidAction} suggest={row.bidSuggest} />
        <StatusDropdown rowKey={rowKey} />
      </div>
      {expanded && (
        <div className="bg-gray-50 border-t px-4 py-3 pl-10 text-sm space-y-2">
          <div className="md:hidden">
            <AlertBadge alert={row.alert} />
          </div>
          {row.targetCamp && (
            <div className="flex gap-2 items-start">
              <span className="font-semibold text-gray-700 shrink-0">Target Camp:</span>
              <code className="bg-white px-2 py-0.5 rounded border text-[12px] break-all">
                {row.targetCamp}
              </code>
            </div>
          )}
          {row.note && (
            <div className="flex gap-2 items-start">
              <span className="font-semibold text-gray-700 shrink-0">Note:</span>
              <span className="text-gray-700">{row.note}</span>
            </div>
          )}
          {row.keyStats && (
            <div className="text-[12px] text-gray-600 font-mono break-all">
              <span className="font-semibold not-italic">Key Stats:</span> {row.keyStats}
            </div>
          )}
          <div className="text-[11px] text-gray-400">Score: {row.score}</div>
        </div>
      )}
    </div>
  );
}
