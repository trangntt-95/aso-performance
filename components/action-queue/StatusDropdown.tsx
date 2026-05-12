'use client';

import { Check, ChevronDown, Circle, CircleDashed, CircleSlash, Clock, MoonStar } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RowStatus } from '@/lib/sheets/types';
import { useStatusStore } from '@/lib/store/statusStore';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: RowStatus; label: string; Icon: typeof Circle; className: string }> = [
  { value: 'new', label: 'New', Icon: Circle, className: 'text-gray-500' },
  { value: 'in_progress', label: 'In progress', Icon: CircleDashed, className: 'text-blue-600' },
  { value: 'done', label: 'Done', Icon: Check, className: 'text-emerald-600' },
  { value: 'skipped', label: 'Skipped', Icon: CircleSlash, className: 'text-gray-400' },
  { value: 'snoozed', label: 'Snoozed', Icon: MoonStar, className: 'text-purple-500' },
];

const STATUS_LABEL: Record<RowStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
  snoozed: 'Snoozed',
};

export function StatusDropdown({ rowKey }: { rowKey: string }) {
  const status = useStatusStore((s) => s.statuses[rowKey]?.status ?? 'new');
  const setStatus = useStatusStore((s) => s.setStatus);
  const current = OPTIONS.find((o) => o.value === status) ?? OPTIONS[0];
  const Icon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 px-2 py-1 rounded border bg-white text-xs hover:bg-gray-50 shrink-0"
      >
        <Icon className={cn('h-3 w-3', current.className)} />
        <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
        <Clock className="h-3 w-3 text-gray-400 sm:hidden" />
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {OPTIONS.map(({ value, label, Icon: ItemIcon, className }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setStatus(rowKey, value)}
            className="gap-2"
          >
            <ItemIcon className={cn('h-3.5 w-3.5', className)} />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
