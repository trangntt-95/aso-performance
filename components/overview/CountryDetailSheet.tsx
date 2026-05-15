'use client';

import { useMemo } from 'react';
import { Leaf, DollarSign, Globe2, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { useCountryDetailStore } from '@/lib/store/countryDetailStore';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { AlertBadge } from '@/components/action-queue/AlertBadge';
import { formatNumber, formatPercent, formatDeltaPct, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { KeywordRow, SheetPayload } from '@/lib/sheets/types';

const COUNTRY_TAB: Record<string, keyof SheetPayload> = {
  L3: 'countryL3',
  L7: 'countryL7',
  L14: 'countryL14',
  L30: 'countryL30',
  L90: 'countryL90',
};

function deltaRel(latest: number, prior: number): number {
  if (!prior) return 0;
  return (latest - prior) / Math.abs(prior);
}

function Pill({ value }: { value: number }) {
  const t = deltaTone(value);
  const Arrow = t === 'pos' ? ArrowUp : t === 'neg' ? ArrowDown : ArrowRight;
  const cls = t === 'pos' ? 'text-emerald-700' : t === 'neg' ? 'text-rose-700' : 'text-slate-500';
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium', cls)}>
      <Arrow className="h-3 w-3" />
      {formatDeltaPct(value)}
    </span>
  );
}

function ChannelBlock({
  label,
  Icon,
  iconCls,
  rows,
}: {
  label: string;
  Icon: typeof Leaf;
  iconCls: string;
  rows: KeywordRow[];
}) {
  const usersL = rows.reduce((s, r) => s + r.usersL, 0);
  const usersP = rows.reduce((s, r) => s + r.usersP, 0);
  const getAppL = rows.reduce((s, r) => s + r.getAppL, 0);
  const getAppP = rows.reduce((s, r) => s + r.getAppP, 0);
  const cr = usersL > 0 ? getAppL / usersL : 0;
  const crP = usersP > 0 ? getAppP / usersP : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <div className={cn('h-6 w-6 rounded-md grid place-items-center', iconCls)}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-sm font-semibold">{label}</span>
        <span className="ml-auto text-[10px] text-slate-500">{rows.length} kw</span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Users</dt>
          <dd className="text-base font-semibold tabular-nums">{formatNumber(usersL, { compact: true })}</dd>
          <Pill value={deltaRel(usersL, usersP)} />
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">GetApp</dt>
          <dd className="text-base font-semibold tabular-nums">{formatNumber(getAppL, { compact: true })}</dd>
          <Pill value={deltaRel(getAppL, getAppP)} />
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">CR</dt>
          <dd className="text-base font-semibold tabular-nums">{formatPercent(cr)}</dd>
          <Pill value={deltaRel(cr, crP)} />
        </div>
      </dl>
    </div>
  );
}

export function CountryDetailSheet() {
  const { open, country, window: w, close } = useCountryDetailStore();
  const { data } = useSheetData();

  const detail = useMemo(() => {
    if (!data || !country) return null;
    const tabKey = COUNTRY_TAB[w] ?? 'countryL7';
    const allRows = (data[tabKey] as KeywordRow[]).filter((r) => r.country === country);
    const organic = allRows.filter((r) => r.surface !== 'search_ad');
    const paid = allRows.filter((r) => r.surface === 'search_ad');
    const totals = {
      users: allRows.reduce((s, r) => s + r.usersL, 0),
      getApp: allRows.reduce((s, r) => s + r.getAppL, 0),
    };
    const top = [...allRows]
      .sort((a, b) => b.usersL - a.usersL)
      .slice(0, 12);
    const actions = data.actionQueue.filter((r) => r.country === country);
    return { allRows, organic, paid, totals, top, actions };
  }, [data, country, w]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Globe2 className="h-4 w-4 text-blue-600" />
            {country}
          </SheetTitle>
          <SheetDescription>
            Last {Number(w.slice(1))} days · breakdown by channel and keyword contribution
          </SheetDescription>
        </SheetHeader>

        {!detail && (
          <div className="py-10 text-sm text-slate-500">Loading…</div>
        )}

        {detail && (
          <div className="mt-4 space-y-5">
            <section className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Total this window</div>
              <div className="flex items-baseline gap-3">
                <div>
                  <span className="text-xl font-semibold tabular-nums">
                    {formatNumber(detail.totals.users, { compact: true })}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-500">users</span>
                </div>
                <div>
                  <span className="text-xl font-semibold tabular-nums">
                    {formatNumber(detail.totals.getApp, { compact: true })}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-500">installs</span>
                </div>
                <div className="ml-auto text-[10px] text-slate-500">
                  {detail.allRows.length} keyword × surface
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ChannelBlock
                label="Organic"
                Icon={Leaf}
                iconCls="bg-emerald-100 text-emerald-700"
                rows={detail.organic}
              />
              <ChannelBlock
                label="Paid"
                Icon={DollarSign}
                iconCls="bg-amber-100 text-amber-700"
                rows={detail.paid}
              />
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wider text-slate-500">
                Top contributing keywords (by users)
              </h3>
              {detail.top.length === 0 ? (
                <div className="text-sm text-slate-500 py-6 text-center">No keywords in this window.</div>
              ) : (
                <div className="border rounded-lg divide-y">
                  {detail.top.map((r, i) => {
                    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
                    const surfaceCls = surface === 'paid' ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50';
                    return (
                      <div key={`${r.searchTerm}-${r.surface}-${i}`} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <CategoryChip category={r.category} compact />
                        <div className="flex-1 min-w-0">
                          <KeywordLink
                            keyword={r.searchTerm}
                            country={country ?? undefined}
                            className="font-medium text-sm truncate block w-full"
                          />
                          <div className="text-[10px] text-slate-500 flex gap-1.5 items-center mt-0.5">
                            <span className={cn('inline-flex items-center px-1.5 rounded', surfaceCls)}>
                              {surface}
                            </span>
                            <span className="font-mono">U {formatNumber(r.usersL, { compact: true })}</span>
                            <Pill value={r.deltaUsersPct ?? 0} />
                            <span className="font-mono text-slate-500">G {formatNumber(r.getAppL, { compact: true })}</span>
                          </div>
                        </div>
                        {r.alert && r.alert !== 'OK' && <AlertBadge alert={r.alert} compact />}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {detail.actions.length > 0 && (
              <>
                <Separator />
                <section className="space-y-2">
                  <h3 className="text-[11px] uppercase tracking-wider text-slate-500">
                    Open actions in {country}
                  </h3>
                  <div className="border rounded-lg divide-y">
                    {detail.actions.slice(0, 8).map((a, i) => (
                      <div key={`${a.keyword}-${i}`} className="px-3 py-2 text-sm flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">{a.priority}</span>
                        <KeywordLink
                          keyword={a.keyword}
                          country={country ?? undefined}
                          className="flex-1 truncate font-medium"
                        />
                        <AlertBadge alert={a.alert} compact />
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
