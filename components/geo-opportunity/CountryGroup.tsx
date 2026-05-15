'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Globe2 } from 'lucide-react';
import type { ActionQueueRow } from '@/lib/sheets/types';
import { AlertBadge } from '@/components/action-queue/AlertBadge';
import { BidActionBadge } from '@/components/action-queue/BidActionBadge';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { ExportCsvButton } from './ExportCsvButton';
import { cn } from '@/lib/utils';

interface Props {
  country: string;
  rows: ActionQueueRow[];
  defaultOpen?: boolean;
}

export function CountryGroup({ country, rows, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const missingCount = rows.filter((r) => r.alert.includes('PAID MISSING')).length;
  const weakCount = rows.filter((r) => r.alert.includes('PAID WEAK')).length;

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <Globe2 className="h-4 w-4 text-blue-600" />
        <span className="font-semibold text-sm">{country}</span>
        <span className="text-xs text-slate-500">{rows.length} opp{rows.length === 1 ? '' : 's'}</span>
        {missingCount > 0 && (
          <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-700 text-white font-semibold">
            {missingCount} MISSING
          </span>
        )}
        {weakCount > 0 && (
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-500 text-white font-semibold',
              missingCount === 0 && 'ml-auto',
            )}
          >
            {weakCount} WEAK
          </span>
        )}
      </button>
      {open && (
        <div>
          <div className="px-3 py-1.5 border-t flex justify-end bg-slate-50">
            <ExportCsvButton rows={rows} country={country} />
          </div>
          <div className="divide-y">
            {rows.map((row, i) => (
              <div key={`${row.keyword}-${i}`} className="px-3 py-2.5 flex flex-wrap gap-2 items-center text-sm">
                <CategoryChip category={row.category} compact />
                <div className="flex-1 min-w-0">
                  <KeywordLink
                    keyword={row.keyword}
                    country={country !== '(global)' ? country : undefined}
                    className="font-medium truncate block w-full"
                  />
                  <div className="text-[11px] text-slate-500 flex gap-2 flex-wrap items-center mt-0.5">
                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                      {row.window}
                    </span>
                    {row.targetCamp && (
                      <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{row.targetCamp}</code>
                    )}
                    {row.bidSuggest && row.bidSuggest !== '—' && (
                      <span className="font-mono text-slate-700">Bid: {row.bidSuggest}</span>
                    )}
                  </div>
                  {row.keyStats && (
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">{row.keyStats}</div>
                  )}
                </div>
                <AlertBadge alert={row.alert} />
                <BidActionBadge action={row.bidAction} suggest={row.bidSuggest} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
