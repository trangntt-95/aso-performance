'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import type { ActionQueueRow as Row } from '@/lib/sheets/types';
import { PriorityBadge } from './PriorityBadge';
import { StatusDropdown } from './StatusDropdown';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { SurfaceIcon } from '@/components/shared/SurfaceIcon';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { useStatusStore, rowKeyOf } from '@/lib/store/statusStore';
import { alertCopy, actionCopy } from '@/lib/utils/copy';
import { alertStyle, bidActionStyle } from '@/lib/utils/colors';
import { stripLeadingIcon } from '@/lib/utils/format';
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

export function ActionQueueRowItem({ row }: { row: Row }) {
  const [expanded, setExpanded] = useState(false);
  const rowKey = rowKeyOf(row);
  const status = useStatusStore((s) => s.statuses[rowKey]?.status ?? 'new');
  const faded = status === 'done' || status === 'skipped';

  return (
    <div className={cn('border-b transition-opacity relative', faded && 'opacity-50')}>
      <span
        className={cn('absolute left-0 top-0 bottom-0 w-1', alertAccent(row.alert))}
        aria-hidden
      />
      <div className="px-3 py-2.5 pl-4 hover:bg-slate-50/60">
        <div className="flex items-start gap-2 md:gap-3">
          <button
            type="button"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="text-slate-400 hover:text-slate-700 shrink-0 mt-0.5 p-0.5 rounded hover:bg-slate-100"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <PriorityBadge priority={row.priority} />
          <span className="text-[11px] text-slate-400 font-mono w-8 text-right shrink-0 hidden sm:inline mt-0.5">
            {row.score}
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <KeywordLink
                keyword={row.keyword}
                country={row.country !== '(global)' ? row.country : undefined}
                className="font-semibold text-sm truncate"
              />
              <CategoryChip category={row.category} compact />
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                <SurfaceIcon surface={row.surface} />
                {row.country} · {row.window}
              </span>
            </div>
            <div className="flex items-start gap-1.5 text-[12.5px] text-slate-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-rose-500" />
              <span className="flex-1">
                <span className="font-medium text-slate-900">Vấn đề:</span> {alertCopy(row.alert)}
                <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wide text-slate-400">
                  {stripLeadingIcon(row.alert) || row.alert}
                </span>
              </span>
            </div>
            <div className="flex items-start gap-1.5 text-[12.5px] text-slate-700">
              <CheckCircle2 className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', actionTone(row.bidAction))} />
              <span className="flex-1">
                <span className="font-medium text-slate-900">Hành động:</span>{' '}
                <span className={cn('font-semibold', actionTone(row.bidAction))}>
                  {actionCopy(row.bidAction)}
                </span>
                <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wide text-slate-400">
                  {row.bidAction}
                </span>
                {row.bidSuggest && row.bidSuggest !== '—' && (
                  <span className="ml-2 text-slate-600 font-mono text-xs">Bid {row.bidSuggest}</span>
                )}
              </span>
            </div>
          </div>
          <div className="shrink-0 mt-0.5">
            <StatusDropdown rowKey={rowKey} />
          </div>
        </div>
      </div>
      {expanded && (
        <div className="bg-slate-50 border-t px-4 py-3 pl-12 text-sm space-y-2">
          {row.targetCamp && (
            <div className="flex gap-2 items-start">
              <span className="font-semibold text-slate-700 shrink-0">Target Camp:</span>
              <code className="bg-white px-2 py-0.5 rounded border text-[12px] break-all">
                {row.targetCamp}
              </code>
            </div>
          )}
          {row.note && (
            <div className="flex gap-2 items-start">
              <span className="font-semibold text-slate-700 shrink-0">Note:</span>
              <span className="text-slate-700">{row.note}</span>
            </div>
          )}
          {row.keyStats && (
            <div className="text-[12px] text-slate-600 font-mono break-all">
              <span className="font-semibold">Key Stats:</span> {row.keyStats}
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
