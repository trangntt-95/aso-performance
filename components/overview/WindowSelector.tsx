'use client';

import { OVERVIEW_WINDOWS, type OverviewWindow, windowDays } from './aggregate';
import { cn } from '@/lib/utils';

interface Props {
  value: OverviewWindow;
  onChange: (w: OverviewWindow) => void;
}

export function WindowSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
      {OVERVIEW_WINDOWS.map((w) => {
        const active = w === value;
        return (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition',
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
            title={`Last ${windowDays(w)} days`}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}
