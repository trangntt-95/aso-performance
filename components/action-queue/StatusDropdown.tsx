'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Circle, CircleDashed, CircleSlash, MoonStar } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RowStatus } from '@/lib/sheets/types';
import { useStatusStore } from '@/lib/store/statusStore';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: RowStatus; label: string; Icon: LucideIcon; iconCls: string }> = [
  { value: 'new', label: 'New', Icon: Circle, iconCls: 'text-slate-500' },
  { value: 'in_progress', label: 'In progress', Icon: CircleDashed, iconCls: 'text-blue-600' },
  { value: 'done', label: 'Done', Icon: Check, iconCls: 'text-emerald-600' },
  { value: 'skipped', label: 'Skipped', Icon: CircleSlash, iconCls: 'text-slate-400' },
  { value: 'snoozed', label: 'Snoozed', Icon: MoonStar, iconCls: 'text-purple-500' },
];

const STATUS_LABEL: Record<RowStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
  snoozed: 'Snoozed',
};

const BTN_TONE: Record<RowStatus, string> = {
  new: 'border-slate-200 bg-white text-slate-700',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  skipped: 'border-slate-200 bg-slate-100 text-slate-500',
  snoozed: 'border-purple-200 bg-purple-50 text-purple-700',
};

export function StatusDropdown({ rowKey }: { rowKey: string }) {
  const status = useStatusStore((s) => s.statuses[rowKey]?.status ?? 'new');
  const setStatus = useStatusStore((s) => s.setStatus);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.value === status) ?? OPTIONS[0];
  const Icon = current.Icon;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium transition shrink-0 hover:shadow-sm',
          BTN_TONE[status],
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon className={cn('h-3 w-3', current.iconCls)} />
        <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[10rem] py-1"
          role="menu"
        >
          {OPTIONS.map(({ value, label, Icon: ItemIcon, iconCls }) => {
            const active = value === status;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setStatus(rowKey, value);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-slate-50 transition',
                  active && 'bg-slate-50',
                )}
              >
                <ItemIcon className={cn('h-3.5 w-3.5', iconCls)} />
                <span className="flex-1">{label}</span>
                {active && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
