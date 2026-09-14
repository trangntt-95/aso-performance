'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Trophy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NoteCell } from '@/components/shared/NoteCell';
import { CAMP_NOTE_SCOPE, campNoteId, legacyCampNoteKeys } from '@/lib/store/campNotes';
import { findBrandTopCamps, type BrandTopRow, type BrandTopVerdict } from '@/lib/market/brandTop';
import type { SheetPayload } from '@/lib/sheets/types';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Camp brand đã đứng top vị trí — hạ bid để khỏi trả tiền cho vị trí đã có.
//
// Ngược chiều với bảng Overbid chính (so CPC/CPI với mốc cho phép): ở đây một
// camp có thể CPC rất rẻ mà vẫn lãng phí, vì vị trí 1.0 với visibility 100%
// là hết chỗ để lên — mỗi cent bid thêm chỉ đổi lấy cùng một vị trí.

const money = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${n.toFixed(2)}`;

const VERDICT: Record<BrandTopVerdict, { label: string; cls: string }> = {
  top: { label: '🏁 Đã top — hạ bid', cls: 'bg-amber-100 text-amber-800' },
  watch: { label: '👀 Sát top', cls: 'bg-sky-100 text-sky-800' },
  ok: { label: 'Còn xa top', cls: 'bg-slate-100 text-slate-600' },
  'low-data': { label: 'Ít impressions', cls: 'bg-slate-50 text-slate-400' },
  'no-position': { label: 'Không có vị trí', cls: 'bg-slate-50 text-slate-400' },
};

export function BrandTopPanel({ data }: { data: SheetPayload | undefined }) {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [maxPos, setMaxPos] = useState('1.5');
  const [minImp, setMinImp] = useState('20');
  const [showAll, setShowAll] = useState(false);

  const result = useMemo(() => {
    if (!data) return null;
    return findBrandTopCamps(
      data.shopifyDaily ?? [],
      data.campLinks ?? [],
      data.masterKwLookup ?? [],
      data.pausedKw ?? [],
      data.bidCap ?? [],
      data.countryL30 ?? [],
      { days, maxPos: Number(maxPos) || 1.5, minImpressions: Number(minImp) || 0 },
    );
  }, [data, days, maxPos, minImp]);

  if (!result) return null;

  const flagged = result.rows.filter((r) => r.verdict === 'top' || r.verdict === 'watch');
  const shown = showAll ? result.rows : flagged;
  const topSpend = result.rows.filter((r) => r.verdict === 'top').reduce((s, r) => s + r.spend, 0);
  const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

  return (
    <div className="rounded-lg border border-amber-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50/60 px-3 py-2 text-xs">
        <Trophy className="h-4 w-4 text-amber-600" />
        <b className="text-amber-900">Brand đã top vị trí — hạ bid</b>
        <span className="text-slate-600">
          {flagged.length === 0
            ? 'không camp brand nào đang top'
            : `${result.rows.filter((r) => r.verdict === 'top').length} camp đã top · ${result.rows.filter((r) => r.verdict === 'watch').length} sát top`}
          {topSpend > 0 && (
            <>
              {' '}· spend camp đã top <b className="text-amber-800">${formatNumber(topSpend, { compact: true })}</b>/{days} ngày
            </>
          )}
        </span>
        <span className="ml-auto inline-flex flex-wrap items-center gap-1.5">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as 7 | 14 | 30)}
            className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700"
            title="Cửa sổ tính vị trí, neo vào ngày mới nhất của export"
          >
            <option value={7}>7 ngày</option>
            <option value={14}>14 ngày</option>
            <option value={30}>30 ngày</option>
          </select>
          <span className="text-[10px] text-slate-600">Vị trí ≤</span>
          <Input value={maxPos} onChange={(e) => setMaxPos(e.target.value)} className="h-6 w-12 px-1 text-[11px]" title="Vị trí trung bình từ mức này trở xuống coi là đã top" />
          <span className="text-[10px] text-slate-600">Imp ≥</span>
          <Input value={minImp} onChange={(e) => setMinImp(e.target.value)} className="h-6 w-12 px-1 text-[11px]" title="Dưới ngần này impressions thì vị trí chưa đủ tin" />
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-slate-400"
          >
            {showAll ? 'Chỉ hiện camp cần xử lý' : `Hiện cả ${result.rows.length} camp brand`}
          </button>
        </span>
      </div>

      {!result.hasPosition ? (
        <div className="px-3 py-3 text-xs text-slate-600">
          Export theo ngày trong {days} ngày gần nhất không có cột <b>Average Position</b> / <b>Visibility</b>. Khi paste
          export Shopify Ads vào sheet, giữ hai cột đó (U, V) thì bảng này tự chạy.
        </div>
      ) : shown.length === 0 ? (
        <div className="px-3 py-3 text-xs text-slate-500">
          Không camp brand nào ở vị trí ≤ {maxPos} với đủ impressions trong {dmy(result.from)}–{dmy(result.to)}.
          Bấm &ldquo;Hiện cả … camp brand&rdquo; để xem vị trí của tất cả.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Camp brand</th>
                <th className="px-2 py-1.5 text-left font-medium" title="Nước camp target theo Geo trong Camp_Links">Nước</th>
                <th className="px-2 py-1.5 text-right font-medium" title={`Average Position trung bình gia quyền theo impressions, ${days} ngày · Visibility = tỷ lệ phiên tìm kiếm có hiển thị`}>Vị trí · Vis</th>
                <th className="px-2 py-1.5 text-right font-medium" title="Impressions / Installs / Spend trong cửa sổ">Imp · Inst · Spend</th>
                <th className="px-2 py-1.5 text-right font-medium" title="Bid hiện tại = median 'Bid (max)' của keyword trong camp (Master KW Lookup) · Bid rec = trần CPI × CR: trần CPI là trung bình Bid Rec ⭐ của ô Brand × nước target ('Max bid cap', tiền cho 1 install), CR là của camp khi đủ 10 click, không thì CR paid của brand ở các nước đó (Country_L30), không nữa thì CR paid brand toàn cục. Ví dụ trần $40 × CR 50% = bid $20.">Bid nay / rec</th>
                <th className="px-2 py-1.5 text-right font-medium" title="Vị trí ORGANIC của brand ở các nước đó (Country_L30). Organic đã #1 mà paid cũng #1 = đang trả tiền cho chỗ mình vốn có.">Organic pos</th>
                <th className="px-2 py-1.5 text-left font-medium">Kết luận</th>
                <th className="px-2 py-1.5 text-left font-medium min-w-[9rem]">Note</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <BrandRow key={r.camp} r={r} />
              ))}
            </tbody>
          </table>
          <div className="border-t px-3 py-1.5 text-[10px] text-slate-400">
            Vị trí lấy từ cột <b>Average Position</b> của export Shopify Ads theo ngày, {dmy(result.from)}–{dmy(result.to)}, gia quyền theo
            impressions · <b>đã top</b> = vị trí ≤ {maxPos} và visibility ≥ 80% · bid hiện tại theo category-camp (Master không có bid theo nước) ·
            <b> bid rec</b> = trần CPI (Bid Rec ⭐ Brand × nước, tiền cho 1 install) × CR; * = CR mượn của brand paid (Country_L30) vì camp chưa đủ 10 click ·
            note dùng chung với bảng Overbid và Camp Health
          </div>
        </div>
      )}
    </div>
  );
}

function BrandRow({ r }: { r: BrandTopRow }) {
  const v = VERDICT[r.verdict];
  const overRec = r.bidNow !== null && r.bidRec !== null && r.bidNow > r.bidRec * 1.15;
  return (
    <tr className={cn('border-t align-top hover:bg-slate-50', r.verdict === 'top' && 'bg-amber-50/40')}>
      <td className="px-3 py-1.5 whitespace-nowrap">
        {r.url ? (
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline">
            {r.camp}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="font-medium text-slate-800" title="Chưa có trong Camp_Links">{r.camp}</span>
        )}
        <div className="text-[10px] text-slate-400">{r.daysActive} ngày chạy · {r.daysWithPosition} ngày có vị trí</div>
      </td>
      <td className="px-2 py-1.5 max-w-[12rem] text-[11px] text-slate-600" title={r.countryLabel}>
        <span className="line-clamp-2">{r.countryLabel}</span>
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap font-mono text-[11px]">
        {r.position === null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <>
            <span className={cn('font-semibold', r.verdict === 'top' ? 'text-amber-700' : 'text-slate-800')}>{r.position.toFixed(2)}</span>
            <span className="text-slate-400"> · {Math.round((r.visibility ?? 0) * 100)}%</span>
          </>
        )}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap font-mono text-[11px] text-slate-600">
        {formatNumber(r.impressions, { compact: true })} · {formatNumber(r.installs, { compact: true })} ·{' '}
        <span className="font-semibold text-slate-800">${formatNumber(r.spend, { compact: true })}</span>
        {r.cpi !== null && <span className="text-slate-400"> (CPI {money(r.cpi)})</span>}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap font-mono text-[11px]">
        <span className={cn(overRec ? 'font-semibold text-rose-600' : 'text-slate-800')} title={overRec ? 'Bid hiện tại cao hơn bid rec (trần CPI × CR) trên 15%' : undefined}>
          {money(r.bidNow)}
        </span>
        <span
          className="text-slate-400"
          title={
            r.bidRec === null
              ? 'Thiếu trần CPI hoặc CR để tính'
              : `trần CPI ${money(r.capPerInstall)} × CR ${Math.round((r.cr ?? 0) * 100)}% (${
                  r.crSource === 'camp' ? `CR của camp, ${r.clicks} click` : r.crSource === 'brand-countries' ? 'CR paid brand ở các nước target' : 'CR paid brand toàn cục'
                }) = ${money(r.bidRec)}`
          }
        >
          {' '}/ {money(r.bidRec)}
        </span>
        {r.bidRec !== null && (
          <div className="text-[9px] text-slate-400">
            {money(r.capPerInstall)} × {Math.round((r.cr ?? 0) * 100)}%{r.crSource !== 'camp' ? '*' : ''}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap font-mono text-[11px]">
        {r.organicPos === null ? (
          <span className="text-slate-300" title="Country_L30 không có dòng organic Brand cho các nước này">—</span>
        ) : (
          <span
            className={cn(r.organicPos <= 1.5 && r.verdict === 'top' ? 'font-semibold text-rose-600' : 'text-slate-700')}
            title={`${r.organicUsers} users organic · ${r.organicPos <= 1.5 && r.verdict === 'top' ? 'organic đã #1 mà paid cũng #1 — trả tiền cho chỗ vốn có' : ''}`}
          >
            {r.organicPos.toFixed(1)}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <span className={cn('inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium', v.cls)}>{v.label}</span>
        <div className="mt-0.5 max-w-[16rem] text-[10px] leading-snug text-slate-500">{r.reason}</div>
      </td>
      <NoteCell scope={CAMP_NOTE_SCOPE} noteId={campNoteId(r.camp)} fallbackKeys={legacyCampNoteKeys(r.camp)} />
    </tr>
  );
}
