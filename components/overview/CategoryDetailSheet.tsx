'use client';

import { useEffect, useMemo, useState } from 'react';
import { Leaf, DollarSign, Layers, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { useCategoryDetailStore } from '@/lib/store/categoryDetailStore';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { AlertBadge } from '@/components/action-queue/AlertBadge';
import { categoryStyle } from '@/lib/utils/colors';
import { formatNumber, formatPercent, formatDeltaPct, deltaTone } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { Category, KeywordRow, SheetPayload } from '@/lib/sheets/types';

const ALL_TAB: Record<string, keyof SheetPayload> = {
  L3: 'allL3',
  L7: 'allL7',
  L14: 'allL14',
  L30: 'allL30',
  L90: 'allL90',
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
  selected,
  onClick,
}: {
  label: string;
  Icon: typeof Leaf;
  iconCls: string;
  rows: KeywordRow[];
  selected: boolean;
  onClick: () => void;
}) {
  const usersL = rows.reduce((s, r) => s + r.usersL, 0);
  const usersP = rows.reduce((s, r) => s + r.usersP, 0);
  const getAppL = rows.reduce((s, r) => s + r.getAppL, 0);
  const getAppP = rows.reduce((s, r) => s + r.getAppP, 0);
  const cr = usersL > 0 ? getAppL / usersL : 0;
  const crP = usersP > 0 ? getAppP / usersP : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-white p-3.5 text-left w-full transition',
        selected ? 'border-slate-900 ring-2 ring-slate-900/10 shadow-sm' : 'border-slate-200 hover:border-slate-300',
      )}
    >
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
      <div className="mt-2 text-[10px] text-slate-400">
        {selected ? 'Đang lọc keyword theo channel này · click lại để bỏ' : 'Click để lọc keyword chỉ channel này'}
      </div>
    </button>
  );
}

export function CategoryDetailSheet() {
  const { open, category, window: w, close } = useCategoryDetailStore();
  const { data } = useSheetData();
  const [channelFilter, setChannelFilter] = useState<'all' | 'organic' | 'paid'>('all');

  useEffect(() => {
    setChannelFilter('all');
  }, [category, w, open]);

  const detail = useMemo(() => {
    if (!data || !category) return null;
    const tabKey = ALL_TAB[w] ?? 'allL7';
    const allRows = (data[tabKey] as KeywordRow[]).filter((r) => r.category === category);
    const organic = allRows.filter((r) => r.surface !== 'search_ad');
    const paid = allRows.filter((r) => r.surface === 'search_ad');
    const totalUsers = (data[tabKey] as KeywordRow[]).reduce((s, r) => s + r.usersL, 0);
    const totalGetApp = (data[tabKey] as KeywordRow[]).reduce((s, r) => s + r.getAppL, 0);
    const myUsers = allRows.reduce((s, r) => s + r.usersL, 0);
    const myGetApp = allRows.reduce((s, r) => s + r.getAppL, 0);
    const actions = data.actionQueue.filter((r) => r.category === category);
    return {
      allRows,
      organic,
      paid,
      myUsers,
      myGetApp,
      shareUsers: totalUsers > 0 ? myUsers / totalUsers : 0,
      shareGetApp: totalGetApp > 0 ? myGetApp / totalGetApp : 0,
      actions,
    };
  }, [data, category, w]);

  const filteredKeywords = useMemo(() => {
    if (!detail) return [];
    let rows = detail.allRows;
    if (channelFilter === 'organic') rows = detail.organic;
    if (channelFilter === 'paid') rows = detail.paid;
    return [...rows].sort((a, b) => b.usersL - a.usersL).slice(0, 25);
  }, [detail, channelFilter]);

  const styleObj = category ? categoryStyle(category as Category) : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-indigo-600" />
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-sm',
                styleObj?.bg,
                styleObj?.text,
              )}
            >
              <span>{styleObj?.emoji}</span>
              {category}
            </span>
          </SheetTitle>
          <SheetDescription>
            Last {Number(w.slice(1))} days · breakdown by channel and contributing keywords
          </SheetDescription>
        </SheetHeader>

        {!detail && <div className="py-10 text-sm text-slate-500">Loading…</div>}

        {detail && (
          <div className="mt-4 space-y-5">
            <section className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Total this category · this window
              </div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <div>
                  <span className="text-xl font-semibold tabular-nums">
                    {formatNumber(detail.myUsers, { compact: true })}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-500">users</span>
                  <span className="ml-2 text-[11px] text-slate-400">
                    {formatPercent(detail.shareUsers)} share
                  </span>
                </div>
                <div>
                  <span className="text-xl font-semibold tabular-nums">
                    {formatNumber(detail.myGetApp, { compact: true })}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-500">installs</span>
                  <span className="ml-2 text-[11px] text-slate-400">
                    {formatPercent(detail.shareGetApp)} share
                  </span>
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
                selected={channelFilter === 'organic'}
                onClick={() =>
                  setChannelFilter((c) => (c === 'organic' ? 'all' : 'organic'))
                }
              />
              <ChannelBlock
                label="Paid"
                Icon={DollarSign}
                iconCls="bg-amber-100 text-amber-700"
                rows={detail.paid}
                selected={channelFilter === 'paid'}
                onClick={() =>
                  setChannelFilter((c) => (c === 'paid' ? 'all' : 'paid'))
                }
              />
            </section>

            <Separator />

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[11px] uppercase tracking-wider text-slate-500">
                  Top contributing keywords (by users)
                </h3>
                <div className="flex items-center gap-1">
                  {(['all', 'organic', 'paid'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setChannelFilter(c)}
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] border transition',
                        channelFilter === c
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',
                      )}
                    >
                      {c === 'all' ? 'Tất cả' : c === 'organic' ? 'Organic' : 'Paid'}
                    </button>
                  ))}
                </div>
              </div>
              {filteredKeywords.length === 0 ? (
                <div className="text-sm text-slate-500 py-6 text-center">
                  Không có keyword {channelFilter !== 'all' ? channelFilter : ''} trong window này.
                </div>
              ) : (
                <div className="border rounded-lg divide-y">
                  {filteredKeywords.map((r, i) => {
                    const surface = r.surface === 'search_ad' ? 'paid' : 'organic';
                    const surfaceCls =
                      surface === 'paid'
                        ? 'text-amber-700 bg-amber-50'
                        : 'text-emerald-700 bg-emerald-50';
                    return (
                      <div
                        key={`${r.searchTerm}-${r.surface}-${i}`}
                        className="px-3 py-2 flex items-center gap-2 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <KeywordLink
                            keyword={r.searchTerm}
                            className="font-medium text-sm truncate block w-full"
                          />
                          <div className="text-[10px] text-slate-500 flex gap-1.5 items-center mt-0.5 flex-wrap">
                            <span className={cn('inline-flex items-center px-1.5 rounded', surfaceCls)}>
                              {surface}
                            </span>
                            <span className="font-mono">U {formatNumber(r.usersL, { compact: true })}</span>
                            <Pill value={r.deltaUsersPct ?? 0} />
                            <span className="font-mono text-slate-500">
                              G {formatNumber(r.getAppL, { compact: true })}
                            </span>
                            <span className="font-mono text-slate-500">
                              CR {formatPercent(r.crL)}
                            </span>
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
                    Open actions in {category}
                  </h3>
                  <div className="border rounded-lg divide-y">
                    {detail.actions.slice(0, 8).map((a, i) => (
                      <div key={`${a.keyword}-${i}`} className="px-3 py-2 text-sm flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">{a.priority}</span>
                        <KeywordLink
                          keyword={a.keyword}
                          country={a.country !== '(global)' ? a.country : undefined}
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
