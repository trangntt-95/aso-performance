'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Search, X, ExternalLink, Flame } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { NoteCell } from '@/components/shared/NoteCell';
import { useNotesStore } from '@/lib/store/notesStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle, CATEGORY_ORDER } from '@/lib/utils/colors';
import { formatNumber } from '@/lib/utils/format';
import { findOverbidCamps, type OverbidRow } from '@/lib/market/overbid';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/sheets/types';

const selectCls =
  'h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';

const money = (n: number | null): string =>
  n === null || !Number.isFinite(n) ? '—' : `$${n.toFixed(2)}`;

type SortKey = 'camp' | 'category' | 'cpc' | 'cpi' | 'targetBid' | 'spend' | 'clicks' | 'installs' | 'score';
type SortDir = 'asc' | 'desc';

const SORT_COLS: Record<SortKey, { kind: 'num' | 'text'; get: (r: OverbidRow) => number | string | null }> = {
  camp: { kind: 'text', get: (r) => r.camp },
  category: { kind: 'text', get: (r) => r.category },
  cpc: { kind: 'num', get: (r) => r.cpc },
  cpi: { kind: 'num', get: (r) => r.cpi },
  targetBid: { kind: 'num', get: (r) => r.targetBid },
  spend: { kind: 'num', get: (r) => r.spend },
  clicks: { kind: 'num', get: (r) => r.clicks },
  installs: { kind: 'num', get: (r) => r.installs },
  score: { kind: 'num', get: (r) => r.score },
};

function SortHead({
  label, col, sortKey, sortDir, onSort, align = 'left', extra, title,
}: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; align?: 'left' | 'right'; extra?: string; title?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      title={title}
      className={cn(
        'px-2 py-2 font-medium cursor-pointer select-none hover:text-slate-900',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-indigo-700',
        extra,
      )}
    >
      <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'flex-row-reverse')}>
        {label}
        <span className="text-[9px] w-2 text-indigo-600">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
      </span>
    </th>
  );
}

export function OverbidView() {
  const { data, isLoading, error } = useSheetData();

  // Load saved notes from the App_Notes sheet tab once on mount.
  const loadNotes = useNotesStore((s) => s.load);
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Detection thresholds (tunable).
  const [minClicks, setMinClicks] = useState('5');
  const [cpcTol, setCpcTol] = useState('0');
  const [cpiTol, setCpiTol] = useState('0');
  // Post-filters.
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [matchFilter, setMatchFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(SORT_COLS[key].kind === 'num' ? 'desc' : 'asc');
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    return findOverbidCamps(data.shopifyCamps ?? [], data.bidCap ?? [], data.campLinks ?? [], {
      minClicks: Number(minClicks) || 0,
      cpcTolerancePct: Number(cpcTol) || 0,
      cpiTolerancePct: Number(cpiTol) || 0,
    });
  }, [data, minClicks, cpcTol, cpiTol]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.category));
    const order = CATEGORY_ORDER as readonly string[];
    return [...order.filter((c) => set.has(c)), ...Array.from(set).filter((c) => !order.includes(c)).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (matchFilter !== 'all' && r.matchLevel !== matchFilter) return false;
      if (q && !r.camp.toLowerCase().includes(q)) return false;
      return true;
    });
    const { kind, get } = SORT_COLS[sortKey];
    const dir = sortDir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const va = get(a), vb = get(b);
      const aEmpty = va === null || va === '';
      const bEmpty = vb === null || vb === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const base = kind === 'num' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb));
      return base * dir || b.score - a.score;
    });
    return out;
  }, [rows, search, categoryFilter, matchFilter, sortKey, sortDir]);

  const totalSpend = useMemo(() => filtered.reduce((s, r) => s + r.spend, 0), [filtered]);
  const dirty = search !== '' || categoryFilter !== 'all' || matchFilter !== 'all';

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <div className="font-semibold">Couldn’t load data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
        <Flame className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
        <div>
          <b>Camp bị overbid</b> — camp trong <code className="text-[10px]">Shopify_daily</code> có{' '}
          <b>CPC thực tế (Spend/Clicks)</b> vượt <b>bid cho phép</b> hoặc <b>CPI</b> vượt CPI cho phép (tab{' '}
          <code className="text-[10px]">Max bid cap</code>). → nên <b>hạ bid</b>. Nước target lấy từ cột{' '}
          <b>Geo</b> trong <code className="text-[10px]">Camp_Links</code> (🎯, so với trung bình các nước đó); camp
          không điền Geo coi là <b>general</b> → so với <b>trung bình cả category</b> (🌐).
          {data?.shopifyDateRange && (
            <span className="mt-1 block font-medium text-rose-800">
              📅 Dữ liệu áp dụng: {data.shopifyDateRange}
            </span>
          )}
        </div>
      </div>

      {/* Thresholds + filters */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm camp…" className="pl-7 h-7 text-xs" />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls} title="Category">
            <option value="all">Category: All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)} className={selectCls} title="Độ khớp">
            <option value="all">Match: All</option>
            <option value="country">🎯 Có Geo (theo nước)</option>
            <option value="category">🌐 General (avg category)</option>
          </select>
          <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Ngưỡng</span>
            <span className="text-[10px] text-slate-700 font-medium ml-1">Clicks≥</span>
            <Input type="number" min="0" value={minClicks} onChange={(e) => setMinClicks(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-700 font-medium ml-1">CPC vượt&gt;</span>
            <Input type="number" min="0" value={cpcTol} onChange={(e) => setCpcTol(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-400">%</span>
            <span className="text-[10px] text-slate-700 font-medium ml-1">CPI vượt&gt;</span>
            <Input type="number" min="0" value={cpiTol} onChange={(e) => setCpiTol(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-400">%</span>
          </div>
          {dirty && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setSearch(''); setCategoryFilter('all'); setMatchFilter('all'); }}>
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>
      )}

      {!isLoading && (
        <div className="text-xs text-slate-500">
          {filtered.length}
          {filtered.length !== rows.length ? ` / ${rows.length}` : ''} camp overbid · tổng spend{' '}
          <span className="font-semibold text-rose-700">${formatNumber(totalSpend, { compact: true })}</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg bg-white py-16 text-center text-sm text-slate-500">
          {rows.length === 0
            ? 'Không tìm thấy camp overbid (kiểm tra tab Shopify_daily đã có data + Max bid cap có Bid Rec).'
            : 'Không có camp nào khớp filter.'}
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-auto max-h-[75vh]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10 shadow-sm [&_th]:bg-slate-50">
              <tr>
                <SortHead label="Camp" col="camp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} extra="px-3 min-w-[15rem]" />
                <SortHead label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="CPC / cho phép" col="cpc" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="CPC thực tế / bid cho phép (avg Bid Rec)" />
                <SortHead label="CPI / cho phép" col="cpi" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="CPI thực tế / CPI cho phép (avg)" />
                <SortHead label="Clicks" col="clicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Inst" col="installs" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Spend" col="spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-2 py-2 text-left font-medium min-w-[10rem]">Vấn đề</th>
                <th className="px-2 py-2 text-left font-medium min-w-[9rem]" title="Ghi chú của bạn (tự lưu)">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = categoryStyle(r.category as Category);
                return (
                  <tr key={r.camp} className="border-t hover:bg-slate-50 align-top">
                    <td className="px-3 py-2">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-medium text-[12px] text-indigo-600 hover:underline">
                          {r.camp}
                          <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                        </a>
                      ) : (
                        <span className="font-medium text-[12px] text-slate-800">{r.camp}</span>
                      )}
                      <div className="text-[10px] text-slate-400">
                        {r.matchLevel === 'country' ? (
                          <span title="Nước target lấy từ Geo trong Camp_Links — so với trung bình các nước đó">🎯 {r.countryLabel}</span>
                        ) : (
                          <span title="Camp không điền Geo → general, so với trung bình cả category" className="text-amber-600">🌐 {r.countryLabel}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap', cs.bg, cs.text)}>
                        <span>{cs.emoji}</span>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className={r.cpcOverPct !== null ? 'text-rose-600 font-semibold' : 'text-slate-700'}>{money(r.cpc)}</span>
                      <span className="text-slate-400"> / {money(r.targetBid)}</span>
                      {r.cpcOverPct !== null && <span className="block text-[9px] text-rose-500">+{Math.round(r.cpcOverPct * 100)}%</span>}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className={r.cpiOverPct !== null ? 'text-rose-600 font-semibold' : 'text-slate-700'}>{money(r.cpi)}</span>
                      <span className="text-slate-400"> / {money(r.targetCpi)}</span>
                      {r.cpiOverPct !== null && <span className="block text-[9px] text-rose-500">+{Math.round(r.cpiOverPct * 100)}%</span>}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-600">{formatNumber(r.clicks, { compact: true })}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-600">{formatNumber(r.installs, { compact: true })}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] font-semibold text-slate-800">${formatNumber(r.spend, { compact: true })}</td>
                    <td className="px-2 py-2">
                      <ul className="space-y-0.5">
                        {r.reasons.map((reason, i) => (
                          <li key={i} className="text-[10px] text-rose-700 leading-tight">• {reason}</li>
                        ))}
                      </ul>
                    </td>
                    <NoteCell scope="overbid" noteId={r.camp} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            CPC = Spend/Clicks (proxy cho bid đang trả) · CPI = Spend/Installs · bid/CPI cho phép = trung bình từ Max bid cap ·
            🎯 = nước target từ Geo (Camp_Links), <span className="text-amber-600">🌐</span> = general (avg cả category) ·
            <b> click cột để sort</b> · mặc định sắp theo spend lãng phí (overage × spend)
          </div>
        </div>
      )}
    </div>
  );
}
