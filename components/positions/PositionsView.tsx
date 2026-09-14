'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { CategoryChip } from '@/components/shared/CategoryChip';
import { normKw } from '@/lib/sheets/kwNorm';
import { CATEGORY_ORDER } from '@/lib/utils/colors';
import type { Category } from '@/lib/sheets/types';
import { buildCountryNetValue } from '@/lib/market/keywordNetValue';
import { cn } from '@/lib/utils';
import {
  POSITION_WINDOWS,
  TIER1_CORE_KEYWORDS,
  buildPositionRows,
  cellInstalls,
  cellPos,
  isTier1,
  isTier23,
  topProfitKeywords,
  type PositionRow,
  type PositionWindow,
  type SurfaceKey,
} from '@/lib/market/keywordPosition';

// Vị trí keyword theo nước qua L3 / L7 / L14 / L30 / L90.
//
// Mặc định thu hẹp về đúng câu hỏi Trang hay hỏi: brand và các keyword Profit
// chính đang đứng thứ mấy ở thị trường Tier 2–3 — chỗ đang đẩy bid để lên top.
// Mọi thứ khác vẫn ở trong dữ liệu, chỉ hiện khi đổi bộ lọc hoặc bấm "hiện tất
// cả"; một bảng 1.100 dòng mà mở ra là không ai đọc.

type SurfacePick = SurfaceKey | 'both';
type Scope = 'default' | 'all';

const selectCls =
  'h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';

const TIER_CLS = (tier: string): string => {
  if (/^tier 1 premium/i.test(tier)) return 'bg-emerald-100 text-emerald-800';
  if (/^tier 1/i.test(tier)) return 'bg-teal-100 text-teal-800';
  if (/^tier 2/i.test(tier)) return 'bg-sky-100 text-sky-800';
  if (/^tier 3/i.test(tier)) return 'bg-indigo-100 text-indigo-800';
  return 'bg-slate-100 text-slate-500';
};

/** Màu theo vị trí: top 1–1.5 xanh, tới 3 thường, sau 3 vàng, sau 5 đỏ. */
const posCls = (p: number | null): string => {
  if (p === null) return 'text-slate-300';
  if (p <= 1.5) return 'font-semibold text-emerald-700';
  if (p <= 3) return 'text-slate-800';
  if (p <= 5) return 'text-amber-700';
  return 'text-rose-600';
};

const fmtPos = (p: number | null): string => (p === null ? '—' : p.toFixed(p >= 10 ? 0 : 1));

export function PositionsView() {
  const { data, isLoading, error } = useSheetData();
  const rows = useMemo(() => buildPositionRows(data), [data]);

  const [scope, setScope] = useState<Scope>('default');
  const [surface, setSurface] = useState<SurfacePick>('both');
  const [topN, setTopN] = useState('5');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortWin, setSortWin] = useState<PositionWindow>('L7');

  const profitTop = useMemo(() => new Set(topProfitKeywords(rows, Number(topN) || 5)), [rows, topN]);
  // Giá trị install của nước (tab Net value per install), theo kênh đang chọn.
  const countryNv = useMemo(() => buildCountryNetValue(data, surface === 'both' ? 'all' : surface), [data, surface]);

  const { categories, tiers, countries } = useMemo(() => {
    const c = new Set<string>();
    const t = new Set<string>();
    const k = new Set<string>();
    for (const r of rows) {
      c.add(r.category);
      if (r.tier) t.add(r.tier);
      k.add(r.country);
    }
    const order = CATEGORY_ORDER as readonly string[];
    return {
      categories: [...order.filter((x) => c.has(x)), ...Array.from(c).filter((x) => !order.includes(x)).sort()],
      tiers: Array.from(t).sort(),
      countries: Array.from(k).sort(),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (scope === 'default') {
        // Tier 2–3: Brand (mọi keyword) + top N Profit. Tier 1: chỉ hai keyword
        // lõi 'trueprofit' và 'profit' (Trang, 14/09). Còn lại: ẩn tới khi lọc.
        const k = normKw(r.keyword);
        const tier23Ok = isTier23(r.tier) && (r.category === 'Brand' || (r.category === 'Profit' && profitTop.has(k)));
        const tier1Ok = isTier1(r.tier) && TIER1_CORE_KEYWORDS.includes(k);
        if (!tier23Ok && !tier1Ok) return false;
      }
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (tierFilter !== 'all' && (r.tier || '(không tier)') !== tierFilter) return false;
      if (countryFilter !== 'all' && r.country !== countryFilter) return false;
      if (surface !== 'both' && !POSITION_WINDOWS.some((w) => r.cells[w]?.[surface])) return false;
      if (q && !`${r.keyword} ${r.english} ${r.country}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // Sắp theo vị trí ở cửa sổ đã chọn (tốt nhất trước); không có vị trí → cuối.
    list.sort((a, b) => {
      const pa = cellPos(a, sortWin, surface)?.pos ?? Infinity;
      const pb = cellPos(b, sortWin, surface)?.pos ?? Infinity;
      if (pa !== pb) return pa - pb;
      return b.users - a.users;
    });
    return list;
  }, [rows, scope, profitTop, categoryFilter, tierFilter, countryFilter, surface, search, sortWin]);

  const dirty = categoryFilter !== 'all' || tierFilter !== 'all' || countryFilter !== 'all' || search !== '' || surface !== 'both';
  const reset = () => {
    setCategoryFilter('all');
    setTierFilter('all');
    setCountryFilter('all');
    setSearch('');
    setSurface('both');
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        <AlertCircle className="h-4 w-4" /> {String(error)}
      </div>
    );
  }

  const windowDates = data?.windowDates ?? {};
  const dmy = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <b>Vị trí keyword theo nước</b> qua 5 cửa sổ L3 → L90, đọc từ các tab{' '}
        <code className="text-[10px]">Country_L*</code> (GA4): vị trí trung bình trong cửa sổ, kèm cửa sổ liền trước để
        thấy đang lên hay xuống. Mặc định chỉ hiện <b>Brand</b> và <b>top Profit</b> ở thị trường <b>Tier 2–3</b>, cộng hai keyword lõi{' '}
        <b>trueprofit</b> và <b>profit</b> ở <b>Tier 1</b> (tier theo tab <code className="text-[10px]">Max bid cap</code>);
        các keyword, category và tier khác ẩn — bấm{' '}
        <b>Hiện tất cả</b> hoặc lọc để xem. Kênh <b>cả hai</b> = gia quyền organic + paid theo users; chọn riêng để
        xem vị trí organic (ASO) hay paid (ads).
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
          {(
            [
              { id: 'default' as Scope, label: '🎯 Mặc định: Brand + top Profit ở Tier 2–3 · trueprofit, profit ở Tier 1' },
              { id: 'all' as Scope, label: 'Hiện tất cả' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setScope(t.id)}
              className={cn('rounded-md px-2.5 py-1 font-medium transition', scope === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {t.label}
            </button>
          ))}
        </div>
        {scope === 'default' && (
          <label className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
            Top Profit
            <Input type="number" min="1" value={topN} onChange={(e) => setTopN(e.target.value)} className="h-6 w-10 px-1 text-[11px]" title="Bao nhiêu keyword Profit nhiều users nhất được coi là 'chính'" />
          </label>
        )}
        <select value={surface} onChange={(e) => setSurface(e.target.value as SurfacePick)} className={selectCls} title="Kênh">
          <option value="both">Kênh: cả hai</option>
          <option value="organic">🌿 Organic</option>
          <option value="paid">💰 Paid</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls} title="Category">
          <option value="all">Category: All</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className={selectCls} title="Tier của nước theo Max bid cap">
          <option value="all">Tier: All</option>
          {tiers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          <option value="(không tier)">(không có trong Max bid cap)</option>
        </select>
        <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className={selectCls} title="Nước">
          <option value="all">Country: All</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="relative min-w-[160px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm keyword / nước…" className="h-7 pl-7 text-xs" />
        </div>
        {dirty && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={reset}>
            <X className="h-3 w-3" /> Reset
          </Button>
        )}
        <span className="ml-auto text-[11px] text-slate-500">
          {filtered.length} keyword × nước{scope === 'default' ? ` (ẩn ${rows.length - filtered.length})` : ` / ${rows.length}`}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-white py-14 text-center text-sm text-slate-500">
          {scope === 'default'
            ? 'Không có dòng Brand / top Profit nào có vị trí ở Tier 2–3 trong các cửa sổ. Bấm "Hiện tất cả" để xem toàn bộ.'
            : 'Không có dòng nào khớp filter.'}
        </div>
      ) : (
        <div className="max-h-[75vh] overflow-auto rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Keyword</th>
                <th className="px-2 py-2 text-left font-medium" title="Tier theo Max bid cap · số tím = một install ở nước đó đáng bao nhiêu (tab Net value per install, YTD, theo kênh đang chọn); * = dưới 3 shop trả tiền">Nước · tier · value/inst</th>
                {POSITION_WINDOWS.map((w) => {
                  const d = windowDates[w];
                  return (
                    <th
                      key={w}
                      onClick={() => setSortWin(w)}
                      className={cn('cursor-pointer select-none px-2 py-2 text-right font-medium hover:text-slate-900', sortWin === w && 'text-indigo-700')}
                      title={`Vị trí trung bình trong ${w}${d ? ` (${dmy(d.from)}–${dmy(d.to)})` : ''} · dòng dưới: cửa sổ liền trước → nay · bấm để sắp theo cửa sổ này`}
                    >
                      {w}
                      {sortWin === w && <span className="ml-0.5 text-[9px]">▲</span>}
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-right font-medium" title={`Install ở cửa sổ ${sortWin} (đang sắp theo cửa sổ này), theo kênh đã chọn · trong ngoặc: users cùng cửa sổ`}>
                  Inst {sortWin}
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Tổng users mọi cửa sổ, mọi kênh">Users</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.keyword}|${r.country}`} className="border-t align-top hover:bg-slate-50">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <CategoryChip category={r.category as Category} compact />
                      <KeywordLink keyword={r.keyword} country={r.country} className="truncate font-medium text-sm" />
                    </div>
                    {r.english && r.english.toLowerCase() !== r.keyword.toLowerCase() && (
                      <div className="mt-0.5 truncate text-[10px] italic text-slate-500">→ {r.english}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="text-slate-800">{r.country}</span>
                    {r.tier ? (
                      <span className={cn('ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium', TIER_CLS(r.tier))}>{r.tier}</span>
                    ) : (
                      <span className="ml-1.5 text-[9px] text-slate-300" title="Nước không có trong Max bid cap">—</span>
                    )}
                    {(() => {
                      const nv = countryNv.get(r.country.trim().toLowerCase());
                      if (!nv || nv.netPerInstall === null) return null;
                      return (
                        <span
                          className={cn('ml-1.5 font-mono text-[10px]', nv.thin ? 'text-amber-700' : 'text-indigo-600')}
                          title={`Value/inst ở ${r.country}: ${nv.installs} install · ${nv.payingShops} shop trả tiền · net $${Math.round(nv.netValue).toLocaleString()}${nv.thin ? ' — mỏng' : ''}`}
                        >
                          ${nv.netPerInstall.toFixed(0)}/inst{nv.thin ? '*' : ''}
                        </span>
                      );
                    })()}
                  </td>
                  {POSITION_WINDOWS.map((w) => (
                    <PosCell key={w} row={r} w={w} surface={surface} />
                  ))}
                  <td className="px-2 py-1.5 text-right font-mono text-[11px] whitespace-nowrap">
                    {(() => {
                      const inst = cellInstalls(r, sortWin, surface);
                      const c = cellPos(r, sortWin, surface);
                      if (inst === null) return <span className="text-slate-200">—</span>;
                      return (
                        <>
                          <span className={cn(inst > 0 ? 'font-semibold text-emerald-700' : 'text-slate-400')}>{inst}</span>
                          {c && <span className="ml-1 text-[9px] text-slate-400">({c.users} u)</span>}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">{r.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-3 py-2 text-[10px] text-slate-400">
            Vị trí = <code className="text-[9px]">posL</code> của tab Country_L* (trung bình cửa sổ; GA4 App Store search
            rank) · dòng nhỏ dưới mỗi ô = vị trí cửa sổ liền trước → nay, <span className="text-emerald-600">xanh</span> lên,{' '}
            <span className="text-rose-600">đỏ</span> xuống · kênh &ldquo;cả hai&rdquo; gia quyền theo users · màu vị trí:{' '}
            <span className="text-emerald-700">≤1.5</span> · ≤3 · <span className="text-amber-700">≤5</span> ·{' '}
            <span className="text-rose-600">&gt;5</span> · ô &ldquo;—&rdquo; = có traffic mà GA4 không trả rank; ô trống = không có
            traffic ở cửa sổ đó · tier nước theo Max bid cap · bấm keyword để mở drill.
          </div>
        </div>
      )}
    </div>
  );
}

function PosCell({ row, w, surface }: { row: PositionRow; w: PositionWindow; surface: SurfacePick }) {
  const c = cellPos(row, w, surface);
  if (!c) return <td className="px-2 py-1.5 text-right font-mono text-[11px] text-slate-200"> </td>;
  const org = row.cells[w]?.organic;
  const paid = row.cells[w]?.paid;
  const delta = c.pos !== null && c.posPrev !== null ? c.pos - c.posPrev : null;
  return (
    <td
      className="px-2 py-1.5 text-right font-mono text-[11px] whitespace-nowrap"
      title={
        `${w} · ${c.users} users` +
        (org ? ` · organic ${fmtPos(org.pos)} (${org.users} u)` : '') +
        (paid ? ` · paid ${fmtPos(paid.pos)} (${paid.users} u)` : '') +
        (c.posPrev !== null ? ` · kỳ trước ${fmtPos(c.posPrev)}` : '')
      }
    >
      <span className={posCls(c.pos)}>{fmtPos(c.pos)}</span>
      {surface === 'both' && org && paid && org.pos !== null && paid.pos !== null && (
        <span className="ml-1 text-[9px] text-slate-400">
          {fmtPos(org.pos)}/{fmtPos(paid.pos)}
        </span>
      )}
      {c.posPrev !== null && (
        <div className={cn('text-[9px]', delta === null ? 'text-slate-300' : delta < -0.05 ? 'text-emerald-600' : delta > 0.05 ? 'text-rose-600' : 'text-slate-400')}>
          {fmtPos(c.posPrev)} → {fmtPos(c.pos)}
        </div>
      )}
    </td>
  );
}
