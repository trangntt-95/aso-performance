'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ActionQueueRow } from '@/lib/sheets/types';
import { PriorityBadge } from '@/components/action-queue/PriorityBadge';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { alertCopy, actionCopy } from '@/lib/utils/copy';
import { alertStyle, bidActionStyle } from '@/lib/utils/colors';
import { stripLeadingIcon } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

function alertAccent(alert: string): string {
  const s = alertStyle(alert);
  // Map a thin colour bar from the badge bg
  if (s.bg.includes('red-700') || s.bg.includes('orange-500')) return 'bg-rose-500';
  if (s.bg.includes('red-100') || s.bg.includes('yellow-200')) return 'bg-rose-300';
  if (s.bg.includes('blue-700') || s.bg.includes('blue-500')) return 'bg-indigo-500';
  if (s.bg.includes('green-700') || s.bg.includes('emerald-100')) return 'bg-emerald-500';
  return 'bg-slate-300';
}

function actionAccent(action: string): string {
  const s = bidActionStyle(action);
  if (s.bg.includes('red-700') || s.bg.includes('orange-500')) return 'text-rose-700';
  if (s.bg.includes('green-700') || s.bg.includes('green-800')) return 'text-emerald-700';
  if (s.bg.includes('yellow-200')) return 'text-amber-700';
  return 'text-slate-700';
}

export function TopActionsList({ rows }: { rows: ActionQueueRow[] }) {
  return (
    <div className="border rounded-lg overflow-hidden divide-y bg-white">
      {rows.map((r, i) => (
        <article
          key={`${r.keyword}-${i}`}
          className="relative px-4 py-3 hover:bg-slate-50/60 transition"
        >
          <span
            className={cn('absolute left-0 top-0 bottom-0 w-1', alertAccent(r.alert))}
            aria-hidden
          />
          <div className="flex items-start gap-3">
            <PriorityBadge priority={r.priority} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <KeywordLink
                  keyword={r.keyword}
                  country={r.country !== '(global)' ? r.country : undefined}
                  className="font-semibold text-sm"
                />
                <CategoryChip category={r.category} compact />
                <span className="text-[11px] text-slate-500">
                  {r.country} · {r.surface} · {r.window}
                </span>
              </div>

              <div className="mt-1.5 flex items-start gap-1.5 text-[13px] text-slate-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-rose-500" />
                <span className="flex-1">
                  <span className="font-medium text-slate-900">Vấn đề:</span> {alertCopy(r.alert)}
                  <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wide text-slate-400">
                    {stripLeadingIcon(r.alert) || r.alert}
                  </span>
                </span>
              </div>

              <div className="mt-1 flex items-start gap-1.5 text-[13px] text-slate-700">
                <CheckCircle2 className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', actionAccent(r.bidAction))} />
                <span className="flex-1">
                  <span className="font-medium text-slate-900">Hành động:</span>{' '}
                  <span className={cn('font-semibold', actionAccent(r.bidAction))}>
                    {actionCopy(r.bidAction)}
                  </span>
                  <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wide text-slate-400">
                    {r.bidAction}
                  </span>
                  {r.bidSuggest && r.bidSuggest !== '—' && (
                    <span className="ml-2 text-slate-600 font-mono text-xs">Bid {r.bidSuggest}</span>
                  )}
                  {r.targetCamp && (
                    <span className="ml-2 text-[11px] text-slate-500">
                      → <code className="bg-slate-100 px-1.5 py-0.5 rounded">{r.targetCamp}</code>
                    </span>
                  )}
                </span>
              </div>

              {r.note && (
                <p className="mt-1.5 text-[12px] text-slate-500 italic line-clamp-2">{r.note}</p>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
