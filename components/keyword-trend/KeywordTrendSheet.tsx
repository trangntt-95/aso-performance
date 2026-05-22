'use client';

import { useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { TrendChart } from './TrendChart';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { useKeywordTrendStore } from '@/lib/store/keywordTrendStore';
import { useStatusStore } from '@/lib/store/statusStore';
import { AlertBadge } from '@/components/action-queue/AlertBadge';
import type { ActionQueueRow, HistoryRow, KeywordRow } from '@/lib/sheets/types';
import { formatNumber, formatPercent, formatPos } from '@/lib/utils/format';

function summarise(rows: KeywordRow[]) {
  if (rows.length === 0) return null;
  const totalUsers = rows.reduce((s, r) => s + r.usersL, 0);
  const totalGetApp = rows.reduce((s, r) => s + r.getAppL, 0);
  const cr = totalUsers > 0 ? totalGetApp / totalUsers : 0;
  const posValues = rows.map((r) => r.posL).filter((v): v is number => v !== null);
  const avgPos = posValues.length > 0 ? posValues.reduce((s, v) => s + v, 0) / posValues.length : null;
  return { totalUsers, totalGetApp, cr, avgPos, count: rows.length };
}

export function KeywordTrendSheet() {
  const { open, keyword, country, surface, close } = useKeywordTrendStore();
  const { data } = useSheetData();
  const notes = useStatusStore((s) => s.notes);
  const setNote = useStatusStore((s) => s.setNote);

  const trendData = useMemo(() => {
    if (!keyword || !data) return null;
    const surfaceTarget =
      surface === 'paid' ? 'search_ad' : surface === 'organic' ? 'search' : null;
    const matchKw = (r: { searchTerm: string }) => r.searchTerm === keyword;
    const matchSurface = (r: { surface: string }) =>
      surfaceTarget ? r.surface === surfaceTarget : true;
    const matchCountry = (r: { country?: string }) => (country ? r.country === country : true);

    const history: HistoryRow[] = data.history.filter((h) => matchKw(h) && matchSurface(h));

    // When country filter is active, prefer Country_L_* (those have the country column).
    const pickL = (allTab: KeywordRow[], countryTab: KeywordRow[]) =>
      country
        ? countryTab.filter((r) => matchKw(r) && matchSurface(r) && matchCountry(r))
        : allTab.filter((r) => matchKw(r) && matchSurface(r));

    const inL7 = pickL(data.allL7, data.countryL7);
    const inL30 = pickL(data.allL30, data.countryL30);
    const inL90 = pickL(data.allL90, data.countryL90);

    const actionRows: ActionQueueRow[] = data.actionQueue.filter((r) => {
      if (r.keyword !== keyword) return false;
      if (country && r.country !== country) return false;
      if (surface !== 'all' && r.surface !== surface) return false;
      return true;
    });

    return {
      history,
      l7: summarise(inL7),
      l30: summarise(inL30),
      l90: summarise(inL90),
      meta: inL7[0] ?? inL30[0] ?? inL90[0] ?? null,
      actionRows,
    };
  }, [keyword, country, surface, data]);

  const noteKey = keyword ? `keyword::${keyword}` : '';
  const currentNote = noteKey ? notes[noteKey] ?? '' : '';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono break-all text-base">{keyword}</SheetTitle>
          <SheetDescription>
            {[
              country ? `Country: ${country}` : 'All countries',
              surface === 'all' ? 'all surfaces' : surface,
            ].join(' · ')}
          </SheetDescription>
        </SheetHeader>

        {!trendData && (
          <div className="py-10 text-sm text-slate-500">Loading…</div>
        )}

        {trendData && (
          <div className="mt-4 space-y-5">
            {trendData.meta && (
              <div className="flex flex-wrap gap-3 text-[12px] text-slate-600">
                {trendData.meta.category && (
                  <span><span className="font-semibold">Category:</span> {trendData.meta.category}</span>
                )}
                {trendData.meta.english && trendData.meta.english !== keyword && (
                  <span><span className="font-semibold">EN:</span> {trendData.meta.english}</span>
                )}
                {trendData.meta.lang && (
                  <span><span className="font-semibold">Lang:</span> {trendData.meta.lang}</span>
                )}
              </div>
            )}

            {trendData.actionRows.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                  Open actions
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {trendData.actionRows.map((r, i) => (
                    <div
                      key={`${r.keyword}-${i}`}
                      className="flex items-center gap-1.5 text-[11px] bg-slate-50 border rounded px-2 py-1"
                    >
                      <span className="font-mono text-slate-500">{r.priority}</span>
                      <span>{r.country}</span>
                      <span className="text-slate-300">·</span>
                      <span>{r.window}</span>
                      <span className="text-slate-300">·</span>
                      <AlertBadge alert={r.alert} compact />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                90-day Users trend (L7D sliding)
              </h3>
              <TrendChart history={trendData.history} metric="users" />
              <div className="flex gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-0.5 bg-emerald-600" />
                  Organic
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-0.5 bg-amber-700" />
                  Paid
                </span>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                Position trend (lower = better)
              </h3>
              <TrendChart history={trendData.history} metric="pos" />
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                Snapshot · current windows{country ? ` (${country})` : ''}
                {surface !== 'all' ? ` · ${surface}` : ''}
              </h3>
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                {[
                  { label: 'L7', s: trendData.l7 },
                  { label: 'L30', s: trendData.l30 },
                  { label: 'L90', s: trendData.l90 },
                ].map(({ label, s }) => (
                  <div key={label} className="border rounded p-2 space-y-0.5">
                    <div className="font-mono text-[10px] text-slate-500">{label}</div>
                    {s ? (
                      <>
                        <div>Users: <b>{formatNumber(s.totalUsers, { compact: true })}</b></div>
                        <div>GetApp: <b>{formatNumber(s.totalGetApp, { compact: true })}</b></div>
                        <div>CR: <b>{formatPercent(s.cr)}</b></div>
                        <div>Pos: <b>{formatPos(s.avgPos)}</b></div>
                      </>
                    ) : (
                      <div className="text-slate-400">No data</div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500">Personal note</h3>
              <textarea
                value={currentNote}
                onChange={(e) => setNote(noteKey, e.target.value)}
                placeholder="e.g. tested broad match Q2, paused due to low CR"
                rows={3}
                className="w-full border rounded p-2 text-sm resize-y"
              />
              <p className="text-[10px] text-slate-400">Saved locally in your browser only.</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
