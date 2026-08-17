'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Search, X } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { buildInstallOrigin, type InstallOriginRow } from '@/lib/market/installOrigin';
import { useKeywordTrendStore } from '@/lib/store/keywordTrendStore';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// "Install này đến từ keyword nào, nước nào, vị trí mấy, camp nào, bid bao nhiêu".
//
// The whole point of the screen is one row = one answer, so the columns are the
// question restated. The two things it cannot answer honestly — which campaign
// of several served a country, and how many installs GA4 withheld — are stated
// on the row and in the header rather than hidden behind an average.

type SortKey = 'installs' | 'users' | 'cr' | 'position' | 'bid' | 'keyword' | 'country';

/** Which slice of the table the headline cards are focusing. */
type Lens = 'all' | 'with-installs' | 'ambiguous' | 'negative';

/**
 * A headline number that is also the control for it.
 *
 * The four numbers already describe subsets of the same table, so making them
 * inert and adding separate filters would mean maintaining two vocabularies for
 * one idea. Clicking a card narrows the table to exactly what the card counts;
 * clicking the active one clears it.
 */
function StatCard({
  label,
  value,
  sub,
  tone,
  lens,
  active,
  onPick,
  title,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone?: string;
  lens?: Lens;
  active?: boolean;
  onPick?: (l: Lens) => void;
  title?: string;
}) {
  const clickable = !!lens && !!onPick;
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      {...(clickable
        ? { type: 'button' as const, onClick: () => onPick!(active ? 'all' : lens!) }
        : {})}
      title={title ?? (clickable ? 'Bấm để lọc bảng theo con số này' : undefined)}
      className={cn(
        'rounded border p-2 text-left transition',
        active
          ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-300'
          : 'border-slate-200 bg-white',
        clickable && !active && 'hover:border-slate-400 hover:bg-slate-50',
      )}
    >
      <div className="flex items-baseline gap-1">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        {active && <span className="text-[9px] font-semibold text-indigo-600">đang lọc</span>}
      </div>
      <div className={cn('text-lg font-semibold', tone ?? 'text-slate-900')}>{value}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </Tag>
  );
}

function SortHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'right',
  title,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  title?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={cn(
        'whitespace-nowrap px-2 py-2 font-medium',
        align === 'left' ? 'text-left' : 'text-right',
      )}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn('inline-flex items-center gap-1', active ? 'text-slate-900' : 'hover:text-slate-900')}
      >
        {label}
        <span className="text-[9px] text-slate-400">{active ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}</span>
      </button>
    </th>
  );
}

const LENS_LABEL: Record<Lens, string> = {
  all: 'Tất cả',
  'with-installs': 'Chỉ cặp có install',
  ambiguous: 'Chưa rõ camp',
  negative: 'Đang là negative',
};

/** Position is the only column where a small number is the good one. */
function posTone(pos: number | null): string {
  if (pos === null) return 'text-slate-300';
  if (pos <= 2) return 'text-emerald-700 font-semibold';
  if (pos <= 5) return 'text-slate-800';
  return 'text-amber-700';
}

function CampCell({ row }: { row: InstallOriginRow }) {
  const [open, setOpen] = useState(false);
  if (row.campUnknown) {
    return (
      <span
        className="cursor-help text-[11px] text-slate-400"
        title="Keyword này không có dòng nào trong Master KW Lookup, nên không biết nó thuộc camp nào."
      >
        không có trong Master KW
      </span>
    );
  }
  if (row.camps.length === 0) {
    return (
      <span
        className="cursor-help text-[11px] text-amber-700"
        title={`Mọi camp bid keyword này đều nằm trong Paused_camp: ${row.pausedCamps
          .map((c) => c.camp)
          .join(', ')}. Install vẫn về nên nhiều khả năng camp mới tắt trong kỳ.`}
      >
        chỉ còn camp đã tắt
      </span>
    );
  }
  const first = row.camps[0];
  const rest = row.camps.slice(1);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1">
        {first.url ? (
          <a
            href={first.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-baseline gap-1 whitespace-nowrap text-[11px] font-medium text-indigo-600 hover:underline"
          >
            {first.camp}
            <ExternalLink className="h-2.5 w-2.5 shrink-0 self-center" />
          </a>
        ) : (
          <span className="whitespace-nowrap text-[11px] font-medium text-slate-800">{first.camp}</span>
        )}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-800 hover:bg-amber-200"
            title="Keyword này nằm trong nhiều camp đang chạy. Camp_Links chưa có cột Geo nên không xác định được camp nào phục vụ nước này — đây là tất cả ứng viên."
          >
            +{rest.length} camp khác
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-slate-200 pl-2">
          {rest.map((c) => (
            <li key={c.camp} className="flex items-baseline gap-1.5">
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap text-[10px] text-indigo-600 hover:underline"
                >
                  {c.camp}
                </a>
              ) : (
                <span className="whitespace-nowrap text-[10px] text-slate-600">{c.camp}</span>
              )}
              {c.bidMax !== null && (
                <span className="font-mono text-[9px] text-slate-400">${c.bidMax.toFixed(2)}</span>
              )}
            </li>
          ))}
          {row.pausedCamps.map((c) => (
            <li key={c.camp} className="flex items-baseline gap-1.5 text-slate-400">
              <span className="whitespace-nowrap text-[10px] line-through">{c.camp}</span>
              <span className="text-[9px]">đã tắt</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InstallOriginView() {
  const { data, isLoading, error } = useSheetData();
  const report = useMemo(() => buildInstallOrigin(data), [data]);
  const openKeyword = useKeywordTrendStore((s) => s.openKeyword);

  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [lens, setLens] = useState<Lens>('all');
  const [sortKey, setSortKey] = useState<SortKey>('installs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(k);
      // Position sorts ascending first: rank 1 is the interesting end.
      setSortDir(k === 'keyword' || k === 'country' || k === 'position' ? 'asc' : 'desc');
    }
  };

  const countries = useMemo(() => {
    if (!report) return [];
    const m = new Map<string, number>();
    report.rows.forEach((r) => m.set(r.country, (m.get(r.country) ?? 0) + r.installs));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [report]);

  const rows = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    const out = report.rows.filter((r) => {
      if (lens === 'with-installs' && r.installs <= 0) return false;
      if (lens === 'ambiguous' && !r.campAmbiguous) return false;
      if (lens === 'negative' && !r.negative) return false;
      if (countryFilter !== 'all' && r.country !== countryFilter) return false;
      if (!q) return true;
      return (
        r.keyword.toLowerCase().includes(q) ||
        r.country.toLowerCase().includes(q) ||
        r.camps.some((c) => c.camp.toLowerCase().includes(q))
      );
    });
    const dir = sortDir === 'desc' ? -1 : 1;
    const val = (r: InstallOriginRow): number | string => {
      switch (sortKey) {
        case 'users': return r.users;
        case 'cr': return r.cr ?? -1;
        case 'position': return r.position ?? 999;
        case 'bid': return r.bidMax ?? -1;
        case 'keyword': return r.keyword.toLowerCase();
        case 'country': return r.country.toLowerCase();
        default: return r.installs;
      }
    };
    return [...out].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (typeof x === 'string' || typeof y === 'string') return dir * String(x).localeCompare(String(y));
      return dir * (x - y);
    });
  }, [report, search, countryFilter, lens, sortKey, sortDir]);

  if (error) {
    return <div className="py-10 text-center text-sm text-rose-600">{(error as Error).message}</div>;
  }
  if (isLoading) return <Skeleton className="h-72" />;
  if (!report) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        Chưa có dòng paid nào ở mức <b>keyword × nước</b> kèm install trong <code>Country_L30</code>.
      </div>
    );
  }

  const covered =
    report.installsAllGrain > 0 ? report.installs / report.installsAllGrain : null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[11px] leading-snug text-slate-600">
          Mỗi dòng là một <b>install paid</b> đã truy được nguồn: keyword nào, nước nào, ở <b>vị trí</b> mấy, từ{' '}
          <b>camp</b> nào, với <b>bid</b> bao nhiêu. Ghép từ <code className="text-[10px]">Country_L30</code> (keyword ×
          nước × vị trí × install) với <code className="text-[10px]">Master KW Lookup</code> (keyword → camp + max bid).
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          <StatCard
            label="Install truy được"
            value={report.installs}
            sub={
              covered === null
                ? `${report.rows.length} dòng`
                : `${formatPercent(covered)} của ${report.installsAllGrain} install paid (L30)`
            }
            lens="with-installs"
            active={lens === 'with-installs'}
            onPick={setLens}
            title="Bấm để chỉ hiện những cặp keyword × nước thực sự có install"
          />
          <StatCard
            label="Keyword × nước"
            value={
              <>
                {report.keywords}
                <span className="text-xs font-normal text-slate-400"> × {report.countries}</span>
              </>
            }
            sub={`${report.rows.length} cặp có install`}
            lens="all"
            active={lens === 'all'}
            onPick={setLens}
            title="Bấm để bỏ mọi bộ lọc theo nhóm"
          />
          <StatCard
            label="Chưa rõ camp"
            value={report.ambiguousRows}
            sub="keyword nằm ở nhiều camp đang chạy"
            tone="text-amber-700"
            lens="ambiguous"
            active={lens === 'ambiguous'}
            onPick={setLens}
            title="Bấm để chỉ hiện những dòng chưa quy được về một camp"
          />
          <StatCard
            label="Đang là negative"
            value={report.negativeRows}
            sub={
              report.negativeInstalls > 0
                ? `${report.negativeInstalls} install từ cụm đáng lẽ bị loại`
                : 'cặp keyword × nước'
            }
            tone={report.negativeRows > 0 ? 'text-rose-600' : undefined}
            lens="negative"
            active={lens === 'negative'}
            onPick={setLens}
            title="Bấm để chỉ hiện cụm nằm trong Negative KW list mà vẫn có traffic paid"
          />
          <StatCard label="Kỳ" value={<span className="text-[12px]">{report.window}</span>} sub="theo tab Country_L30" />
        </div>
        {covered !== null && covered < 0.95 && (
          <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
            Bảng này <b>không phải toàn bộ install</b>. GA4 giấu bớt hàng ở mức chi tiết: cùng kỳ L30 có{' '}
            <b>{report.installsAllGrain}</b> install paid ở mức keyword (không tách nước), nhưng chỉ{' '}
            <b>{report.installs}</b> trong số đó được GA4 cho biết thuộc nước nào. Phần chênh không mất đi — chỉ là
            không truy được nguồn tới mức này.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <div className="relative min-w-[150px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm keyword / nước / camp…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">Mọi nước ({report.countries})</option>
          {countries.map(([c, n]) => (
            <option key={c} value={c}>
              {c} ({n})
            </option>
          ))}
        </select>
        {lens !== 'all' && (
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-2 text-[11px] font-medium text-indigo-700">
            {LENS_LABEL[lens]}
            <button type="button" onClick={() => setLens('all')} className="text-indigo-500 hover:text-indigo-800">
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        {(search || countryFilter !== 'all' || lens !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              setSearch('');
              setCountryFilter('all');
              setLens('all');
            }}
          >
            <X className="h-3 w-3" />
            Reset
          </Button>
        )}
        <span className="ml-auto text-[11px] text-slate-500">{rows.length} dòng</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
            <tr>
              <SortHead label="Keyword" col="keyword" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <SortHead label="Nước" col="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <SortHead label="Vị trí" col="position" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Vị trí trung bình của quảng cáo — nhỏ hơn là tốt hơn" />
              <SortHead label="Users" col="users" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="Install" col="installs" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="CR" col="cr" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="Bid" col="bid" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Max bid đang set cho keyword này trong camp — từ Master KW Lookup" />
              <th className="whitespace-nowrap px-2 py-2 text-left font-medium">Campaign</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.keyword}||${r.country}`} className="border-t border-slate-100 align-top hover:bg-slate-50">
                <td className="whitespace-nowrap px-2 py-2">
                  <button
                    type="button"
                    onClick={() => openKeyword(r.keyword, { country: r.country, surface: 'paid' })}
                    className="text-[12px] font-medium text-indigo-600 hover:underline"
                  >
                    {r.keyword}
                  </button>
                  <div className="text-[9px] text-slate-400">
                    {r.category}
                    {r.negative && (
                      <span
                        className="ml-1 rounded bg-rose-100 px-1 font-semibold text-rose-700"
                        title="Cụm này nằm trong Negative KW list nhưng vẫn nhận traffic paid trong kỳ. Hoặc negative chưa được áp ở mọi camp, hoặc nó mới được thêm sau khi những lượt hiển thị này đã chạy."
                      >
                        negative
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-[11px] text-slate-700">{r.country}</td>
                <td className={cn('whitespace-nowrap px-2 py-2 text-right font-mono text-[11px]', posTone(r.position))}>
                  {r.position === null ? '—' : r.position.toFixed(1)}
                  {r.positionPrev !== null && r.position !== null && r.positionPrev !== r.position && (
                    <div
                      className={cn(
                        'text-[9px] font-normal',
                        r.position < r.positionPrev ? 'text-emerald-600' : 'text-amber-600',
                      )}
                      title={`Kỳ trước: ${r.positionPrev.toFixed(1)}`}
                    >
                      {r.position < r.positionPrev ? '▲' : '▼'} {r.positionPrev.toFixed(1)}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[11px] text-slate-600">
                  {formatNumber(r.users)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[12px] font-semibold text-slate-900">
                  {r.installs}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[11px] text-slate-600">
                  {r.cr === null ? '—' : formatPercent(r.cr)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[11px] text-slate-800">
                  {r.bidMax === null ? (
                    '—'
                  ) : r.bidMin !== null && r.bidMin !== r.bidMax ? (
                    <span
                      className="cursor-help"
                      title={`Các camp ứng viên đang set bid khác nhau: $${r.bidMin.toFixed(2)} – $${r.bidMax.toFixed(2)}. Chưa xác định được camp nào phục vụ nước này.`}
                    >
                      ${r.bidMin.toFixed(2)}–{r.bidMax.toFixed(2)}
                    </span>
                  ) : (
                    `$${r.bidMax.toFixed(2)}`
                  )}
                </td>
                <td className="max-w-[22rem] px-2 py-2">
                  <CampCell row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-snug text-slate-500">
        <div>
          <b>Vị trí</b> và <b>CR</b> lấy nguyên từ GA4 ở mức keyword × nước, không tính lại. <b>Bid</b> là max bid đang
          set trong Master KW Lookup, không phải giá thực trả cho lượt click.
        </div>
        {report.negativeRows > 0 && (
          <div className="text-rose-700">
            <b>{report.negativeRows} cặp keyword × nước</b> có cụm nằm trong{' '}
            <code className="text-[9px]">Negative KW list</code> mà vẫn nhận traffic paid trong kỳ này. Negative áp
            theo từng camp, nên hoặc nó chưa được thêm ở mọi camp, hoặc mới thêm sau khi những lượt này đã chạy — cần
            đối chiếu ngày thêm negative trước khi kết luận.
          </div>
        )}
        <div>
          Khi một keyword nằm ở nhiều camp đang chạy, bảng liệt kê <b>tất cả ứng viên</b> thay vì chọn bừa một camp:{' '}
          <code className="text-[9px]">Camp_Links</code> chưa điền cột Geo nên không có cách nào xác định camp nào phục
          vụ nước nào. Điền cột Geo là cách duy nhất để cột Campaign trở thành một đáp án duy nhất.
        </div>
      </div>
    </div>
  );
}
