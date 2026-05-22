'use client';

import { useMemo, useState } from 'react';
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
import type { ActionQueueRow, HistoryRow, KeywordRow, SheetPayload } from '@/lib/sheets/types';
import { formatDeltaPct, formatNumber, formatPercent, formatPos, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { Leaf, DollarSign } from 'lucide-react';

function summarise(rows: KeywordRow[]) {
  if (rows.length === 0) return null;
  const totalUsers = rows.reduce((s, r) => s + r.usersL, 0);
  const totalGetApp = rows.reduce((s, r) => s + r.getAppL, 0);
  const cr = totalUsers > 0 ? totalGetApp / totalUsers : 0;
  const posValues = rows.map((r) => r.posL).filter((v): v is number => v !== null);
  const avgPos = posValues.length > 0 ? posValues.reduce((s, v) => s + v, 0) / posValues.length : null;
  return { totalUsers, totalGetApp, cr, avgPos, count: rows.length };
}

type DrillWindow = 'L7' | 'L30' | 'L90';

const COUNTRY_TAB: Record<DrillWindow, keyof SheetPayload> = {
  L7: 'countryL7',
  L30: 'countryL30',
  L90: 'countryL90',
};

interface CountryRow {
  country: string;
  organicUsers: number;
  organicGetApp: number;
  organicCr: number;
  organicPos: number | null;
  organicDeltaUsersPct: number | null;
  paidUsers: number;
  paidGetApp: number;
  paidCr: number;
  paidPos: number | null;
  paidDeltaUsersPct: number | null;
  totalUsers: number;
  totalGetApp: number;
}

function aggregateByCountry(
  data: SheetPayload | undefined,
  keyword: string | null,
  window: DrillWindow,
  surfaceFilter: 'all' | 'organic' | 'paid',
): CountryRow[] {
  if (!data || !keyword) return [];
  const rows = (data[COUNTRY_TAB[window]] as KeywordRow[]).filter(
    (r) => r.searchTerm === keyword && r.country,
  );
  const map = new Map<string, CountryRow>();
  for (const r of rows) {
    const country = r.country ?? '(global)';
    let bucket = map.get(country);
    if (!bucket) {
      bucket = {
        country,
        organicUsers: 0, organicGetApp: 0, organicCr: 0, organicPos: null, organicDeltaUsersPct: null,
        paidUsers: 0, paidGetApp: 0, paidCr: 0, paidPos: null, paidDeltaUsersPct: null,
        totalUsers: 0, totalGetApp: 0,
      };
      map.set(country, bucket);
    }
    if (r.surface === 'search_ad') {
      bucket.paidUsers += r.usersL;
      bucket.paidGetApp += r.getAppL;
      bucket.paidCr = bucket.paidUsers > 0 ? bucket.paidGetApp / bucket.paidUsers : 0;
      bucket.paidPos = r.posL;
      bucket.paidDeltaUsersPct = r.deltaUsersPct;
    } else {
      bucket.organicUsers += r.usersL;
      bucket.organicGetApp += r.getAppL;
      bucket.organicCr = bucket.organicUsers > 0 ? bucket.organicGetApp / bucket.organicUsers : 0;
      bucket.organicPos = r.posL;
      bucket.organicDeltaUsersPct = r.deltaUsersPct;
    }
    bucket.totalUsers += r.usersL;
    bucket.totalGetApp += r.getAppL;
  }
  let result = Array.from(map.values());
  if (surfaceFilter === 'organic') {
    result = result.filter((c) => c.organicUsers > 0);
  } else if (surfaceFilter === 'paid') {
    result = result.filter((c) => c.paidUsers > 0);
  }
  result.sort((a, b) => {
    const aSort = surfaceFilter === 'paid' ? a.paidUsers : surfaceFilter === 'organic' ? a.organicUsers : a.totalUsers;
    const bSort = surfaceFilter === 'paid' ? b.paidUsers : surfaceFilter === 'organic' ? b.organicUsers : b.totalUsers;
    return bSort - aSort;
  });
  return result;
}

function ChannelRow({
  type,
  users,
  getApp,
  cr,
  pos,
  deltaUsersPct,
}: {
  type: 'organic' | 'paid';
  users: number;
  getApp: number;
  cr: number;
  pos: number | null;
  deltaUsersPct: number | null;
}) {
  const isEmpty = users === 0 && getApp === 0;
  const isOrganic = type === 'organic';
  const Icon = isOrganic ? Leaf : DollarSign;
  const labelCls = isOrganic ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50';
  const t = deltaUsersPct !== null ? deltaTone(deltaUsersPct) : 'flat';
  const deltaCls =
    t === 'pos' ? 'text-emerald-700' : t === 'neg' ? 'text-rose-700' : 'text-slate-500';

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0',
          labelCls,
        )}
      >
        <Icon className="h-3 w-3" />
        {isOrganic ? 'Organic' : 'Paid'}
      </span>
      {isEmpty ? (
        <span className="text-slate-300">— không có</span>
      ) : (
        <div className="flex items-center gap-x-2.5 gap-y-0.5 flex-wrap text-slate-700 tabular-nums">
          <span>
            <span className="text-slate-500">Users</span>{' '}
            <b className="font-mono">{formatNumber(users, { compact: true })}</b>
            {deltaUsersPct !== null && (
              <span className={cn('ml-1 font-medium text-[11px]', deltaCls)}>
                {formatDeltaPct(deltaUsersPct)}
              </span>
            )}
          </span>
          <span>
            <span className="text-slate-500">Install</span>{' '}
            <b className="font-mono">{formatNumber(getApp, { compact: true })}</b>
          </span>
          <span>
            <span className="text-slate-500">CR</span>{' '}
            <b className="font-mono">{formatPercent(cr)}</b>
          </span>
          <span>
            <span className="text-slate-500">Rank</span>{' '}
            <b className="font-mono">{formatPos(pos)}</b>
          </span>
        </div>
      )}
    </div>
  );
}

export function KeywordTrendSheet() {
  const { open, keyword, country, surface, close } = useKeywordTrendStore();
  const { data } = useSheetData();
  const notes = useStatusStore((s) => s.notes);
  const setNote = useStatusStore((s) => s.setNote);
  const [drillWindow, setDrillWindow] = useState<DrillWindow>('L7');

  const countryBreakdown = useMemo(
    () => aggregateByCountry(data, keyword, drillWindow, surface),
    [data, keyword, drillWindow, surface],
  );

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
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                  By country · {drillWindow}
                </h3>
                <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[10px]">
                  {(['L7', 'L30', 'L90'] as const).map((w, i) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setDrillWindow(w)}
                      className={cn(
                        'px-2 py-0.5 font-medium transition',
                        i > 0 && 'border-l border-slate-200',
                        drillWindow === w ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              {countryBreakdown.length === 0 ? (
                <div className="text-[12px] text-slate-500 italic py-4 text-center border rounded">
                  Keyword này chưa có dữ liệu theo country ở {drillWindow}.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                  {countryBreakdown.slice(0, 20).map((c) => (
                    <div
                      key={c.country}
                      className="border rounded-lg bg-white px-3 py-2 hover:border-slate-300 transition"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="font-semibold text-[13px] truncate">{c.country}</span>
                        <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                          Total <b className="font-mono text-slate-900">{formatNumber(c.totalUsers, { compact: true })}</b> users ·{' '}
                          <b className="font-mono text-slate-900">{formatNumber(c.totalGetApp, { compact: true })}</b> installs
                        </span>
                      </div>
                      <div className="space-y-1 pl-1">
                        <ChannelRow
                          type="organic"
                          users={c.organicUsers}
                          getApp={c.organicGetApp}
                          cr={c.organicCr}
                          pos={c.organicPos}
                          deltaUsersPct={c.organicDeltaUsersPct}
                        />
                        <ChannelRow
                          type="paid"
                          users={c.paidUsers}
                          getApp={c.paidGetApp}
                          cr={c.paidCr}
                          pos={c.paidPos}
                          deltaUsersPct={c.paidDeltaUsersPct}
                        />
                      </div>
                    </div>
                  ))}
                  {countryBreakdown.length > 20 && (
                    <div className="text-[10px] text-slate-400 text-center py-2 italic">
                      +{countryBreakdown.length - 20} country khác…
                    </div>
                  )}
                </div>
              )}
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
