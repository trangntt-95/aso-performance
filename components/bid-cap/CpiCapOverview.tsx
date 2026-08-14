'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildCpiCapOverview, type CapVerdict, type CountryCapRow } from '@/lib/market/cpiCapOverview';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Overview of PerGeo_CPI_Cap — the ceiling we set per country, put next to what
// each country actually cost. Sits above the detail table because the detail
// table answers "what bid for this cell?" while this answers the prior
// question: "is the ceiling this cell is derived from being respected at all?"
//
// Deliberately restrained on colour: over-cap is the only red, everything else
// is slate, so the eye lands on the few countries that need a decision.

const money = (n: number) => `$${formatNumber(Math.round(n))}`;
const money2 = (n: number) => `$${n.toFixed(2)}`;

const VERDICT_LABEL: Record<CapVerdict, string> = {
  over: 'Vượt trần',
  under: 'Trong trần',
  'spending-no-install': 'Tiêu, 0 install',
  'traffic-only': 'Có click, chưa tốn',
  idle: 'Chưa chạy',
};

const VERDICT_CLS: Record<CapVerdict, string> = {
  over: 'bg-rose-50 text-rose-700 border-rose-200',
  under: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'spending-no-install': 'bg-rose-50 text-rose-700 border-rose-200',
  'traffic-only': 'bg-slate-50 text-slate-600 border-slate-200',
  idle: 'bg-slate-50 text-slate-400 border-slate-200',
};

type Lens = 'all' | 'over' | 'tier1' | 'silent' | 'idle';

const LENS_LABEL: Record<Lens, string> = {
  all: 'Tất cả nước có cấu hình',
  over: 'Đang vượt trần CPI',
  tier1: 'Tier 1',
  silent: 'Rank cao nhưng chưa có install',
  idle: 'Chưa tiêu đồng nào',
};

/** Horizontal bar: measured CPI against its ceiling, one row per country. */
function CapBar({ row, maxScale }: { row: CountryCapRow; maxScale: number }) {
  const capPct = maxScale > 0 ? (row.cap / maxScale) * 100 : 0;
  const cpiPct = row.cpi !== null && maxScale > 0 ? Math.min((row.cpi / maxScale) * 100, 100) : 0;
  const over = row.verdict === 'over';
  return (
    <div className="relative h-4 w-full rounded bg-slate-100">
      {/* measured CPI */}
      {row.cpi !== null && (
        <div
          className={cn('absolute inset-y-0 left-0 rounded', over ? 'bg-rose-400' : 'bg-emerald-400')}
          style={{ width: `${cpiPct}%` }}
        />
      )}
      {/* the ceiling itself */}
      <div
        className="absolute inset-y-0 w-[2px] bg-slate-700"
        style={{ left: `${Math.min(capPct, 100)}%` }}
        title={`Trần ${money(row.cap)}`}
      />
    </div>
  );
}

export function CpiCapOverview() {
  const { data, isLoading } = useSheetData();
  const overview = useMemo(() => buildCpiCapOverview(data ?? null), [data]);
  const [lens, setLens] = useState<Lens>('over');
  const [open, setOpen] = useState(true);

  const rows = useMemo(() => {
    if (!overview) return [];
    const r = overview.rows;
    switch (lens) {
      case 'over':
        return r.filter((x) => x.verdict === 'over' || x.verdict === 'spending-no-install');
      case 'tier1':
        return r.filter((x) => x.tier1);
      case 'silent':
        return r.filter((x) => x.rank !== null && x.rank <= 20 && x.installs === 0);
      case 'idle':
        return r.filter((x) => x.spend === 0);
      default:
        return r;
    }
  }, [overview, lens]);

  if (isLoading || !overview || overview.rows.length === 0) return null;
  const t = overview.totals;

  // Scale the bars off the biggest number in view so a $60 cap doesn't squash
  // the $8 ones into invisibility — but never below the largest cap on screen.
  const maxScale = Math.max(
    ...rows.map((r) => Math.max(r.cap, r.cpi ?? 0)),
    1,
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold text-slate-800">Trần CPI theo nước · tổng quan</span>
        <span className="text-[10px] text-slate-500 hidden sm:inline">
          — {t.configured} nước có trần, {t.withSpend} nước thực sự tiêu tiền trong L30
        </span>
        <ChevronDown className={cn('ml-auto h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3">
          {/* Headline numbers. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded border border-slate-200 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Vượt trần</div>
              <div className="text-lg font-semibold text-rose-600">{t.overCount}</div>
              <div className="text-[10px] text-slate-500">trên {t.withInstalls} nước có install</div>
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Chi vượt trần</div>
              <div className="text-lg font-semibold text-rose-600">{money(t.overspend)}</div>
              <div className="text-[10px] text-slate-500">
                trên {money(t.spend)} tổng chi ({t.spend > 0 ? Math.round((t.overspend / t.spend) * 100) : 0}%)
              </div>
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">CPI trung bình</div>
              <div className="text-lg font-semibold text-slate-800">{t.cpi === null ? '—' : money2(t.cpi)}</div>
              <div className="text-[10px] text-slate-500">{t.installs} install / L30</div>
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Tier 1 im lặng</div>
              <div className="text-lg font-semibold text-slate-800">
                {t.tier1Silent}
                <span className="text-xs font-normal text-slate-400">/{t.tier1}</span>
              </div>
              <div className="text-[10px] text-slate-500">chưa có install nào</div>
            </div>
          </div>

          {/* One dropdown, no colour-coded filter chips. */}
          <div className="flex items-center gap-2">
            <select
              value={lens}
              onChange={(e) => setLens(e.target.value as Lens)}
              className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {(Object.keys(LENS_LABEL) as Lens[]).map((k) => (
                <option key={k} value={k}>
                  {LENS_LABEL[k]}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500">{rows.length} nước</span>
          </div>

          {rows.length === 0 ? (
            <div className="rounded border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
              Không có nước nào ở nhóm này.
            </div>
          ) : (
            <div className="max-h-[46vh] overflow-auto rounded border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
                  <tr>
                    <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Rank</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Nước</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Trần</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CPI thực</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">CPI vs trần</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Chi</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Install</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Click</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Vượt</th>
                    <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.country} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-slate-400">
                        {r.rank ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className="font-medium text-slate-800">{r.country}</span>
                        {r.tier1 && (
                          <span
                            className="ml-1.5 rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-600"
                            title="Tier 1 Market trong PerGeo_CPI_Cap"
                          >
                            T1
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                        {r.cap > 0 ? money(r.cap) : '—'}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-semibold',
                          r.verdict === 'over' ? 'text-rose-600' : 'text-slate-800',
                        )}
                      >
                        {r.cpi === null ? '—' : money2(r.cpi)}
                        {r.cpi !== null && !r.cpiReliable && (
                          <span
                            className="ml-1 text-[9px] font-normal text-slate-400"
                            title={`Chỉ ${r.installs} install — một lần rơi vào camp đắt là số này lệch hẳn. Đọc như một mẫu, không phải một tỷ lệ.`}
                          >
                            ({r.installs}★)
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="w-28 min-w-[6rem]">
                          <CapBar row={r} maxScale={maxScale} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                        {r.spend > 0 ? money(r.spend) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-800">
                        {r.installs || '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
                        {r.clicks || '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-rose-600">
                        {r.overspend > 0 ? money(r.overspend) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span
                          className={cn(
                            'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                            VERDICT_CLS[r.verdict],
                          )}
                        >
                          {VERDICT_LABEL[r.verdict]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1 text-[10px] leading-snug text-slate-500">
            <div>
              Thanh <b>CPI vs trần</b>: vạch đen là trần đặt trong <code className="text-[9px]">PerGeo_CPI_Cap</code>,
              thanh màu là CPI thực đo từ <code className="text-[9px]">Max bid cap</code> (spend ÷ install, L30). Dấu{' '}
              <b>★</b> nghĩa là dưới 3 install — số đó là một mẫu, chưa đủ để coi là tỷ lệ.
            </div>
            <div>
              <b>Chi vượt trần</b> = phần tiền trả thêm so với việc mua đúng số install đó ở đúng mức trần. Nước
              &ldquo;tiêu, 0 install&rdquo; không được tính vào đây vì không có install nào để quy đổi — chỗ đó phải
              cắt, không phải hạ bid.
            </div>
            {overview.uncapped.length > 0 && (
              <div className="text-amber-700">
                {overview.uncapped.length} nước đang tiêu tiền mà{' '}
                <code className="text-[9px]">PerGeo_CPI_Cap</code> chưa đặt trần:{' '}
                {overview.uncapped
                  .slice(0, 6)
                  .map((u) => `${u.country} (${money(u.spend)})`)
                  .join(', ')}
                {overview.uncapped.length > 6 && ` …+${overview.uncapped.length - 6}`}
              </div>
            )}
            {overview.unmapped.length > 0 && (
              <div>
                {overview.unmapped.length} nước có trần nhưng không có dòng nào trong{' '}
                <code className="text-[9px]">Max bid cap</code> — chưa có camp nào chạm tới.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
