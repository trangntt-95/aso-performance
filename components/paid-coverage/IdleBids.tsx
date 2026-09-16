'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, EyeOff, ExternalLink } from 'lucide-react';
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
import { cn } from '@/lib/utils';

// Keyword đang bid mà không ai bấm — mặt trái của bảng chính. Xem
// lib/market/idleBids.ts cho lý do chia ba nhóm.
//
// Mặc định lọc Competitor vì đó là câu hỏi mở ra bảng này (920/945 keyword
// Competitor không có users paid L90, 16/09/2026), và vì Language/Test có
// hàng nghìn keyword chết đã biết — mở mặc định "tất cả" thì 8.000 dòng che
// mất 50 dòng đáng làm.

const ALL = '__all__';
const DEFAULT_CATEGORY = 'Competitor';

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

type Sort = 'signal' | 'bid' | 'impressions' | 'camps';
const SORTS: { id: Sort; label: string; hint: string }[] = [
  { id: 'signal', label: 'Bằng chứng', hint: 'Install paid, users organic, users paid, impression — gộp lại' },
  { id: 'bid', label: 'Bid', hint: 'Bid cao nhất đang đặt — nhìn ra bid lạc như $53' },
  { id: 'impressions', label: 'Hiển thị', hint: 'Impression trong export Shopify Ads' },
  { id: 'camps', label: 'Số camp', hint: 'Keyword nằm ở nhiều camp chưa tắt' },
];

const money = (n: number | null | undefined) => (n && n > 0 ? `$${n.toFixed(2)}` : '—');

function CampCell({ row }: { row: IdleBidRow }) {
  const [open, setOpen] = useState(false);
  const first = row.camps[0];
  if (!first) return <span className="text-slate-400">—</span>;
  const rest = row.camps.slice(1);
  const Name = ({ camp, url, bidMax }: { camp: string; url?: string; bidMax: number | null }) => (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-baseline gap-1 text-[11px] text-indigo-600 hover:underline">
          {camp}
          <ExternalLink className="h-2.5 w-2.5 shrink-0 self-center" />
        </a>
      ) : (
        <span className="text-[11px] text-slate-700">{camp}</span>
      )}
      <span className="text-[10px] text-slate-400">{money(bidMax)}</span>
    </span>
  );
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1">
        <Name camp={first.camp} url={first.url} bidMax={first.bidMax} />
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-600 hover:bg-slate-200"
            title={rest.map((c) => c.camp).join('\n')}
          >
            +{rest.length}
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-slate-200 pl-2">
          {rest.map((c) => (
            <li key={c.camp}>
              <Name camp={c.camp} url={c.url} bidMax={c.bidMax} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IdleBids() {
  const { data } = useSheetData();
  const [open, setOpen] = useState(true);
  const [win, setWin] = useState<IdleWindow>('L90');
  const [category, setCategory] = useState<string | null>(null); // null = chưa chọn → mặc định
  const [groups, setGroups] = useState<Set<IdleGroup>>(() => new Set<IdleGroup>(['demand', 'weak']));
  const [sort, setSort] = useState<Sort>('signal');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);

  const report = useMemo(() => buildIdleBidsReport(data, win), [data, win]);
  const winRange = data?.windowDates?.[win];

  const categoryChoice = useMemo(() => {
    if (!report) return ALL;
    if (category !== null) return category;
    return report.categories.some((c) => c.category === DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : ALL;
  }, [report, category]);

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
      if (query.empty) return true;
      return matchKeywordQuery(`${r.keyword} ${r.camps.map((c) => c.camp).join(' ')}`, query);
    });
    const key = (r: IdleBidRow): number => {
      switch (sort) {
        case 'signal':
          return signalOf(r);
        case 'bid':
          return r.bidMax ?? 0;
        case 'impressions':
          return r.exportImpressions;
        case 'camps':
          return r.camps.length;
      }
    };
    const order: Record<IdleGroup, number> = { demand: 0, weak: 1, none: 2 };
    return [...list].sort((a, b) => order[a.group] - order[b.group] || key(b) - key(a) || a.keyword.localeCompare(b.keyword));
  }, [inCategory, groups, q, sort]);
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

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
            <KeywordSearchBox value={q} onChange={setQ} placeholder="Tìm keyword / camp — vd: profit -whale" />
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
                  <th className="px-2 py-1 text-left font-medium">Keyword</th>
                  <th className="px-2 py-1 text-left font-medium">Nhóm</th>
                  <th className="px-2 py-1 text-right font-medium" title="Người tìm thấy app qua kết quả tự nhiên (không phải quảng cáo) và bấm vào listing, rồi bao nhiêu người trong đó cài. Có organic mà paid không hiện = đang thua đấu giá.">
                    Organic {report.historyWindow}
                    <div className="text-[9px] font-normal text-slate-400">users · install, không qua ads</div>
                  </th>
                  <th className="px-2 py-1 text-right font-medium" title={`Người bấm vào quảng cáo của keyword này trong ${report.historyWindow}, và bao nhiêu người cài. Có số ở đây mà ${win} = 0 nghĩa là từng hiện rồi mất.`}>
                    Paid {report.historyWindow}
                    <div className="text-[9px] font-normal text-slate-400">users · install qua ads, cả năm</div>
                  </th>
                  <th className="px-2 py-1 text-right font-medium text-slate-500" title="Từ file export Shopify Ads (tab Search_Term_Unbidded): quảng cáo của keyword này hiện ra bao nhiêu lần và được bấm bao nhiêu lần. GA4 không thấy lượt hiện, chỉ export mới có. Trống = export không có keyword này.">
                    Export Shopify Ads
                    <div className="text-[9px] font-normal text-slate-400">lượt hiện · click</div>
                  </th>
                  <th className="px-2 py-1 text-right font-medium" title="Bid max đang đặt cho keyword này. Keyword nằm ở nhiều camp thì mỗi camp một bid, nên ghi cao nhất – thấp nhất.">
                    Bid đang đặt
                    <div className="text-[9px] font-normal text-slate-400">cao nhất – thấp nhất</div>
                  </th>
                  <th className="border-l border-slate-200 px-2 py-1 text-left font-medium" title="Camp chưa tắt đang chứa keyword, kèm bid ở camp đó. Bấm +N để xem các camp còn lại.">
                    Camp đang bid
                    <div className="text-[9px] font-normal text-slate-400">tên camp · bid ở camp đó</div>
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
                    <td className="px-2 py-1">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium ring-1', GROUP_META[r.group].tone)} title={GROUP_META[r.group].action}>
                        {GROUP_META[r.group].label}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.organicUsers > 0 ? (
                        <>
                          {formatNumber(r.organicUsers)} users · {formatNumber(r.organicInstalls)} install
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.paidUsers > 0 ? (
                        <>
                          {formatNumber(r.paidUsers)} users · {formatNumber(r.paidInstalls)} install
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-500">
                      {r.exportImpressions > 0 ? (
                        <>
                          {formatNumber(r.exportImpressions)} hiện · {formatNumber(r.exportClicks)} click
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.bidMax !== null && r.bidMin !== null && r.bidMax !== r.bidMin ? `${money(r.bidMax)} – ${money(r.bidMin)}` : money(r.bidMax)}
                    </td>
                    <td className="border-l border-slate-200 px-2 py-1">
                      <CampCell row={r} />
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-center text-[11px] text-slate-500">
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
            <b>Đọc cột:</b> hai cột Organic / Paid là lịch sử cả năm của keyword, để biết có ai tìm không; cột Export
            là lượt quảng cáo hiện ra theo file export Shopify (GA4 không đo được lượt hiện); Bid là bid max đang đặt,
            keyword ở nhiều camp thì ghi cao nhất – thấp nhất. Không có users paid ≠ không có impression: GA4 chỉ thấy keyword khi có người bấm vào listing. Keyword hiện
            ra mà không ai bấm sẽ chỉ có ở cột Export (khi export Shopify có nó). Nhóm chia theo{' '}
            {report.historyWindow}; đổi {win} chỉ đổi điều kiện &ldquo;0 users paid&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}
