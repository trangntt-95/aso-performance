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
  COUNTRY_CAP_COLS,
  money,
  money2,
  type CapTone,
} from './capTable';

// The CPI ceiling the bid model works to vs the one we configured, per COUNTRY.
// Same shape as the per-category table below it — see capTable.tsx for why the
// two share their parts rather than being matched by eye.
//
// This table used to read measured CPI (spend ÷ installs) against the ceiling.
// 'Max bid cap' dropped its Spend column in Aug 2026 and nothing else in the
// workbook splits spend by country, so the measurement is gone and the table now
// compares the sheet's own 'CPI cap' against the configured one. Weaker, but
// true — and every label here says which of the two it is, because "trần CPI
// sheet" and "CPI thực" support very different decisions.
//
// Columns deliberately absent: the bar chart of CPI against cap (the signed
// percentage says the same thing in less ink), standalone clicks, and the
// absolute overspend — that last one is not merely redundant now but
// uncomputable, and estimating it from installs × cap would present an allowance
// as money actually lost.

const VERDICT: Record<CapVerdict, { label: string; tone: CapTone }> = {
  over: { label: 'Trần sheet > trần đặt', tone: 'bad' },
  under: { label: 'Trong trần', tone: 'good' },
  'no-bid': { label: 'Đã dừng mua', tone: 'neutral' },
  idle: { label: 'Chưa có trong sheet', tone: 'neutral' },
};

type Lens = 'all' | 'over' | 'cap-above-value' | 'tier1-silent' | 'no-bid';

const LENS_LABEL: Record<Lens, string> = {
  all: 'Tất cả nước có cấu hình',
  over: 'Trần sheet vượt trần đã đặt',
  'cap-above-value': 'Trần cao hơn giá trị 1 install',
  'tier1-silent': 'Tier 1 chưa có install',
  'no-bid': 'Đã dừng mua / chưa có bid',
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
        return r.filter((x) => x.verdict === 'over');
      case 'cap-above-value':
        return r.filter((x) => x.capHeadroom !== null && x.capHeadroom < 0);
      case 'tier1-silent':
        return r.filter((x) => x.tier1 && x.installs === 0);
      case 'no-bid':
        return r.filter((x) => x.verdict === 'no-bid' || x.verdict === 'idle');
      default:
        return r;
    }
  }, [overview, lens]);

  if (isLoading || !overview || overview.rows.length === 0) return null;
  const t = overview.totals;

  return (
    <CapSection
      title="1 · Nước nào model bid đang được phép trả quá trần"
      summary={`${t.configured} nước có trần · ${t.withBid} nước còn bid · ${t.overCount} nước trần sheet vượt trần đã đặt`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CapStat<Lens>
          label="Trần sheet vượt trần đặt"
          value={t.overCount}
          sub={`trên ${t.withBid} nước còn bid`}
          tone="text-rose-600"
          pick="over"
          active={lens === 'over'}
          onPick={pick}
        />
        <CapStat<Lens>
          label="Lệch lớn nhất"
          value={t.worstGapPct === null ? '—' : `+${Math.round(t.worstGapPct * 100)}%`}
          sub="trần sheet so với trần đặt"
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
            <CapHead nameLabel="Nước" cols={COUNTRY_CAP_COLS} />
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
                      {r.bidRec !== null ? money2(r.bidRec) : <span className="text-slate-300">—</span>}
                      {r.clusters > 0 && (
                        <div
                          className="cursor-help text-[9px] font-normal text-slate-400"
                          title={`${r.cells} cặp category · ${r.clusters} cluster keyword${
                            r.clustersToCut > 0 ? `, trong đó ${r.clustersToCut} cluster sheet bảo cắt` : ''
                          }`}
                        >
                          {r.clusters} cluster
                          {r.clustersToCut > 0 && (
                            <span className="text-rose-500"> · {r.clustersToCut} cắt</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">
                      {r.installs || '—'}
                      {r.instL90 > 0 && (
                        <span className="text-[9px] text-slate-400" title="Inst L90">
                          {' '}
                          ({r.instL90})
                        </span>
                      )}
                    </td>
                    <CpiCell cpi={r.sheetCpiCap} over={over} />
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
                        r.vsCapPct !== null && r.vsCapPct > 0
                          ? `Model bid đang chạy theo trần ${money2(r.sheetCpiCap)} trong khi cấu hình chỉ cho ${money(r.cap)}. Đây là mức được phép trả, không phải số đã tiêu.`
                          : undefined
                      }
                    />
                    <VerdictBadge
                      label={VERDICT[r.verdict].label}
                      tone={VERDICT[r.verdict].tone}
                      title={
                        r.verdict === 'no-bid'
                          ? 'Nước này có trong Max bid cap nhưng mọi cluster đều bị đánh cắt / pause — không còn bid nào để so.'
                          : r.verdict === 'idle'
                            ? 'Có trần trong cấu hình nhưng chưa xuất hiện dòng nào trong Max bid cap.'
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
        <div>
          Bảng này so <b>trần với trần</b>: cột <b>Trần CPI sheet</b> là mức CPI mà model bid đang
          chạy theo (cột <code className="text-[9px]">CPI cap</code> của Max bid cap), so với{' '}
          <b>Trần cấu hình</b> trong PerGeo_CPI_Cap. Không phải CPI đã tiêu — sheet Max bid cap bỏ
          cột Spend từ 8/2026 và không tab nào chẻ spend theo nước, nên CPI thật theo nước không còn
          đo được ở đâu.
        </div>
        {overview.uncapped.length > 0 && (
          <div className="text-amber-700">
            {overview.uncapped.length} nước sheet vẫn đang đưa bid mà cấu hình chưa đặt trần:{' '}
            {overview.uncapped
              .slice(0, 6)
              .map((u) => `${u.country} (bid ${money2(u.bidRec)})`)
              .join(', ')}
            {overview.uncapped.length > 6 && ` …+${overview.uncapped.length - 6}`}
          </div>
        )}
      </div>
    </CapSection>
  );
}
