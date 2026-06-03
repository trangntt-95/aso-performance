'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ActionQueueRow as Row } from '@/lib/sheets/types';
import { PriorityBadge } from './PriorityBadge';
import { StatusDropdown } from './StatusDropdown';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { SurfaceIcon } from '@/components/shared/SurfaceIcon';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { PaidStatusBadge } from '@/components/shared/PaidStatusBadge';
import type { PaidStatus } from '@/lib/sheets/paidStatus';
import { useStatusStore, rowKeyOf } from '@/lib/store/statusStore';
import { alertCopy, actionCopy } from '@/lib/utils/copy';
import { alertStyle, bidActionStyle } from '@/lib/utils/colors';
import { cn } from '@/lib/utils';

function alertAccent(alert: string): string {
  const s = alertStyle(alert);
  if (s.bg.includes('red-700') || s.bg.includes('orange-500')) return 'bg-rose-500';
  if (s.bg.includes('red-100') || s.bg.includes('yellow-200')) return 'bg-rose-300';
  if (s.bg.includes('blue-700') || s.bg.includes('blue-500')) return 'bg-indigo-500';
  if (s.bg.includes('green-700') || s.bg.includes('emerald-100')) return 'bg-emerald-500';
  return 'bg-slate-300';
}

function actionTone(action: string): string {
  const s = bidActionStyle(action);
  if (s.bg.includes('red-700') || s.bg.includes('orange-500')) return 'text-rose-700';
  if (s.bg.includes('green-700') || s.bg.includes('green-800')) return 'text-emerald-700';
  if (s.bg.includes('yellow-200')) return 'text-amber-700';
  return 'text-slate-700';
}

export function ActionQueueRowItem({ row, paidStatus }: { row: Row; paidStatus?: PaidStatus }) {
  const [expanded, setExpanded] = useState(false);
  const rowKey = rowKeyOf(row);
  const status = useStatusStore((s) => s.statuses[rowKey]?.status ?? 'new');
  const faded = status === 'done' || status === 'skipped';

  return (
    <div className={cn('border-b last:border-b-0 transition-opacity relative', faded && 'opacity-50')}>
      <span
        className={cn('absolute left-0 top-0 bottom-0 w-1', alertAccent(row.alert))}
        aria-hidden
      />
      <div className="px-3 py-2 pl-4 hover:bg-slate-50/60">
        {/* Desktop: 2-line keyword cell so KW is readable, meta wraps below */}
        <div className="hidden md:grid items-start gap-2 grid-cols-[1rem_auto_2.5rem_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_8rem]">
          <button
            type="button"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="text-slate-400 hover:text-slate-700 shrink-0 mt-0.5"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <div className="mt-0.5">
            <PriorityBadge priority={row.priority} />
          </div>
          <span className="text-[10px] text-slate-400 font-mono tabular-nums text-right mt-1" title="Score">
            {row.score}
          </span>
          <div className="min-w-0">
            <KeywordLink
              keyword={row.keyword}
              country={row.country !== '(global)' ? row.country : undefined}
              className="font-semibold text-[15px] text-slate-900 truncate block leading-tight"
            />
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <CategoryChip category={row.category} compact />
              {paidStatus && <PaidStatusBadge status={paidStatus} size="xs" />}
              <span className="text-[10px] text-slate-500 inline-flex items-center gap-0.5 shrink-0">
                <SurfaceIcon surface={row.surface} />
                {row.country} · {row.window}
              </span>
            </div>
          </div>
          <span className="text-[12px] text-slate-700 truncate mt-1" title={alertCopy(row.alert)}>
            <span className="font-medium text-slate-900">Vấn đề:</span> {alertCopy(row.alert)}
          </span>
          <span className={cn('text-[12px] truncate font-medium mt-1', actionTone(row.bidAction))} title={actionCopy(row.bidAction)}>
            → {actionCopy(row.bidAction)}
            {row.bidSuggest && row.bidSuggest !== '—' && (
              <span className="ml-1 text-slate-500 font-mono text-[10px]">{row.bidSuggest}</span>
            )}
          </span>
          <div className="shrink-0 mt-0.5">
            <StatusDropdown rowKey={rowKey} />
          </div>
        </div>

        {/* Mobile: stacked */}
        <div className="md:hidden space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              className="text-slate-400 hover:text-slate-700 shrink-0"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <PriorityBadge priority={row.priority} />
            <span className="text-[10px] text-slate-400 font-mono">{row.score}</span>
            <KeywordLink
              keyword={row.keyword}
              country={row.country !== '(global)' ? row.country : undefined}
              className="font-semibold text-[15px] text-slate-900 truncate flex-1"
            />
            <div className="shrink-0">
              <StatusDropdown rowKey={rowKey} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
            <CategoryChip category={row.category} compact />
            {paidStatus && <PaidStatusBadge status={paidStatus} size="xs" />}
            <span>
              <SurfaceIcon surface={row.surface} /> {row.country} · {row.window}
            </span>
          </div>
          <div className="text-[12px] text-slate-700">
            <span className="font-medium text-slate-900">Vấn đề:</span> {alertCopy(row.alert)}
          </div>
          <div className={cn('text-[12px] font-medium', actionTone(row.bidAction))}>
            → {actionCopy(row.bidAction)}
            {row.bidSuggest && row.bidSuggest !== '—' && (
              <span className="ml-1 text-slate-500 font-mono text-[10px]">{row.bidSuggest}</span>
            )}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="bg-slate-50 border-t px-4 py-3 pl-12 text-sm space-y-1.5">
          {row.targetCamp && (
            <div className="flex gap-2 items-start">
              <span className="font-medium text-slate-700 shrink-0">Target Camp:</span>
              <code className="bg-white px-2 py-0.5 rounded border text-[12px] break-all">
                {row.targetCamp}
              </code>
            </div>
          )}
          {row.note && (
            <div className="flex gap-2 items-start">
              <span className="font-medium text-slate-700 shrink-0">Note:</span>
              <span className="text-slate-700">{row.note}</span>
            </div>
          )}
          {row.keyStats && (
            <div className="text-[12px] text-slate-600 font-mono break-all">
              <span className="font-medium">Key Stats:</span> {row.keyStats}
            </div>
          )}
          <div className="text-[11px] text-slate-400">
            Raw alert: <code>{row.alert}</code> · Raw action: <code>{row.bidAction}</code> · Score: {row.score}
          </div>
        </div>
      )}
    </div>
  );
}
