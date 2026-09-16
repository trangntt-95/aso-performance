'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, EyeOff } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { formatNumber, formatDMYRange } from '@/lib/utils/format';
import { CopyKeywordsButton } from '@/components/shared/CopyKeywordsButton';
import { KeywordSearchBox } from '@/components/shared/KeywordSearchBox';
import { KeywordLink } from '@/components/shared/KeywordLink';
import { matchKeywordQuery, parseKeywordQuery } from '@/lib/utils/keywordQuery';
import {
  buildIdleBidsReport,
  DEMAND_ORGANIC_USERS,
  IDLE_GROUPS,
  IDLE_WINDOWS,
  signalOf,
  type IdleBidRow,
  type IdleGroup,
  type IdleWindow,
} from '@/lib/market/idleBids';
import { buildKeywordNetValueByPick, type NetValueAgg } from '@/lib/market/keywordNetValue';
import { normKw } from '@/lib/sheets/kwNorm';
import { cn } from '@/lib/utils';
import { NoteCell } from '@/components/shared/NoteCell';
import { KeywordCountryNotes } from '@/components/shared/KeywordCountryNotes';
import { KeywordCampsList } from '@/components/shared/KeywordCampsList';
import { useNotesStore } from '@/lib/store/notesStore';
import { KEYWORD_NOTE_SCOPE, KEYWORD_PIN_SCOPE, keywordNoteId, keywordNoteKeys, readKeywordNote, readPinnedCamps, togglePinnedCamp } from '@/lib/store/keywordNotes';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { SortableTh } from '@/components/shared/SortableTh';

// Keyword đang bid mà không ai bấm — mặt trái của bảng chính. Xem
// lib/market/idleBids.ts cho lý do chia ba nhóm.
//
// Mặc định mọi category (Trang, 16/09/2026); nhóm "Không có gì" tắt sẵn nên
// 8.000 keyword chết không che 460 dòng đáng làm. Có bộ chọn category để thu
// hẹp khi cần.

const ALL = '__all__';

const GROUP_META: Record<IdleGroup, { label: string; tone: string; help: string; action: string }> = {
  demand: {
    label: 'Có nhu cầu',
    tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    help: `Organic từ ${DEMAND_ORGANIC_USERS} users trong lịch sử, hoặc paid từng ra install. Có người tìm mà paid không hiện → đang thua đấu giá.`,
    action: 'Tăng bid — đây là chỗ đúng để lấy data.',
  },
  weak: {
    label: 'Tín hiệu yếu',
    tone: 'bg-amber-50 text-amber-800 ring-amber-200',
    help: '1–2 users organic, vài users paid không install, hoặc chỉ có impression trong export Shopify.',
    action: 'Thử nhẹ vài keyword có impression cao nhất; còn lại chờ.',
  },
  none: {
    label: 'Không có gì',
    tone: 'bg-slate-100 text-slate-600 ring-slate-200',
    help: 'Không organic, không paid, không impression trong cả lịch sử. Hiển thị 0 vì không có phiên tìm, không phải vì bid thấp.',
    action: 'Không tăng bid — bid không tạo ra lượt tìm. Giữ bid sàn hoặc xoá.',
  },
};

// Sắp theo cột: bấm tiêu đề (useTableSort). 'signal' là khoá mặc định ẩn
// (bằng chứng gộp: install paid, users organic, users paid, impression) — không
// có tiêu đề riêng, bấm cột nào thì cột đó thay. Luôn xếp nhóm trước (có nhu
// cầu → yếu → không có gì) rồi mới tới cột đang chọn; chỉ khi sắp cột Nhóm thì
// đảo chiều mới đảo thứ tự nhóm.
type SortKey = 'signal' | 'keyword' | 'group' | 'organic' | 'paid' | 'impressions' | 'value' | 'bid' | 'camps';
const ASC_FIRST: readonly SortKey[] = ['keyword', 'group'];
const GROUP_ORDER: Record<IdleGroup, number> = { demand: 0, weak: 1, none: 2 };

const money = (n: number | null | undefined) => (n && n > 0 ? `$${n.toFixed(2)}` : '—');

export function IdleBids() {
  const { data } = useSheetData();
  const [open, setOpen] = useState(true);
  const [win, setWin] = useState<IdleWindow>('L90');
  const [category, setCategory] = useState<string>(ALL);
  const [groups, setGroups] = useState<Set<IdleGroup>>(() => new Set<IdleGroup>(['demand', 'weak']));
  const { sortKey, sortDir, toggle, sortRows } = useTableSort<SortKey>('signal', { ascFirst: ASC_FIRST });
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const [onlyNoted, setOnlyNoted] = useState(false);

  // Note keyword dùng chung với Underbid / trend sheet (App_Notes, scope
  // 'underbid', khoá keyword chuẩn hoá) — ghi ở đây là Underbid thấy ngay.
  const loadNotes = useNotesStore((s) => s.load);
  const notesLoaded = useNotesStore((s) => s.loaded);
  const notes = useNotesStore((s) => s.notes);
  const setNote = useNotesStore((s) => s.setNote);
  useEffect(() => {
    if (!notesLoaded) loadNotes();
  }, [notesLoaded, loadNotes]);
  const togglePin = (keyword: string, camp: string) =>
    setNote(KEYWORD_PIN_SCOPE, keywordNoteId(keyword), togglePinnedCamp(readPinnedCamps(notes, keyword), camp));

  const report = useMemo(() => buildIdleBidsReport(data, win), [data, win]);
  const winRange = data?.windowDates?.[win];

  const categoryChoice = category;
  // Giá trị keyword (tab Net value per install): $/install, tổng, số shop.
  const nvByKw = useMemo(() => buildKeywordNetValueByPick(data), [data]);
  const nvOf = (keyword: string): NetValueAgg | null => nvByKw.get(normKw(keyword))?.all ?? null;

  // Dòng của category đang chọn, trước khi lọc nhóm — để đếm từng nhóm.
  const inCategory = useMemo(() => {
    if (!report) return [];
    return categoryChoice === ALL ? report.rows : report.rows.filter((r) => r.category === categoryChoice);
  }, [report, categoryChoice]);
  const groupCounts = useMemo(() => {
    const c: Record<IdleGroup, number> = { demand: 0, weak: 0, none: 0 };
    for (const r of inCategory) c[r.group] += 1;
    return c;
  }, [inCategory]);
  const activeInCategory = useMemo(() => {
    if (!report) return 0;
    if (categoryChoice === ALL) return report.activeKeywords;
    return report.categories.find((c) => c.category === categoryChoice)?.active ?? 0;
  }, [report, categoryChoice]);

  // `filtered` tách khỏi `shown`: nút copy lấy cả nhóm đang lọc, không chỉ 100 dòng đầu.
  const filtered = useMemo(() => {
    const query = parseKeywordQuery(q);
    const list = inCategory.filter((r) => {
      if (!groups.has(r.group)) return false;
      if (onlyNoted && !readKeywordNote(notes, r.keyword).trim()) return false;
      if (query.empty) return true;
      return matchKeywordQuery(`${r.keyword} ${r.camps.map((c) => c.camp).join(' ')}`, query);
    });
    // Hoà: bằng chứng giảm rồi chữ — thứ tự hôm nay, và là nền để đảo chiều
    // một cột vẫn ổn định.
    const base = [...list].sort((a, b) => signalOf(b) - signalOf(a) || a.keyword.localeCompare(b.keyword));
    const get = (r: IdleBidRow, key: SortKey): number | string | null => {
      switch (key) {
        case 'signal':
          return signalOf(r);
        case 'keyword':
          return r.keyword;
        case 'group':
          return GROUP_ORDER[r.group];
        case 'organic':
          return r.organicUsers;
        case 'paid':
          return r.paidUsers;
        case 'impressions':
          return r.exportImpressions;
        case 'value':
          return nvOf(r.keyword)?.netPerInstall ?? null;
        case 'bid':
          return r.bidMax;
        case 'camps':
          return r.camps.length;
      }
    };
    if (sortKey === 'group') return sortRows(base, get);
    // Nhóm trước, cột đang chọn trong từng nhóm.
    return IDLE_GROUPS.flatMap((g) => sortRows(base.filter((r) => r.group === g), get));
  }, [inCategory, groups, q, sortKey, sortRows, onlyNoted, notes, nvByKw]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const notedCount = useMemo(
    () => inCategory.reduce((n, r) => n + (readKeywordNote(notes, r.keyword).trim() ? 1 : 0), 0),
    [inCategory, notes],
  );

  if (!data || !report) return null;

  const toggleGroup = (g: IdleGroup) =>
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const catLabel = categoryChoice === ALL ? 'tất cả category' : categoryChoice;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <EyeOff className="h-4 w-4 shrink-0 text-rose-600" />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-900">
            Đang bid mà không ai bấm — {formatNumber(inCategory.length)}/{formatNumber(activeInCategory)} keyword {catLabel}, 0 users paid {win}
          </span>
          <span className="ml-2 text-[11px] text-slate-500">
            {IDLE_GROUPS.map((g) => `${GROUP_META[g].label.toLowerCase()} ${formatNumber(groupCounts[g])}`).join(' · ')}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-200 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-slate-600">
            <b>Đây là gì:</b> keyword nằm trong camp chưa tắt (Master KW Lookup trừ Paused_camp) mà GA4 không ghi
            một người paid nào bấm vào trong {win}
            {winRange ? ` (${formatDMYRange(winRange.from, winRange.to)})` : ''}, cả tab tổng lẫn tab nước. Bảng
            trên hỏi &ldquo;có người tìm mà mình chưa mua?&rdquo;; bảng này hỏi ngược lại: &ldquo;mình đang mua mà
            không ai thấy?&rdquo;. <b>Dùng thế nào:</b> bid chỉ mua được lượt hiển thị ở keyword <b>có người gõ</b>,
            nên tách theo bằng chứng trong lịch sử ({report.historyWindow}
            {report.historyWindow === 'L90' ? ', vì All_L365 đang trống' : ''}
            {report.hasExport ? ' + export Shopify' : ''}):
          </p>
          <ul className="grid gap-1 text-[11px] sm:grid-cols-3">
            {IDLE_GROUPS.map((g) => (
              <li key={g} className={cn('rounded px-2 py-1 ring-1', GROUP_META[g].tone)}>
                <b>{GROUP_META[g].label}</b> ({formatNumber(groupCounts[g])}): {GROUP_META[g].help}{' '}
                <span className="font-medium">→ {GROUP_META[g].action}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryChoice}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
              title="Category của camp đang bid keyword (theo Master KW Lookup). Số = keyword không ai bấm / keyword active."
            >
              <option value={ALL}>Tất cả ({formatNumber(report.rows.length)}/{formatNumber(report.activeKeywords)})</option>
              {report.categories.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category} ({formatNumber(c.idle)}/{formatNumber(c.active)})
                </option>
              ))}
            </select>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
              {IDLE_WINDOWS.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWin(w)}
                  title={`0 users paid trong ${w} — đọc All_${w} và Country_${w}`}
                  className={cn(
                    'px-2 py-0.5 font-medium transition',
                    i > 0 && 'border-l border-slate-200',
                    win === w ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
            <div className="inline-flex flex-wrap gap-1 text-[11px]">
              {IDLE_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGroup(g)}
                  title={GROUP_META[g].help}
                  className={cn(
                    'rounded-full px-2 py-0.5 font-medium ring-1 transition',
                    groups.has(g) ? GROUP_META[g].tone : 'bg-white text-slate-400 ring-slate-200 line-through',
                  )}
                >
                  {GROUP_META[g].label} {formatNumber(groupCounts[g])}
                </button>
              ))}
            </div>
            <KeywordSearchBox value={q} onChange={setQ} placeholder="Tìm keyword / camp — vd: profit -whale" />
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-600" title="Chỉ hiện keyword đã có ghi chú (ghi ở đây hoặc ở Underbid — cùng một note).">
              <input type="checkbox" checked={onlyNoted} onChange={(e) => setOnlyNoted(e.target.checked)} className="h-3 w-3" />
              chỉ có note ({formatNumber(notedCount)})
            </label>
            <CopyKeywordsButton keywords={filtered.map((r) => r.keyword)} label={`Copy ${formatNumber(filtered.length)} keyword`} className="ml-auto" />
            <CopyKeywordsButton
              keywords={filtered.filter((r) => r.group === 'demand').map((r) => r.keyword)}
              label="Copy nhóm có nhu cầu"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="align-bottom">
                  <SortableTh col="keyword" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="left" className="px-2 py-1" label="Keyword" />
                  <SortableTh col="group" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="left" className="px-2 py-1" title="Nhóm bằng chứng: có nhu cầu → tín hiệu yếu → không có gì" label="Nhóm" />
                  <SortableTh col="organic" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" title="Người tìm thấy app qua kết quả tự nhiên (không phải quảng cáo) và bấm vào listing, rồi bao nhiêu người trong đó cài. Có organic mà paid không hiện = đang thua đấu giá.">
                    Organic {report.historyWindow}
                    <div className="text-[9px] font-normal text-slate-400">users · install, không qua ads</div>
                  </SortableTh>
                  <SortableTh col="paid" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" title={`Người bấm vào quảng cáo của keyword này trong ${report.historyWindow}, và bao nhiêu người cài. Có số ở đây mà ${win} = 0 nghĩa là từng hiện rồi mất.`}>
                    Paid {report.historyWindow}
                    <div className="text-[9px] font-normal text-slate-400">users · install qua ads, cả năm</div>
                  </SortableTh>
                  <SortableTh col="impressions" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1 text-slate-500" title="Từ file export Shopify Ads (tab Search_Term_Unbidded): quảng cáo của keyword này hiện ra bao nhiêu lần và được bấm bao nhiêu lần. GA4 không thấy lượt hiện, chỉ export mới có. Trống = export không có keyword này.">
                    Export Shopify Ads
                    <div className="text-[9px] font-normal text-slate-400">lượt hiện · click</div>
                  </SortableTh>
                  <SortableTh col="value" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" title="Net value một install của keyword = (doanh thu − phí Shopify) ÷ install, tab 'Net value per install' (YTD, mọi nước, mọi kênh). Dòng nhỏ: tổng net value · install · shop trả tiền. 'mỏng' = dưới 3 shop trả tiền, chưa nên bid theo. Trống = keyword chưa có install nào truy được.">
                    Value
                    <div className="text-[9px] font-normal text-slate-400">$/install · tổng · shop</div>
                  </SortableTh>
                  <SortableTh col="bid" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="px-2 py-1" title="Bid max đang đặt cho keyword này. Keyword nằm ở nhiều camp thì mỗi camp một bid, nên ghi cao nhất – thấp nhất.">
                    Bid đang đặt
                    <div className="text-[9px] font-normal text-slate-400">cao nhất – thấp nhất</div>
                  </SortableTh>
                  <SortableTh col="camps" sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="left" className="border-l border-slate-200 px-2 py-1" title="Camp chưa tắt đang chứa keyword, kèm bid ở camp đó. Bấm +N để xem các camp còn lại. Sắp theo số camp.">
                    Camp đang bid
                    <div className="text-[9px] font-normal text-slate-400">tên camp · bid ở camp đó</div>
                  </SortableTh>
                  <th className="px-2 py-1 text-left font-medium" title="Ghi chú theo keyword, lưu vào App_Notes. Cùng một note với cột Ghi chú ở tab Underbid và trend sheet: ghi ở đâu cũng thấy ở mọi nơi.">
                    Ghi chú
                    <div className="text-[9px] font-normal text-slate-400">chung với Underbid</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.keyword} className="border-t hover:bg-slate-50">
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <KeywordLink keyword={r.keyword} surface="paid" className="font-medium text-slate-800" />
                        {categoryChoice === ALL && <span className="rounded bg-slate-100 px-1 text-[9px] text-slate-500">{r.category}</span>}
                        {r.negative && (
                          <span className="rounded bg-rose-50 px-1 text-[9px] text-rose-700 ring-1 ring-rose-200" title="Đang nằm trong Negative KW list mà vẫn bid — mâu thuẫn">
                            negative
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium ring-1', GROUP_META[r.group].tone)} title={GROUP_META[r.group].action}>
                        {GROUP_META[r.group].label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                      {r.organicUsers > 0 ? (
                        <>
                          {formatNumber(r.organicUsers)} users · {formatNumber(r.organicInstalls)} install
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                      {r.paidUsers > 0 ? (
                        <>
                          {formatNumber(r.paidUsers)} users · {formatNumber(r.paidInstalls)} install
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-slate-500">
                      {r.exportImpressions > 0 ? (
                        <>
                          {formatNumber(r.exportImpressions)} hiện · {formatNumber(r.exportClicks)} click
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                      {(() => {
                        const nv = nvOf(r.keyword);
                        if (!nv || nv.netPerInstall === null) return <span className="text-slate-300">—</span>;
                        return (
                          <div className="leading-tight" title={`$${Math.round(nv.netValue).toLocaleString()} net từ ${nv.installs} install, ${nv.payingShops} shop trả tiền${nv.thin ? ` — ${nv.thinReason}` : ''}`}>
                            <span className={nv.thin ? 'text-amber-700' : 'font-medium text-slate-800'}>
                              ${nv.netPerInstall.toFixed(0)}
                              {nv.thin && <span className="ml-0.5 text-[9px]">mỏng</span>}
                            </span>
                            <div className="text-[9px] text-slate-400">
                              ${Math.round(nv.netValue).toLocaleString()} · {nv.installs}i · {nv.payingShops}s
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                      {r.bidMax !== null && r.bidMin !== null && r.bidMax !== r.bidMin ? `${money(r.bidMax)} – ${money(r.bidMin)}` : money(r.bidMax)}
                    </td>
                    <td className="border-l border-slate-200 px-2 py-1">
                      <KeywordCampsList camps={r.camps} pinned={readPinnedCamps(notes, r.keyword)} onTogglePin={(camp) => togglePin(r.keyword, camp)} />
                    </td>
                    <NoteCell
                      scope={KEYWORD_NOTE_SCOPE}
                      noteId={keywordNoteKeys(r.keyword).id}
                      fallbackKeys={keywordNoteKeys(r.keyword).legacy}
                      className="px-2 py-1 align-top"
                      extra={<KeywordCountryNotes keyword={r.keyword} />}
                    />
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2 py-3 text-center text-[11px] text-slate-500">
                      Không có keyword nào khớp bộ lọc — bật thêm nhóm hoặc xoá ô tìm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > shown.length && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 200)}
              className="w-full rounded border border-slate-200 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Hiện thêm ({formatNumber(filtered.length - shown.length)} dòng nữa)
            </button>
          )}
          <p className="text-[10px] leading-relaxed text-slate-400">
            <b>Đọc cột:</b> Ghi chú là note theo keyword, cùng một ô với tab Underbid và trend sheet — ghi &ldquo;đã tăng
            bid lên $X ngày …&rdquo; ở đây thì Underbid thấy ngay, và Impact bid ở đó đo từ mốc này. Hai cột Organic / Paid là lịch sử cả năm của keyword, để biết có ai tìm không; cột Export
            là lượt quảng cáo hiện ra theo file export Shopify (GA4 không đo được lượt hiện); Value là net value một
            install keyword từng mang về (tab Net value per install, YTD) — keyword có nhu cầu mà $/install cao là chỗ
            tăng bid trước; Bid là bid max đang đặt,
            keyword ở nhiều camp thì ghi cao nhất – thấp nhất. Không có users paid ≠ không có impression: GA4 chỉ thấy keyword khi có người bấm vào listing. Keyword hiện
            ra mà không ai bấm sẽ chỉ có ở cột Export (khi export Shopify có nó). Nhóm chia theo{' '}
            {report.historyWindow}; đổi {win} chỉ đổi điều kiện &ldquo;0 users paid&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}
