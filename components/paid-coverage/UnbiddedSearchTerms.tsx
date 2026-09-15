'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { SearchTermRow } from '@/lib/sheets/types';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { formatNumber, formatDMYRange } from '@/lib/utils/format';
import { Input } from '@/components/ui/input';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { cn } from '@/lib/utils';

// Query mà broad match đã bắt được nhưng chưa được bid thành keyword riêng.
//
// Đứng riêng chứ không trộn vào bảng chính, vì grain khác hẳn: đây là CÂU
// NGƯỜI TA GÕ, còn bảng trên là keyword. Cả tab lại dùng chung một khoảng
// ngày, không có cửa sổ L7/L30/L90 nào — nhét vào bốn cột window của bảng
// chính thì bốn cột đó thành số bịa.
//
// Mặc định thu lại: 2.201 dòng mở sẵn sẽ đẩy bảng chính ra khỏi màn hình, mà
// bảng chính mới là thứ trang này tồn tại để trả lời.

type Sort = 'installs' | 'revenue' | 'impressions' | 'spend';

const SORTS: { id: Sort; label: string; hint: string }[] = [
  { id: 'installs', label: 'Install', hint: 'Câu đã ra install thật — bằng chứng mạnh nhất' },
  { id: 'revenue', label: 'Doanh thu', hint: 'Câu đã ra tiền' },
  { id: 'impressions', label: 'Hiển thị', hint: 'Nhu cầu lớn nhưng chưa chắc ra install' },
  { id: 'spend', label: 'Chi phí', hint: 'Câu đang tiêu tiền qua broad match' },
];

export function UnbiddedSearchTerms() {
  const { data } = useSheetData();
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<Sort>('installs');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);

  // Giữ tham chiếu ổn định: `?? []` tạo mảng mới mỗi lần render, nên hai
  // useMemo bên dưới sẽ tính lại cả 2.201 dòng ở mỗi lần gõ phím.
  const source = data?.searchTermUnbidded;
  const rows = useMemo(() => source ?? [], [source]);
  const range = data?.searchTermRange;

  const totals = useMemo(() => {
    let installs = 0;
    let spend = 0;
    let revenue = 0;
    let impressions = 0;
    for (const r of rows) {
      installs += r.installs;
      spend += r.spend;
      revenue += r.revenue;
      impressions += r.impressions;
    }
    return { installs, spend, revenue, impressions };
  }, [rows]);

  // Tách `filtered` khỏi `shown`: nút copy lấy CẢ nhóm đang lọc, không chỉ
  // 50 dòng đang hiện — gõ "profit" rồi copy là phải ra đủ mọi câu chứa
  // profit, không phải 50 câu đầu.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? rows.filter(
          (r) =>
            r.searchTerm.toLowerCase().includes(needle) ||
            r.matchedKeyword.toLowerCase().includes(needle),
        )
      : rows;
    return [...list].sort((a, b) => b[sort] - a[sort]);
  }, [rows, q, sort]);
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Search className="h-4 w-4 shrink-0 text-indigo-600" />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-900">
            Search term chưa bid — {formatNumber(rows.length)} câu
          </span>
          <span className="ml-2 text-[11px] text-slate-500">
            {formatNumber(totals.installs)} install · ${formatNumber(Math.round(totals.spend))} đã
            tiêu · ${formatNumber(Math.round(totals.revenue))} doanh thu
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-200 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-slate-600">
            <b>Đây là gì:</b> câu người dùng thật sự gõ, mà camp broad match đã bắt được — nhưng
            chưa có keyword riêng nào bid vào nó. Khác bảng trên: bảng trên là <b>keyword</b>, đây
            là <b>câu tìm kiếm</b>.{' '}
            <b>Dùng thế nào:</b> xếp theo <b>Install</b> để lấy câu đã chứng minh ra install rồi
            tách thành keyword exact — đó là cách rẻ nhất để giành lại lượt hiển thị đang phải mua
            qua broad. Xếp theo <b>Hiển thị</b> để thấy nhu cầu lớn chưa khai thác. Cột{' '}
            <b>Keyword bắt được</b> cho biết nên tách ra khỏi camp nào.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm câu hoặc keyword bắt được…"
                className="h-7 pl-7 text-xs"
              />
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
              {SORTS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSort(s.id)}
                  title={s.hint}
                  className={cn(
                    'px-2 py-0.5 font-medium transition',
                    i > 0 && 'border-l border-slate-200',
                    sort === s.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <CopyKeywordsButton
              keywords={filtered.map((r) => r.searchTerm)}
              label="Copy câu tìm kiếm"
              className="ml-auto"
            />
            <CopyKeywordsButton
              keywords={filtered.filter((r) => r.installs > 0).map((r) => r.searchTerm)}
              label="Copy câu có install"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Câu tìm kiếm</th>
                  <th className="px-2 py-1 text-left font-medium">Keyword bắt được</th>
                  <th className="px-2 py-1 text-right font-medium">Hiển thị</th>
                  <th className="px-2 py-1 text-right font-medium">Click</th>
                  <th className="px-2 py-1 text-right font-medium">Install</th>
                  <th className="px-2 py-1 text-right font-medium">Chi</th>
                  <th className="px-2 py-1 text-right font-medium" title="Doanh thu sheet ghi cho câu này">
                    Doanh thu
                  </th>
                  <th className="px-2 py-1 text-right font-medium" title="Vị trí trung bình">
                    Pos
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r: SearchTermRow, i) => (
                  <tr key={`${r.searchTerm}-${r.matchedKeyword}-${i}`} className="border-t hover:bg-slate-50">
                    <td className="px-2 py-1 font-medium text-slate-800">{r.searchTerm}</td>
                    <td className="px-2 py-1 text-slate-500" title={`${r.matchType} · camp ${r.camp}`}>
                      {r.matchedKeyword || '—'}
                      <span className="ml-1 text-[9px] text-slate-400">{r.matchType}</span>
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-600">
                      {formatNumber(r.impressions, { compact: true })}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-600">
                      {formatNumber(r.clicks, { compact: true })}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1 text-right font-mono tabular-nums',
                        r.installs > 0 ? 'font-semibold text-emerald-700' : 'text-slate-400',
                      )}
                    >
                      {r.installs}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-600">
                      {r.spend > 0 ? `$${r.spend.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-700">
                      {r.revenue > 0 ? `$${formatNumber(Math.round(r.revenue))}` : '—'}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-500">
                      {r.position === null || r.position === 0 ? '—' : r.position.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {shown.length < filtered.length && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 100)}
              className="text-[11px] text-indigo-600 hover:underline"
            >
              Hiện thêm 100 câu ({formatNumber(filtered.length - shown.length)} còn lại)
            </button>
          )}

          <p className="border-t pt-2 text-[10px] leading-relaxed text-slate-400">
            Nguồn: tab <code className="text-[9px]">Search_Term_Unbidded</code> trong sheet ASO —
            báo cáo search term của Apple Search Ads, đã lọc sẵn theo cột <b>Bid Status</b> ={' '}
            <b>⚠️ Chưa bid</b>
            {range?.from && <> · khoảng {formatDMYRange(range.from, range.to)}</>}. Cả tab dùng
            chung một khoảng ngày nên không có cửa sổ L7/L30/L90 — số ở đây là tổng của cả khoảng,
            không so được trực tiếp với bốn cột window ở bảng trên. <b>Bid</b> trong tab là bid của
            keyword đã bắt được câu, không phải giá trả cho chính câu đó.
          </p>
        </div>
      )}
    </div>
  );
}
