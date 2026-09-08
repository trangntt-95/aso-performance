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

// Is the CPI ceiling we bid to worth paying, per COUNTRY?
//
// Same shape as the per-category table below it — see capTable.tsx for why the
// two share their parts rather than being matched by eye.
//
// This table has been through two changes and the second corrected the first.
// It originally read measured CPI (spend ÷ installs) against the configured
// ceiling. 'Max bid cap' dropped its Spend column in Aug 2026 and nothing else
// splits spend by country, so the measurement was gone and it switched to
// comparing the sheet's own CPI cap against the configured one.
//
// That comparison was broken in a way that was easy to miss: the configured
// ceiling ('CPI Cap ($)' in PerGeo_CPI_Cap) is empty — header intact, 0 of 124
// rows filled — so the value fell back to the tier block's 'Max bid' row. Max bid
// is money per CLICK and a CPI ceiling is money per INSTALL, and comparing them
// reported 37 of 40 countries as over cap with gaps to +293%, measuring nothing
// but which tier bids least per click.
//
// So the ceiling is now weighed against what an install is WORTH there — both
// sides per install, and the question that actually decides whether a market
// should be bought. A ceiling above install value loses money on every install
// bought at it however well the campaign runs, which is a config fault and needs
// a different fix from an execution one.
//
// Columns deliberately absent: the bar chart of CPI against cap (the signed
// percentage says the same in less ink), standalone clicks, and any dollar total
// of money lost — that is uncomputable without spend, and multiplying the
// per-install gap by installs would present an allowance as money already gone.

const VERDICT: Record<CapVerdict, { label: string; tone: CapTone }> = {
  over: { label: 'Trần > giá trị install', tone: 'bad' },
  under: { label: 'Trần dưới giá trị', tone: 'good' },
  'no-bid': { label: 'Đã dừng mua', tone: 'neutral' },
  'no-value': { label: 'Chưa có doanh thu để xét', tone: 'warn' },
};

type Lens = 'all' | 'over' | 'no-value' | 'tier1-silent' | 'no-bid';

const LENS_LABEL: Record<Lens, string> = {
  all: 'Tất cả nước trong tier',
  over: 'Trần cao hơn giá trị 1 install',
  'no-value': 'Chưa có doanh thu để xét trần',
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
      case 'no-value':
        return r.filter((x) => x.verdict === 'no-value');
      case 'tier1-silent':
        return r.filter((x) => x.tier1 && x.installs === 0);
      case 'no-bid':
        return r.filter((x) => x.verdict === 'no-bid');
      default:
        return r;
    }
  }, [overview, lens]);

  if (isLoading || !overview || overview.rows.length === 0) return null;
  const t = overview.totals;

  return (
    <CapSection
      title="1 · Nước nào đang bid tới mức trần cao hơn giá trị 1 install"
      summary={`${t.configured} nước trong tier · ${t.withBid} nước còn bid · ${t.overCount} nước trần cao hơn giá trị install`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CapStat<Lens>
          label="Trần > giá trị install"
          value={t.overCount}
          sub="mua đúng ở trần vẫn lỗ"
          tone="text-rose-600"
          pick="over"
          active={lens === 'over'}
          onPick={pick}
        />
        <CapStat<Lens>
          label="Lỗ ở mức trần"
          value={money2(t.lossPerInstall)}
          sub="cộng dồn, trên mỗi install"
          tone="text-rose-600"
          pick="over"
          active={lens === 'over'}
          onPick={pick}
        />
        <CapStat<Lens>
          label="Chưa xét được"
          value={t.unjudgeable}
          sub="không có doanh thu theo nước"
          tone={t.unjudgeable > 0 ? 'text-amber-700' : undefined}
          pick="no-value"
          active={lens === 'no-value'}
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
                          title={`Lỗ ${money2(Math.abs(r.capHeadroom))} mỗi install nếu mua đúng ở trần ${money2(r.sheetCpiCap)}.`}
                        >
                          −{money2(Math.abs(r.capHeadroom))}/install
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
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">
                      {r.valuePerInstall !== null ? (
                        money2(r.valuePerInstall)
                      ) : (
                        <span
                          className="cursor-help text-amber-700"
                          title="Nước này không có trong block doanh thu của PerGeo_CPI_Cap, nên không có gì để cân trần CPI."
                        >
                          chưa có
                        </span>
                      )}
                      {r.cap > 0 && (
                        <div
                          className="cursor-help text-[9px] text-slate-400"
                          title="Trần CPI đã cấu hình trong PerGeo_CPI_Cap. Cột này hiện trống ở mọi nước; khi được điền lại thì nó hiện ở đây."
                        >
                          trần đặt {money(r.cap)}
                        </div>
                      )}
                    </td>
                    <GapCell
                      gap={r.vsCapPct}
                      title={
                        r.capHeadroom !== null && r.capHeadroom < 0
                          ? `Trần ${money2(r.sheetCpiCap)} cao hơn giá trị 1 install (${money2(r.valuePerInstall)}) — mua đúng ở trần vẫn lỗ ${money2(Math.abs(r.capHeadroom))} mỗi install. Đây là lỗi cấu hình trần, không phải lỗi vận hành camp.`
                          : r.capHeadroom !== null
                            ? `Còn dư ${money2(r.capHeadroom)} mỗi install ở mức trần.`
                            : undefined
                      }
                    />
                    <VerdictBadge
                      label={VERDICT[r.verdict].label}
                      tone={VERDICT[r.verdict].tone}
                      title={
                        r.verdict === 'no-bid'
                          ? 'Nước này không còn trần CPI nào đang chạy — mọi cluster đều bị đánh cắt / pause, hoặc nước chưa xuất hiện trong Max bid cap.'
                          : r.verdict === 'no-value'
                            ? 'Có trần nhưng không có doanh thu theo nước để cân, nên không kết luận được. Nói ra chứ không mặc định là ổn.'
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
          Bảng này cân <b>trần CPI</b> (mức model bid được phép trả cho 1 install, cột{' '}
          <code className="text-[9px]">CPI cap</code> của Max bid cap) với <b>giá trị 1 install</b>{' '}
          (doanh thu ÷ install, block doanh thu của PerGeo_CPI_Cap). Cả hai đều là tiền trên mỗi
          install nên trừ được cho nhau: trần cao hơn giá trị thì mỗi install mua ở trần đều lỗ, dù
          camp chạy tốt cỡ nào — đó là lỗi <b>cấu hình trần</b>, cần sửa khác với lỗi vận hành.
        </div>
        <div>
          Trước 9/2026 cột này so trần sheet với <b>trần cấu hình</b> trong PerGeo_CPI_Cap. Cột đó
          hiện <b>trống ở cả 124 dòng</b> nên số liệu rơi về dòng <code className="text-[9px]">Max
          bid</code> của block tier — mà Max bid là tiền/<b>click</b> còn trần CPI là tiền/
          <b>install</b>, hai đơn vị khác nhau. Kết quả là 37/40 nước bị báo &ldquo;vượt trần&rdquo;
          với mức lệch tới +293%, đo đúng một thứ: tier nào bid thấp nhất. Khi cột{' '}
          <code className="text-[9px]">CPI Cap ($)</code> được điền lại, nó sẽ hiện thành số phụ dưới
          giá trị install — không bao giờ thay cho trần bid nữa.
        </div>
        <div>
          Không có tổng &ldquo;đã lỗ bao nhiêu tiền&rdquo;: sheet không còn spend theo nước, và nhân
          mức lỗ mỗi install với số install sẽ biến một mức <i>cho phép</i> thành tiền đã mất thật.
        </div>
        {overview.uncapped.length > 0 && (
          <div className="text-amber-700">
            {overview.uncapped.length} nước sheet vẫn đang đưa bid mà block tier chưa xếp vào tier
            nào:{' '}
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
