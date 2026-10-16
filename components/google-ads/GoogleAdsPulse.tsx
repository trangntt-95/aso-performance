'use client';

import { useMemo } from 'react';
import type { SheetPayload } from '@/lib/sheets/types';
import { buildGoogleAdsPulse, type PulseEntityRow } from '@/lib/market/googleAdsPulse';
import type { DateRange } from '@/lib/market/googleAdsFilter';
import { FX_NOTE } from '@/lib/config/fx';
import { formatDMYRange, formatDMY, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Khối "trả lời nhanh" đầu tab Google Ads — bốn câu Trang cần (15/10/2026):
// CPI vượt $32 chưa · target tháng đạt bao nhiêu % · so kỳ trước · tăng/giảm do đâu.
// Nhận export ĐẦY ĐỦ (chưa lọc) vì cần cả kỳ trước; `range` là khoảng tab đang lọc.

const usd = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${n.toFixed(d)}`);
const signed = (n: number, d = 1) => `${n > 0 ? '+' : ''}${n.toFixed(d)}`;
const pctOf = (n: number | null) => (n === null ? '—' : formatPercent(n, { signed: true }));
const tone = (n: number, goodWhenUp: boolean) => (Math.abs(n) < 1e-9 ? 'text-slate-500' : (n > 0) === goodWhenUp ? 'text-emerald-700' : 'text-rose-700');

function Card({ q, big, bigTone, sub, foot }: { q: string; big: string; bigTone?: string; sub: string; foot?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{q}</div>
      <div className={cn('mt-0.5 font-mono text-xl font-bold', bigTone ?? 'text-slate-900')}>{big}</div>
      <div className="text-[11px] text-slate-700">{sub}</div>
      {foot && <div className="mt-0.5 text-[10px] text-slate-400">{foot}</div>}
    </div>
  );
}

/** Ba phần của một thay đổi, vẽ thành thanh để thấy phần nào lớn. */
function Drivers({ parts, unit, goodWhenUp }: { parts: { label: string; value: number; hint: string }[]; unit: 'install' | 'usd'; goodWhenUp: boolean }) {
  const max = Math.max(1e-9, ...parts.map((p) => Math.abs(p.value)));
  const fmt = (v: number) => (unit === 'usd' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(v).toFixed(1)}` : signed(v, 1));
  return (
    <div className="space-y-1">
      {parts.map((p) => (
        <div key={p.label} className="flex items-center gap-2 text-[11px]" title={p.hint}>
          <span className="w-16 shrink-0 text-slate-600">{p.label}</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className={cn('absolute top-0 h-2 rounded', (p.value > 0) === goodWhenUp ? 'bg-emerald-400' : 'bg-rose-400')}
              style={{ width: `${(Math.abs(p.value) / max) * 100}%`, left: 0 }}
            />
          </div>
          <span className={cn('w-14 shrink-0 text-right font-mono font-semibold', tone(p.value, goodWhenUp))}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function EntityList({ title, rows, mode, n = 4 }: { title: string; rows: PulseEntityRow[]; mode: 'installs' | 'cpi'; n?: number }) {
  const list = useMemo(() => {
    const r = mode === 'installs' ? rows.filter((x) => Math.abs(x.dInstalls) >= 0.5) : rows.filter((x) => x.cpiContribUsd !== null && Math.abs(x.cpiContribUsd) >= 0.05);
    return (mode === 'installs' ? r : [...r].sort((a, b) => Math.abs(b.cpiContribUsd ?? 0) - Math.abs(a.cpiContribUsd ?? 0))).slice(0, n);
  }, [rows, mode, n]);
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {list.length === 0 ? (
        <div className="text-[11px] text-slate-400">không có khác biệt đáng kể</div>
      ) : (
        <div className="mt-0.5 space-y-0.5">
          {list.map((r) => {
            const v = mode === 'installs' ? r.dInstalls : (r.cpiContribUsd ?? 0);
            const good = mode === 'installs' ? v > 0 : v < 0;
            return (
              <div
                key={r.name}
                className="flex items-baseline gap-2 text-[11px]"
                title={
                  `${r.name}\nKỳ này: ${r.cur.installs.toFixed(1)} install, ${usd(r.cur.costUsd, 0)}, CPI ${usd(r.cur.cpiUsd)}, CR ${r.cur.cr === null ? '—' : formatPercent(r.cur.cr)}\n` +
                  `Kỳ trước: ${r.prev.installs.toFixed(1)} install, ${usd(r.prev.costUsd, 0)}, CPI ${usd(r.prev.cpiUsd)}, CR ${r.prev.cr === null ? '—' : formatPercent(r.prev.cr)}`
                }
              >
                <span className={cn('w-12 shrink-0 text-right font-mono font-semibold', good ? 'text-emerald-700' : 'text-rose-700')}>
                  {mode === 'installs' ? signed(v, 1) : `${v > 0 ? '+' : '−'}$${Math.abs(v).toFixed(1)}`}
                </span>
                <span className="truncate text-slate-700">{r.name}</span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {mode === 'installs' ? `${r.prev.installs.toFixed(0)}→${r.cur.installs.toFixed(0)}` : `${usd(r.prev.cpiUsd, 0)}→${usd(r.cur.cpiUsd, 0)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GoogleAdsPulse({ data, range }: { data: SheetPayload; range: DateRange | null }) {
  const p = useMemo(() => buildGoogleAdsPulse(data, range), [data, range]);
  if (!p) return null;
  const { totals: t, cpi, target, installDrivers: id, cpiDrivers: cd } = p;
  const dInst = t.cur.installs - t.prev.installs;
  const dInstPct = t.prev.installs > 0 ? dInst / t.prev.installs : null;
  const dCost = t.prev.costUsd > 0 ? t.cur.costUsd / t.prev.costUsd - 1 : null;
  const prevLabel = formatDMYRange(p.prev.from, p.prev.to);
  const shopifyLag = target.shopifyTo && target.shopifyTo < target.monthTo;

  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-slate-600">
        <b className="text-slate-900">Trả lời nhanh</b>
        <span>kỳ này {formatDMYRange(p.cur.from, p.cur.to)} ({p.days} ngày)</span>
        <span>· so với kỳ trước {prevLabel}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Card
          q={`CPI đã vượt $${cpi.limitUsd} chưa?`}
          big={cpi.over === null ? 'chưa có install' : `${usd(cpi.cur)} · ${cpi.over ? 'ĐÃ VƯỢT' : 'chưa'}`}
          bigTone={cpi.over === null ? 'text-slate-500' : cpi.over ? 'text-rose-700' : 'text-emerald-700'}
          sub={`kỳ trước ${usd(cpi.prev)} (${pctOf(cpi.deltaPct)}) · ${t.cur.installs.toFixed(1)} install / ${usd(t.cur.costUsd, 0)}`}
          foot={`Trần $${cpi.limitUsd} đặt trong lib/config/ads-targets. CPI = chi phí ÷ install thật (không dùng "conversions").`}
        />
        <Card
          q={`Target install tháng ${target.monthKey.slice(5)}/${target.monthKey.slice(0, 4)}`}
          big={target.pct === null ? 'chưa có target' : `${Math.round(target.pct * 100)}%`}
          bigTone={target.pct === null ? 'text-slate-500' : target.pct >= 1 ? 'text-emerald-700' : target.pct >= 0.8 ? 'text-amber-700' : 'text-rose-700'}
          sub={
            `Google ${target.googleInstalls.toFixed(0)}` +
            (target.shopifyInstalls === null ? '' : ` + App Store ${target.shopifyInstalls}`) +
            ` = ${target.paidInstalls.toFixed(0)} / ${target.expectedToDate === null ? '—' : Math.round(target.expectedToDate)} tới ${formatDMY(target.monthTo)}` +
            (target.monthlyTarget === null ? '' : ` · target tháng ${target.monthlyTarget}`)
          }
          foot={
            (target.runrate ? `Pace cả tháng ≈ ${Math.round(target.runrate.projected)} (${Math.round(target.runrate.pct * 100)}%). ` : '') +
            (target.googleShare === null ? '' : `Google chiếm ${Math.round(target.googleShare * 100)}% paid. `) +
            (shopifyLag ? `⚠️ Export Shopify Ads mới tới ${formatDMY(target.shopifyTo)}, thiếu vài ngày.` : '') +
            (target.shopifyInstalls === null ? 'Không có export Shopify Ads → chỉ Google.' : '')
          }
        />
        <Card
          q="So với kỳ trước"
          big={`${signed(dInst, 0)} install (${pctOf(dInstPct)})`}
          bigTone={tone(dInst, true)}
          sub={`${t.prev.installs.toFixed(1)} → ${t.cur.installs.toFixed(1)} install · chi ${usd(t.prev.costUsd, 0)} → ${usd(t.cur.costUsd, 0)} (${pctOf(dCost)}) · CPI ${usd(cpi.prev)} → ${usd(cpi.cur)} (${pctOf(cpi.deltaPct)})`}
          foot={`CTR ${t.prev.ctr === null ? '—' : formatPercent(t.prev.ctr)} → ${t.cur.ctr === null ? '—' : formatPercent(t.cur.ctr)} · CR click→install ${t.prev.cr === null ? '—' : formatPercent(t.prev.cr)} → ${t.cur.cr === null ? '—' : formatPercent(t.cur.cr)} · CPC ${usd(t.prev.cpcUsd, 2)} → ${usd(t.cur.cpcUsd, 2)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1 text-[11px] font-semibold text-slate-800">
            Install {dInst >= 0 ? 'tăng' : 'giảm'} {signed(dInst, 1)} — do đâu
          </div>
          <Drivers
            unit="install"
            goodWhenUp
            parts={[
              { label: 'Traffic', value: id.traffic, hint: 'Impression thay đổi, giữ nguyên CTR và CR của kỳ trước' },
              { label: 'CTR', value: id.ctr, hint: 'Tỉ lệ click thay đổi, trên impression kỳ này' },
              { label: 'CR', value: id.cr, hint: 'Tỉ lệ click → install thay đổi, trên click kỳ này' },
            ]}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <EntityList title="Nước" rows={p.byCountry} mode="installs" />
            <EntityList title="Campaign" rows={p.byCampaign} mode="installs" />
            <EntityList title="Keyword" rows={p.byKeyword} mode="installs" />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1 text-[11px] font-semibold text-slate-800">
            CPI {cd ? (cd.total >= 0 ? 'tăng' : 'giảm') : ''} {cd ? `${cd.total > 0 ? '+' : '−'}$${Math.abs(cd.total).toFixed(1)}` : '(thiếu install một trong hai kỳ)'} — do đâu
          </div>
          {cd ? (
            <Drivers
              unit="usd"
              goodWhenUp={false}
              parts={[
                { label: 'CPC', value: cd.cpc, hint: 'Giá mỗi click thay đổi, giữ CR kỳ trước' },
                { label: 'CR', value: cd.cr, hint: 'Tỉ lệ click → install thay đổi, với CPC kỳ này' },
              ]}
            />
          ) : (
            <div className="text-[11px] text-slate-400">Cần install ở cả hai kỳ mới phân rã được.</div>
          )}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <EntityList title="Nước" rows={p.byCountry} mode="cpi" />
            <EntityList title="Campaign" rows={p.byCampaign} mode="cpi" />
            <EntityList title="Keyword" rows={p.byKeyword} mode="cpi" />
          </div>
        </div>
      </div>

      <div className="text-[10px] leading-snug text-slate-400">
        Cột nước / keyword: install chỉ có theo campaign × ngày, nên chia cho nước / keyword theo tỷ lệ conversions (không có thì theo click) trong campaign-ngày đó — là ước tính. Số CPI ở mục &quot;do đâu&quot; là phần của dòng đó trong thay đổi CPI toàn kênh, cộng mọi dòng bằng đúng ΔCPI. {FX_NOTE}
      </div>
    </div>
  );
}
