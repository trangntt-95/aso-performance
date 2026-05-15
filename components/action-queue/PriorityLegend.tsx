'use client';

import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const LEVELS: Array<{ key: 'P0' | 'P1' | 'P2' | 'P3'; tone: string; label: string; meaning: string }> = [
  {
    key: 'P0',
    tone: 'bg-rose-700 text-white',
    label: 'Critical',
    meaning: 'Incident nghiêm trọng — users giảm + rank tụt cùng lúc trên keyword có volume. Fix trong 1-2 ngày.',
  },
  {
    key: 'P1',
    tone: 'bg-orange-500 text-white',
    label: 'High',
    meaning: 'Một alert âm rõ ràng (rank tụt, install/CR giảm) hoặc cơ hội geo lớn (organic mạnh + paid chưa bid).',
  },
  {
    key: 'P2',
    tone: 'bg-yellow-300 text-black',
    label: 'Medium',
    meaning: 'Alert âm nhưng volume thấp, hoặc cơ hội geo cỡ vừa. Plan trong tuần.',
  },
  {
    key: 'P3',
    tone: 'bg-slate-300 text-slate-800',
    label: 'Low / info',
    meaning: 'Alert nhỏ, positive signal hoặc keyword volume thấp. Để cuối hàng đợi.',
  },
];

export function PriorityLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
      >
        <Info className="h-3.5 w-3.5 text-indigo-600" />
        <span className="font-medium text-slate-900">Priority P0–P3 nghĩa là gì?</span>
        <span className="ml-auto text-slate-400">{open ? 'Thu gọn' : 'Xem'}</span>
      </button>
      {open && (
        <div className="border-t px-3 py-3 space-y-2 text-xs text-slate-700">
          {LEVELS.map(({ key, tone, label, meaning }) => (
            <div key={key} className="flex gap-2 items-start">
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded text-[11px] font-bold shrink-0',
                  tone,
                )}
              >
                {key}
              </span>
              <div>
                <span className="font-medium text-slate-900">{label}.</span>{' '}
                <span className="text-slate-600">{meaning}</span>
              </div>
            </div>
          ))}
          <div className="text-[11px] text-slate-400 pt-1 border-t">
            Score (cột số nhỏ bên cạnh P-badge) = composite của severity × volume × surface. Trong cùng 1 priority, sort theo score desc.
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[10px] text-slate-400 hover:text-slate-600 inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> close
          </button>
        </div>
      )}
    </div>
  );
}
