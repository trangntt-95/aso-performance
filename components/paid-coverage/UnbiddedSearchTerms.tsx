'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { formatNumber, formatDMYRange } from '@/lib/utils/format';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { KeywordSearchBox } from '@/components/shared/KeywordSearchBox';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { matchKeywordQuery, parseKeywordQuery } from '@/lib/utils/keywordQuery';
import {
  buildPaidSearchTerms,
  paidTermStat,
  PAID_TERM_WINS,
  PAID_TERM_WIN_LABEL,
  type PaidSearchTerm,
  type PaidTermWin,
} from '@/lib/market/paidSearchTerms';
import { cn } from '@/lib/utils';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { SortableTh } from '@/components/shared/SortableTh';

// Câu người dùng gõ trên kênh paid mà mình chưa bid — nguồn GA4, tự cập nhật
// mỗi ngày. Vì sao GA4 chứ không phải export Shopify: xem lib/market/
// paidSearchTerms.ts. Export Shopify chỉ còn là lớp bổ sung ghép vào từng dòng
// (impression, chi phí, keyword đã bắt được), cập nhật theo quý là đủ.
//
// Đứng riêng chứ không trộn vào bảng chính, vì grain khác hẳn: đây là CÂU
// NGƯỜI TA GÕ lọt qua broad match, còn bảng trên là keyword.

// Sắp theo cột: bấm tiêu đề (useTableSort). Chữ, nước, keyword bắt được và
// vị trí mặc định tăng; số mặc định giảm. Mặc định vào bảng: Install giảm.
type SortKey = 'term' | 'country' | 'users' | 'installs' | 'cr' | 'pos' | 'matched' | 'impressions' | 'spend';
const ASC_FIRST: readonly SortKey[] = ['term', 'country', 'pos', 'matched'];

const money = (n: number | null | undefined) => (n && n > 0 ? `$${n.toFixed(2)}` : '—');

export function UnbiddedSearchTerms() {
  const { data } = useSheetData();
  const [open, setOpen] = useState(true);
  const [win, setWin] = useState<PaidTermWin>('l30');
  const { sortKey, sortDir, toggle, sortRows } = useTableSort<SortKey>('installs', { ascFirst: ASC_FIRST });
  const [hidePaused, setHidePaused] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);

  const report = useMemo(() => buildPaidSearchTerms(data), [data]);
  const terms = report.terms;
  const winRange = data?.windowDates?.[PAID_TERM_WIN_LABEL[win]];

  const totals = useMemo(() => {
    let withInstall = 0;
    let withExport = 0;
    let installs = 0;
    for (const t of terms) {
      const s = paidTermStat(t, win);
      if (s.installs > 0) withInstall++;
      installs += s.installs;
      if (t.export) withExport++;
    }
    return { withInstall, withExport, installs };
  }, [terms, win]);

  // Tách `filtered` khỏi `shown`: nút copy lấy CẢ nhóm đang lọc, không chỉ
  // 50 dòng đang hiện — gõ "profit" rồi copy là phải ra đủ mọi câu chứa
  // profit, không phải 50 câu đầu.
  const filtered = useMemo(() => {
    // 'profit -whale' = chứa profit, KHÔNG chứa whale. Xem lib/utils/keywordQuery.ts.
    const query = parseKeywordQuery(q);
    const list = terms.filter((t) => {
      if (hidePaused && t.paused) return false;
      if (query.empty) return true;
      const hay = `${t.term} ${t.english} ${t.export?.matchedKeywords.join(' ') ?? ''}`;
      return matchKeywordQuery(hay, query);
    });
    // Hoà: install → users → chữ, để đảo chiều một cột vẫn ra thứ tự ổn định.
    const base = [...list].sort((a, b) => {
      const sa = paidTermStat(a, win);
      const sb = paidTermStat(b, win);
      return sb.installs - sa.installs || sb.users - sa.users || a.term.localeCompare(b.term);
    });
    return sortRows(base, (t: PaidSearchTerm, key) => {
      const s = paidTermStat(t, win);
      switch (key) {
        case 'term':
          return t.term;
        case 'country':
          return t.countriesByWin[win]?.[0]?.name ?? null;
        case 'users':
          return s.users;
        case 'installs':
          return s.installs;
        case 'cr':
          return s.cr;
        case 'pos':
          return s.pos;
        case 'matched':
          return t.export?.matchedKeywords[0] ?? null;
        case 'impressions':
          return t.export ? t.export.impressions : null;
        case 'spend':
          return t.export ? t.export.spend : null;
      }
    });
  }, [terms, q, win, hidePaused, sortRows]);
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  if (!data || report.paidTermsTotal === 0) return null;
  const allHandled = terms.length === 0;

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
            Search term paid chưa bid — {formatNumber(terms.length)} câu
          </span>
          <span className="ml-2 text-[11px] text-slate-500">
            nguồn GA4 · {formatNumber(totals.withInstall)} câu có install {PAID_TERM_WIN_LABEL[win]} (
            {formatNumber(totals.installs)} install) · {formatNumber(totals.withExport)} câu có trong export Shopify
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-200 px-3 py-2">
          {allHandled && (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
              Mọi câu paid GA4 ghi nhận đều đã được xử lý: {formatNumber(report.droppedInPaid)} câu đang là
              keyword, {formatNumber(report.droppedNegative)} câu trong Negative. Bảng sẽ tự đầy lên khi có câu
              mới lọt vào qua broad match.
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-slate-600">
            <b>Đây là gì:</b> câu người dùng thật sự gõ trên App Store, quảng cáo của mình hiện ra qua
            broad match và họ đã bấm vào — nhưng chưa có keyword riêng nào bid vào câu đó (không có
            trong Master KW Lookup, không trong Negative). Lấy thẳng từ GA4 nên tự cập nhật mỗi ngày
            cùng tracker. Khác bảng trên: bảng trên là <b>keyword</b>, đây là <b>câu tìm kiếm</b>.{' '}
            <b>Dùng thế nào:</b> xếp theo <b>Install</b> để lấy câu đã chứng minh ra install rồi tách
            thành keyword exact — cách rẻ nhất để giành lại lượt hiển thị đang phải mua qua broad.
            Cột <b>Keyword bắt được</b> (từ export Shopify, khi có) cho biết nên tách ra khỏi camp nào.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <KeywordSearchBox
              value={q}
              onChange={setQ}
              placeholder="Tìm câu / keyword bắt được — vd: profit -whale"
            />
            <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
              {PAID_TERM_WINS.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWin(w)}
                  title={`Cửa sổ ${PAID_TERM_WIN_LABEL[w]} — số users/install/CR/vị trí lấy từ tab All_${PAID_TERM_WIN_LABEL[w]}`}
                  className={cn(
                    'px-2 py-0.5 font-medium transition',
                    i > 0 && 'border-l border-slate-200',
                    win === w ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {PAID_TERM_WIN_LABEL[w]}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-600" title="Câu chỉ từng được bid ở camp đã tắt (Paused_camp). Ẩn đi nếu chỉ muốn câu chưa bao giờ bid.">
              <input
                type="checkbox"
                checked={hidePaused}
                onChange={(e) => setHidePaused(e.target.checked)}
                className="h-3 w-3"
              />
              ẩn ⏸ từng bid
            </label>
            <CopyKeywordsButton
              keywords={filtered.map((t) => t.term)}
              label="Copy câu tìm kiếm"
              className="ml-auto"
            />
            <CopyKeywordsButton
              keywords={filtered.filter((t) => paidTermStat(t, win).installs > 0).map((t) => t.term)}
              label={`Copy câu có install ${PAID_TERM_WIN_LABEL[win]}`}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <SortableTh col="term" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="left" className="px-2 py-1" label="Câu tìm kiếm" />
                  <SortableTh
                    col="country"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggle}
                    align="left"
                    className="px-2 py-1"
                    title="Nước có phiên paid cho câu này trong cửa sổ, xếp theo install rồi users"
                    label="Nước"
                  />
                  <SortableTh col="users" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" title={`Người bấm vào quảng cáo (GA4, ${PAID_TERM_WIN_LABEL[win]})`} label="Users" />
                  <SortableTh col="installs" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" title={`Install (GA4 GetApp, ${PAID_TERM_WIN_LABEL[win]})`} label="Install" />
                  <SortableTh col="cr" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" title="Install ÷ users" label="CR" />
                  <SortableTh col="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" title="Vị trí tốt nhất ghi nhận (1 = trên cùng)" label="Pos" />
                  <SortableTh
                    col="matched"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggle}
                    align="left"
                    className="border-l border-slate-200 px-2 py-1 text-slate-500"
                    title="Từ export Shopify Ads: keyword broad/phrase đã bắt được câu này, kèm camp. Trống khi export không có câu này."
                    label="Keyword bắt được"
                  />
                  <SortableTh col="impressions" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1 text-slate-500" title="Impression từ export Shopify Ads (cả kỳ export)" label="Hiển thị" />
                  <SortableTh col="spend" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1 text-slate-500" title="Chi phí từ export Shopify Ads (cả kỳ export)" label="Chi" />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const s = paidTermStat(t, win);
                  const countries = t.countriesByWin[win] ?? [];
                  const top = countries.slice(0, 2);
                  const more = countries.length - top.length;
                  return (
                    <tr key={t.term} className="border-t hover:bg-slate-50">
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <KeywordLink
                            keyword={t.term}
                            surface="paid"
                            className="font-medium text-slate-800"
                          />
                          {t.category !== 'Unknown' && (
                            <span className="rounded bg-slate-100 px-1 text-[9px] text-slate-500">{t.category}</span>
                          )}
                          {t.countryOnly && (
                            <span
                              className="rounded bg-sky-50 px-1 text-[9px] text-sky-700 ring-1 ring-sky-200"
                              title="Câu này không có trong All_L* (tab bị cắt top 500), chỉ có ở Country_L* — số là tổng các nước."
                            >
                              tab nước
                            </span>
                          )}
                          {t.paused && (
                            <span
                              className="rounded bg-amber-50 px-1 text-[9px] font-medium text-amber-700 ring-1 ring-amber-200"
                              title={`Từng bid ở camp đã tắt: ${t.pausedCamps.join(', ')}`}
                            >
                              ⏸ từng bid
                            </span>
                          )}
                        </div>
                        {t.english && t.english.toLowerCase() !== t.term.toLowerCase() && (
                          <div className="text-[10px] italic text-slate-400">{t.english}</div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-[11px] text-slate-600">
                        {top.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span title={countries.map((c) => `${c.name}: ${c.installs} install / ${c.users} users`).join('\n')}>
                            {top.map((c) => c.name).join(', ')}
                            {more > 0 && <span className="text-slate-400"> +{more}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-600">{s.users}</td>
                      <td
                        className={cn(
                          'px-2 py-1 text-right font-mono tabular-nums',
                          s.installs > 0 ? 'font-semibold text-emerald-700' : 'text-slate-400',
                        )}
                      >
                        {s.installs}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-600">
                        {s.cr === null ? '—' : `${Math.round(s.cr * 100)}%`}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-500">
                        {s.pos === null ? '—' : s.pos.toFixed(1)}
                      </td>
                      <td className="border-l border-slate-100 px-2 py-1 text-slate-500">
                        {t.export && t.export.matchedKeywords.length > 0 ? (
                          <span title={`camp: ${t.export.camps.join(', ')}`}>
                            {t.export.matchedKeywords.join(', ')}
                          </span>
                        ) : (
                          <span className="text-slate-300" title="Export Shopify không có câu này">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-500">
                        {t.export ? formatNumber(t.export.impressions, { compact: true }) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-500">
                        {t.export ? money(t.export.spend) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {shown.length === 0 && (
            <p className="py-3 text-center text-[11px] italic text-slate-500">Không có câu nào khớp filter.</p>
          )}

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
            <b>Nguồn chính:</b> dòng surface <code className="text-[9px]">search_ad</code> trong tab{' '}
            <code className="text-[9px]">All_L*</code> / <code className="text-[9px]">Country_L*</code> (GA4, tracker
            ghi mỗi sáng
            {winRange?.from && <>; {PAID_TERM_WIN_LABEL[win]} = {formatDMYRange(winRange.from, winRange.to)}</>}
            ). Shopify chuyển nguyên câu người dùng gõ sang GA4, nên dòng paid ở đó là câu tìm kiếm thật, kể cả
            khi lọt vào qua broad match. Đã bỏ {formatNumber(report.droppedInPaid)} câu đang bid (Master KW
            Lookup / KW_Added_Manual), {formatNumber(report.droppedNegative)} câu trong Negative KW list
            {report.droppedNoTraffic > 0 && (
              <> và {formatNumber(report.droppedNoTraffic)} câu của kỳ trước không còn users ở cửa sổ nào</>
            )}
            . GA4 chỉ thấy câu khi có người bấm — câu chỉ hiển thị mà không ai bấm không có ở đây.{' '}
            <b>Lớp bổ sung:</b> tab <code className="text-[9px]">Search_Term_Unbidded</code> (export search term
            của Shopify Ads
            {report.exportRange && <>, kỳ {formatDMYRange(report.exportRange.from, report.exportRange.to)}</>})
            cho impression, chi phí và keyword đã bắt được; cập nhật theo quý là đủ vì bảng không phụ thuộc
            vào nó.
            {report.exportOnlyWithSignal > 0 && (
              <>
                {' '}
                Export có {formatNumber(report.exportOnlyWithSignal)} câu có click mà GA4 không thấy — ít, nhưng
                là phần GA4 bỏ lỡ.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
