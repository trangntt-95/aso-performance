'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Search, X, ExternalLink, AlertTriangle } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryStyle, CATEGORY_ORDER } from '@/lib/utils/colors';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { formatNumber, formatPercent, formatPos } from '@/lib/utils/format';
import { findUnderbidKeywords } from '@/lib/market/underbid';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/sheets/types';

const selectCls =
  'h-7 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';

type SortKey =
  | 'keyword'
  | 'category'
  | 'organicUsers'
  | 'organicPos'
  | 'paidUsers'
  | 'paidPos'
  | 'paidShare'
  | 'score';
type SortDir = 'asc' | 'desc';

// Per-column value + type. 'num' defaults to desc on first click, 'text' to asc.
const SORT_COLS: Record<
  SortKey,
  { kind: 'num' | 'text'; get: (r: import('@/lib/market/underbid').UnderbidRow) => number | string | null }
> = {
  keyword: { kind: 'text', get: (r) => r.term },
  category: { kind: 'text', get: (r) => r.category },
  organicUsers: { kind: 'num', get: (r) => r.organicUsers },
  organicPos: { kind: 'num', get: (r) => r.organicPos },
  paidUsers: { kind: 'num', get: (r) => r.paidUsers },
  paidPos: { kind: 'num', get: (r) => r.paidPos },
  paidShare: { kind: 'num', get: (r) => r.paidShare },
  score: { kind: 'num', get: (r) => r.score },
};

function SortHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
  extra,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  extra?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
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

export function UnderbidView() {
  const { data, isLoading, error } = useSheetData();

  // Detection thresholds (tunable).
  const [minOrganic, setMinOrganic] = useState('5');
  const [maxShare, setMaxShare] = useState('30');
  const [posTh, setPosTh] = useState('2.7');
  // Post-filters.
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(SORT_COLS[key].kind === 'num' ? 'desc' : 'asc');
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    return findUnderbidKeywords(
      data.allL365 ?? [],
      data.masterKwLookup ?? [],
      data.kwAddedManual ?? [],
      data.negativeKw ?? [],
      data.pausedKw ?? [],
      data.campLinks ?? [],
      {
        minOrganicUsers: Number(minOrganic) || 0,
        maxPaidSharePct: Number(maxShare) || 0,
        posThreshold: Number(posTh) || 0,
      },
    );
  }, [data, minOrganic, maxShare, posTh]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.category));
    const order = CATEGORY_ORDER as readonly string[];
    return [
      ...order.filter((c) => set.has(c)),
      ...Array.from(set).filter((c) => !order.includes(c)).sort(),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (q && !r.term.toLowerCase().includes(q)) return false;
      return true;
    });
    const { kind, get } = SORT_COLS[sortKey];
    const dir = sortDir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      // Nulls/blanks always sink to the bottom regardless of direction.
      const aEmpty = va === null || va === '';
      const bEmpty = vb === null || vb === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const base =
        kind === 'num' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb));
      return base * dir || b.score - a.score;
    });
    return out;
  }, [rows, search, categoryFilter, sortKey, sortDir]);

  const dirty = search !== '' || categoryFilter !== 'all';

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
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div>
          <b>Keyword bị underbid</b> — có nhu cầu organic thật trong L365, <b>đã được bid</b> trong 1 camp, nhưng{' '}
          paid xuất hiện rất ít so với organic <b>(paid share &lt; {maxShare}%)</b> và/hoặc vị trí paid yếu{' '}
          <b>(&gt; {posTh}</b> hoặc chưa lên paid). → nên cân nhắc <b>tăng bid</b> để hứng thêm install. Cột{' '}
          <b>Camp</b> cho biết nó đang nằm ở camp nào (kèm link).
        </div>
      </div>

      {/* Thresholds + filters */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm keyword…"
              className="pl-7 h-7 text-xs"
            />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls} title="Category">
            <option value="all">Category: All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Ngưỡng</span>
            <span className="text-[10px] text-slate-700 font-medium ml-1">Organic≥</span>
            <Input type="number" min="0" value={minOrganic} onChange={(e) => setMinOrganic(e.target.value)} className="h-6 w-14 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-700 font-medium ml-1">Paid share&lt;</span>
            <Input type="number" min="0" max="100" value={maxShare} onChange={(e) => setMaxShare(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
            <span className="text-[10px] text-slate-400">%</span>
            <span className="text-[10px] text-slate-700 font-medium ml-1">Paid pos&gt;</span>
            <Input type="number" min="0" step="0.1" value={posTh} onChange={(e) => setPosTh(e.target.value)} className="h-6 w-12 text-[11px] px-1 border-0 focus-visible:ring-1" />
          </div>
          {dirty && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setSearch(''); setCategoryFilter('all'); }}>
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
          <CopyKeywordsButton keywords={filtered.map((r) => r.term)} label="Copy keywords" className="ml-auto" />
        </div>
      )}

      {!isLoading && (
        <div className="text-xs text-slate-500">
          {filtered.length}
          {filtered.length !== rows.length ? ` / ${rows.length}` : ''} keyword underbid
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
          Không có keyword nào khớp ngưỡng underbid. Thử nới ngưỡng (tăng paid share, giảm organic≥).
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <SortHead label="Keyword" col="keyword" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} extra="px-3 min-w-[13rem]" />
                <SortHead label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Org users" col="organicUsers" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Org pos" col="organicPos" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Paid users" col="paidUsers" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Paid pos" col="paidPos" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Paid share" col="paidShare" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-2 py-2 text-left font-medium min-w-[12rem]">Camp (đang bid)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = categoryStyle(r.category as Category);
                return (
                  <tr key={r.term} className="border-t hover:bg-slate-50 align-top">
                    <td className="px-3 py-2">
                      <KeywordLink keyword={r.term} surface="paid" className="font-medium text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap', cs.bg, cs.text)}>
                        <span>{cs.emoji}</span>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      {formatNumber(r.organicUsers, { compact: true })}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {formatPos(r.organicPos)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className={r.paidUsers === 0 ? 'text-rose-600 font-medium' : ''}>
                        {formatNumber(r.paidUsers, { compact: true })}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {formatPos(r.paidPos)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <span className="font-mono text-[11px] font-semibold text-amber-700">{formatPercent(r.paidShare)}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-0.5">
                        {r.camps.length === 0 ? (
                          <span className="text-slate-400 text-[11px]">—</span>
                        ) : (
                          r.camps.map((c, i) =>
                            c.url ? (
                              <a
                                key={i}
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                              >
                                {c.name}
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              <span key={i} className="text-[11px] text-slate-600" title="Camp này chưa có URL trong Camp_Links">
                                {c.name}
                              </span>
                            ),
                          )
                        )}
                        {r.inPaidSource === 'manual' && (
                          <span className="text-[10px] text-slate-400">✍️ added manual</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 border-t">
            L365 · pos = avg position · Paid share = paid ÷ (organic + paid) · <b>click cột để sort</b> · mặc định sắp theo nhu cầu organic mà paid đang bỏ lỡ
          </div>
        </div>
      )}
    </div>
  );
}
