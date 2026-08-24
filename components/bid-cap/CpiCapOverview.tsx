'use client';

import { useMemo, useState } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildCpiCapOverview, type CapVerdict } from '@/lib/market/cpiCapOverview';
import {
  CapHead,
  CapSection,
  CapStat,
  CpiCell,
  GapCell,
  VerdictBadge,
  money,
  money2,
  type CapTone,
} from './capTable';

// Actual CPI vs the ceiling, per COUNTRY. Same shape as the per-category table
// below it — see capTable.tsx for why the two share their parts rather than
// being matched by eye.
//
// Columns dropped to make it readable at a glance: the bar chart of CPI against
// cap (the signed percentage says the same thing in less ink), the standalone
// clicks and value-per-install columns, and the absolute overspend. None of them
// changed a decision the CPI-vs-cap gap didn't already make, so each now sits in
// the tooltip of the cell it qualifies.

const VERDICT: Record<CapVerdict, { label: string; tone: CapTone }> = {
  over: { label: 'Vượt trần', tone: 'bad' },
  under: { label: 'Trong trần', tone: 'good' },
  'spending-no-install': { label: 'Tiêu, 0 install', tone: 'bad' },
  'traffic-only': { label: 'Có click, chưa tốn', tone: 'neutral' },
  idle: { label: 'Chưa chạy', tone: 'neutral' },
};

type Lens = 'all' | 'over' | 'cap-above-value' | 'tier1-silent' | 'idle';

const LENS_LABEL: Record<Lens, string> = {
  all: 'Tất cả nước có cấu hình',
  over: 'Đang vượt trần CPI',
  'cap-above-value': 'Trần cao hơn giá trị 1 install',
  'tier1-silent': 'Tier 1 chưa có install',
  idle: 'Chưa tiêu đồng nào',
};

export function CpiCapOverview() {
  const { data, isLoading } = useSheetData();
  const overview = useMemo(() => buildCpiCapOverview(data ?? null), [data]);
  const [lens, setLens] = useState<Lens>('over');
  const pick = (v: Lens) => setLens((cur) => (cur === v ? 'all' : v));

  const rows = useMemo(() => {
    if (!overview) return [];
    const r = overview.rows;
    switch (lens) {
      case 'over':
        return r.filter((x) => x.verdict === 'over' || x.verdict === 'spending-no-install');
      case 'cap-above-value':
        return r.filter((x) => x.capHeadroom !== null && x.capHeadroom < 0);
      case 'tier1-silent':
        return r.filter((x) => x.tier1 && x.installs === 0);
      case 'idle':
        return r.filter((x) => x.spend === 0);
      default:
        return r;
    }
  }, [overview, lens]);

  if (isLoading || !overview || overview.rows.length === 0) return null;
  const t = overview.totals;

  return (
    <CapSection
      title="1 · Nước nào đang trả quá trần CPI"
      summary={`${t.configured} nước có trần · ${t.withSpend} nước đang tiêu · ${t.overCount} vượt trần`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CapStat<Lens>
          label="Vượt trần"
          value={t.overCount}
          sub={`trên ${t.withInstalls} nước có install`}
          tone="text-rose-600"
          pick="over"
          active={lens === 'over'}
          onPick={pick}
        />
        <CapStat<Lens>
          label="Chi vượt trần"
          value={money(t.overspend)}
          sub={`trên ${money(t.spend)} tổng chi`}
          tone="text-rose-600"
          pick="over"
          active={lens === 'over'}
          onPick={pick}
        />
        <CapStat<Lens>
          label="Trần > giá trị install"
          value={t.capAboveValue}
          sub="lỗ ngay ở mức trần"
          tone="text-rose-600"
          pick="cap-above-value"
          active={lens === 'cap-above-value'}
          onPick={pick}
        />
        <CapStat<Lens>
          label="Tier 1 im lặng"
          value={
            <>
              {t.tier1Silent}
              <span className="text-xs font-normal text-slate-400">/{t.tier1}</span>
            </>
          }
          sub="chưa có install nào"
          pick="tier1-silent"
          active={lens === 'tier1-silent'}
          onPick={pick}
        />
      </div>

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
            <CapHead nameLabel="Nước" />
            <tbody>
              {rows.map((r) => {
                const over = r.verdict === 'over';
                return (
                  <tr key={r.country} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className="font-medium text-slate-800">{r.country}</span>
                      {r.rank !== null && <span className="ml-1 text-[9px] text-slate-400">#{r.rank}</span>}
                      {r.tier1 && (
                        <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-600">
                          T1
                        </span>
                      )}
                      {r.capHeadroom !== null && r.capHeadroom < 0 && (
                        <span
                          className="ml-1 cursor-help rounded bg-rose-100 px-1 text-[9px] font-medium text-rose-700"
                          title={`Trần ${money(r.cap)} cao hơn giá trị một install (${money2(r.valuePerInstall)}). Mua đúng ở mức trần vẫn lỗ — lỗi cấu hình, không phải lỗi vận hành.`}
                        >
                          trần &gt; giá trị
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-slate-800">
                      {r.spend > 0 ? money(r.spend) : '—'}
                      {r.clicks > 0 && (
                        <div className="text-[9px] font-normal text-slate-400">{r.clicks} click</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">
                      {r.installs || '—'}
                    </td>
                    <CpiCell cpi={r.cpi} over={over} />
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
                      {r.cap > 0 ? money(r.cap) : '—'}
                      {r.valuePerInstall !== null && (
                        <div
                          className="cursor-help text-[9px] text-slate-400"
                          title="Doanh thu ÷ install ở nước này. Trần phải nằm dưới con số này thì install mới tự trả được cho mình."
                        >
                          giá trị {money2(r.valuePerInstall)}
                        </div>
                      )}
                    </td>
                    <GapCell
                      gap={r.vsCapPct}
                      title={
                        r.overspend > 0
                          ? `Trả thêm ${money(r.overspend)} so với mua đúng số install đó ở mức trần.`
                          : undefined
                      }
                    />
                    <VerdictBadge
                      label={VERDICT[r.verdict].label}
                      tone={VERDICT[r.verdict].tone}
                      title={
                        r.verdict === 'spending-no-install'
                          ? 'Có chi tiêu nhưng không install nào — chỗ này phải cắt, không phải hạ bid.'
                          : undefined
                      }
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1 text-[10px] leading-snug text-slate-500">
        {overview.uncapped.length > 0 && (
          <div className="text-amber-700">
            {overview.uncapped.length} nước đang tiêu tiền mà chưa được đặt trần:{' '}
            {overview.uncapped.slice(0, 6).map((u) => `${u.country} (${money(u.spend)})`).join(', ')}
            {overview.uncapped.length > 6 && ` …+${overview.uncapped.length - 6}`}
          </div>
        )}
      </div>
    </CapSection>
  );
}
