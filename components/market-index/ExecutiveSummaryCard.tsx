'use client';

import { AlertTriangle, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { ExecutiveSummary } from '@/lib/sheets/types';
import { Card, CardContent } from '@/components/ui/card';
import { formatPercent, stripLeadingIcon } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

function statusTone(status?: string): string {
  if (!status) return 'bg-slate-100 text-slate-700';
  const s = status.toUpperCase();
  if (s.includes('CRITICAL')) return 'bg-rose-700 text-white';
  if (s.includes('HIGH') || s.includes('WORSENED') || s.includes('BELOW')) return 'bg-rose-100 text-rose-900';
  if (s.includes('ACTIONABLE')) return 'bg-blue-100 text-blue-900';
  if (s.includes('IMPROVED') || s.includes('ON_TARGET')) return 'bg-emerald-100 text-emerald-900';
  return 'bg-slate-100 text-slate-700';
}

function healthTone(value?: string): string {
  if (!value) return 'bg-slate-100 text-slate-700';
  const v = value.toUpperCase();
  if (v.includes('DOWN') || v.includes('DECLINE')) return 'bg-rose-700 text-white';
  if (v.includes('UP') || v.includes('GROWTH')) return 'bg-emerald-700 text-white';
  if (v.includes('STABLE')) return 'bg-slate-200 text-slate-800';
  return 'bg-amber-100 text-amber-900';
}

interface Props {
  data: ExecutiveSummary;
}

export function ExecutiveSummaryCard({ data }: Props) {
  const pacingPct = data.installVsTarget !== undefined ? formatPercent(data.installVsTarget) : null;
  const pacingTone = (data.installVsTarget ?? 0) < 0.7 ? 'text-rose-700' : 'text-emerald-700';
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-900">Executive summary — scan trong 30 giây</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Overall health */}
          {data.overallHealth && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Overall health</div>
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide',
                  healthTone(data.overallHealth.value),
                )}
              >
                {data.overallHealth.value.replace(/_/g, ' ')}
              </span>
              {data.overallHealth.visual && (
                <div className="text-[11px] text-slate-600">
                  {stripLeadingIcon(data.overallHealth.visual) || data.overallHealth.visual}
                </div>
              )}
              {data.overallHealth.status && (
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    statusTone(data.overallHealth.status),
                  )}
                >
                  {data.overallHealth.status}
                </span>
              )}
            </div>
          )}

          {/* Top concern */}
          {data.topConcern && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-rose-700 inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Top concern
              </div>
              <div className="text-sm text-slate-900 font-medium leading-snug">
                {data.topConcern.value}
              </div>
              {data.topConcern.status && (
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    statusTone(data.topConcern.status),
                  )}
                >
                  {data.topConcern.status}
                </span>
              )}
            </div>
          )}

          {/* Top opportunity */}
          {data.topOpportunity && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Top opportunity
              </div>
              <div className="text-sm text-slate-900 font-medium leading-snug">
                {data.topOpportunity.value}
              </div>
              {data.topOpportunity.status && (
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    statusTone(data.topOpportunity.status),
                  )}
                >
                  {data.topOpportunity.status}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Install pacing row */}
        {data.installPerDayL7 !== undefined && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-wider text-slate-500">
              <Target className="h-3 w-3" />
              Install pacing
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <div>
                <span className="text-xl font-semibold text-slate-900 tabular-nums">
                  {data.installPerDayL7.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 ml-1">install/day · L7</span>
              </div>
              {data.installTargetText && (
                <div className="text-[12px] text-slate-600">{data.installTargetText}</div>
              )}
              {pacingPct && (
                <div className={cn('text-sm font-medium', pacingTone)}>{pacingPct} of target</div>
              )}
              {data.installPacingStatus && (
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    statusTone(data.installPacingStatus),
                  )}
                >
                  {data.installPacingStatus}
                </span>
              )}
            </div>
            {(data.quarterTargetText || data.cpiTargetText) && (
              <div className="text-[11px] text-slate-500 mt-1.5">
                {data.quarterTargetText && <span>Quarter target: {data.quarterTargetText}</span>}
                {data.quarterTargetText && data.cpiTargetText && <span> · </span>}
                {data.cpiTargetText && <span>{data.cpiTargetText}</span>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
