'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Sparkles } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildWeeklyDigest, type Severity } from '@/lib/market/weeklyDigest';
import { cn } from '@/lib/utils';

// One sweep across every module, so "what happened this week" doesn't require
// opening eight screens. The copy button is the point of the card as much as the
// list is — the output is meant to leave the dashboard and land in a message.

const MARK: Record<Severity, string> = { critical: '🔴', warning: '🟡', good: '🟢', info: '⚪' };

const TONE: Record<Severity, string> = {
  critical: 'border-rose-200 bg-rose-50/50',
  warning: 'border-amber-200 bg-amber-50/40',
  good: 'border-emerald-200 bg-emerald-50/40',
  info: 'border-slate-200 bg-white',
};

const DAY_OPTIONS = [7, 14, 30];

export function WeeklyDigestCard() {
  const { data, isLoading } = useSheetData();
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const digest = useMemo(() => buildWeeklyDigest(data, days), [data, days]);

  if (isLoading || !digest || digest.items.length === 0) return null;
  const c = digest.counts;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(digest.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the list is still on screen to read */
    }
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-[13px] font-bold tracking-tight text-slate-900">
            Có gì trong {days} ngày qua
          </span>
          <span className="truncate text-[10px] text-slate-500">
            {c.critical > 0 && <span className="font-semibold text-rose-600">{c.critical} nghiêm trọng · </span>}
            {c.warning} cần xem · {c.good} tín hiệu tốt
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
        </button>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-7 shrink-0 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} ngày
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
          title="Copy toàn bộ tóm tắt dạng text — dán thẳng vào Slack hoặc báo cáo"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Đã copy' : 'Copy'}
        </button>
      </div>

      {open && (
        <ul className="space-y-1.5 border-t border-slate-200 p-3">
          {digest.items.map((it, i) => (
            <li key={`${it.source}-${i}`} className={cn('rounded border p-2', TONE[it.severity])}>
              <div className="flex items-baseline gap-1.5">
                <span className="shrink-0 text-[11px] leading-none">{MARK[it.severity]}</span>
                <span className="text-[12px] font-semibold text-slate-900">{it.headline}</span>
                <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wide text-slate-400">{it.source}</span>
              </div>
              <div className="mt-0.5 pl-4 text-[11px] leading-snug text-slate-600">{it.detail}</div>
              {it.action && (
                <div className="mt-0.5 pl-4 text-[11px] leading-snug text-indigo-700">→ {it.action}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
