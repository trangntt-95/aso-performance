'use client';

import { useMemo, useState } from 'react';
import { Activity, Target } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SheetPayload } from '@/lib/sheets/types';
import {
  DEMAND_WINDOWS,
  buildDemandTrend,
  buildInstallPacing,
  type DemandWindowDays,
} from '@/lib/market/marketHealth';
import { formatDMY, formatDMYRange, formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Nửa trên Market Health (bản 17/09/2026): cầu của thị trường theo ngày, tách
// organic / paid, kỳ đang chọn so kỳ liền trước; và pacing install paid
// (Shopify Ads + Google Ads) so target tháng. Xem lib/market/marketHealth.ts
// cho lý do bỏ core basket và executive summary của Apps Script.

type Metric = 'users' | 'installs';
type Surface = 'both' | 'organic' | 'paid';

const delta = (v: number | null) =>
  v === null ? <span className="text-slate-300">—</span> : (
    <span className={cn('font-mono text-[11px]', v > 0.02 ? 'text-emerald-700' : v < -0.02 ? 'text-rose-600' : 'text-slate-500')}>
      {v >= 0 ? '+' : ''}{Math.round(v * 100)}%
    </span>
  );

function Kpi({ label, value, prev, d, sub, title }: { label: string; value: string; prev: string; d: number | null; sub?: string; title?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2" title={title}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-slate-900">{value}</span>
        {delta(d)}
      </div>
      <div className="text-[10px] text-slate-400">kỳ trước {prev}{sub ? ` · ${sub}` : ''}</div>
    </div>
  );
}

export function DemandTrendSection({ data }: { data: SheetPayload }) {
  const [windowDays, setWindowDays] = useState<DemandWindowDays>(30);
  const [metric, setMetric] = useState<Metric>('users');
  const [surface, setSurface] = useState<Surface>('both');

  const trend = useMemo(() => buildDemandTrend(data.historyDaily ?? [], windowDays), [data.historyDaily, windowDays]);
  const pacing = useMemo(
    () => buildInstallPacing(data.shopifyDaily ?? [], data.googleAds?.convActions ?? [], windowDays),
    [data.shopifyDaily, data.googleAds?.convActions, windowDays],
  );

  const chart = useMemo(() => {
    if (!trend) return [];
    const pick = (d: { orgUsers: number; paidUsers: number; orgInstalls: number; paidInstalls: number }) => {
      const org = metric === 'users' ? d.orgUsers : d.orgInstalls;
      const paid = metric === 'users' ? d.paidUsers : d.paidInstalls;
      return surface === 'organic' ? org : surface === 'paid' ? paid : org + paid;
    };
    return trend.cur.days.map((d, i) => ({
      idx: d.idx,
      date: d.date,
      prevDate: trend.prev.days[i]?.date,
      cur: pick(d),
      prev: trend.prev.days[i] ? pick(trend.prev.days[i]) : null,
      organic: metric === 'users' ? d.orgUsers : d.orgInstalls,
      paid: metric === 'users' ? d.paidUsers : d.paidInstalls,
    }));
  }, [trend, metric, surface]);

  if (!trend) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        Tab History_Daily chưa có dòng theo ngày (usersDaily) — chưa vẽ được cầu theo ngày. Tracker daily-snapshot cần chạy.
      </section>
    );
  }
  const c = trend.cur.totals, p = trend.prev.totals;
  const curLabel = formatDMYRange(trend.cur.from, trend.cur.to);
  const prevLabel = formatDMYRange(trend.prev.from, trend.prev.to);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Activity className="h-4 w-4 text-indigo-600" />
          Cầu thị trường theo ngày
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600" title={`Kỳ này ${curLabel} · kỳ trước ${prevLabel}. Kỳ kết thúc ở ngày cuối có dữ liệu GA4 (${formatDMY(trend.asOf)}).`}>
          📅 {curLabel} so với {prevLabel}
        </span>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
          {DEMAND_WINDOWS.map((w, i) => (
            <button key={w} type="button" onClick={() => setWindowDays(w)} className={cn('px-2 py-0.5 font-medium transition', i > 0 && 'border-l border-slate-200', windowDays === w ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
              {w} ngày
            </button>
          ))}
        </div>
        {c.daysWithData < windowDays && (
          <span className="text-[10px] text-amber-700" title="Ngày không có dòng trong History_Daily được tính 0 — thường là tracker chưa chạy ngày đó.">
            ⚠️ {windowDays - c.daysWithData} ngày trong kỳ chưa có dữ liệu
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Users organic" value={formatNumber(c.orgUsers)} prev={formatNumber(p.orgUsers)} d={trend.delta.orgUsers} sub={`CR ${formatPercent(c.orgCr)}`} title="Người tìm thấy app qua kết quả tự nhiên và bấm vào listing (GA4, History_Daily)" />
        <Kpi label="Users paid" value={formatNumber(c.paidUsers)} prev={formatNumber(p.paidUsers)} d={trend.delta.paidUsers} sub={`CR ${formatPercent(c.paidCr)} · chiếm ${formatPercent(c.paidShare)}`} title="Người bấm vào quảng cáo App Store (surface search_ad). Chiếm = paid ÷ tổng users." />
        <Kpi label="Install organic" value={formatNumber(c.orgInstalls)} prev={formatNumber(p.orgInstalls)} d={trend.delta.orgInstalls} title="GA4 GetApp từ kênh organic" />
        <Kpi label="Install paid" value={formatNumber(c.paidInstalls)} prev={formatNumber(p.paidInstalls)} d={trend.delta.paidInstalls} title="GA4 GetApp từ kênh paid — thấp hơn Shopify Ads khoảng 10–30%, xem pacing bên dưới cho số Shopify" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
            {(['users', 'installs'] as Metric[]).map((m, i) => (
              <button key={m} type="button" onClick={() => setMetric(m)} className={cn('px-2 py-0.5 font-medium', i > 0 && 'border-l border-slate-200', metric === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                {m === 'users' ? 'Users' : 'Install'}
              </button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
            {(['both', 'organic', 'paid'] as Surface[]).map((s, i) => (
              <button key={s} type="button" onClick={() => setSurface(s)} className={cn('px-2 py-0.5 font-medium', i > 0 && 'border-l border-slate-200', surface === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                {s === 'both' ? 'Cả hai kênh' : s === 'organic' ? 'Organic' : 'Paid'}
              </button>
            ))}
          </div>
          <span className="ml-auto flex items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-indigo-600" /> kỳ này</span>
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400" /> kỳ trước (chồng theo ngày thứ n)</span>
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={(v) => formatDMY(v).slice(0, 5)} tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                formatter={(v, name) => [formatNumber(Number(v)), name === 'cur' ? 'Kỳ này' : name === 'prev' ? 'Kỳ trước' : String(name)]}
                labelFormatter={(_, payload) => {
                  const r = payload?.[0]?.payload as { date?: string; prevDate?: string; idx?: number } | undefined;
                  return r ? `Ngày ${r.idx}: ${formatDMY(r.date)} · kỳ trước ${formatDMY(r.prevDate)}` : '';
                }}
                contentStyle={{ fontSize: 11 }}
              />
              <Line type="monotone" dataKey="prev" stroke="#94a3b8" strokeDasharray="4 3" dot={false} strokeWidth={1.5} connectNulls />
              <Line type="monotone" dataKey="cur" stroke="#4f46e5" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          Nguồn GA4 (History_Daily): đếm khi khách thực sự bấm vào listing, không phải impression; thấp hơn Shopify Ads khoảng 10–30% và lệch nặng hơn ở số nhỏ. Mỗi ngày là tổng mọi keyword có phiên.
        </p>
      </div>

      {pacing && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Target className="h-4 w-4 text-emerald-600" />
              Pacing install paid so với target
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">📅 {formatDMYRange(pacing.from, pacing.to)} ({pacing.windowDays} ngày, theo export Shopify Ads)</span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <div className="rounded border border-slate-100 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Install paid (Shopify + Google)</div>
              <div className="text-lg font-semibold text-slate-900">{formatNumber(pacing.installs)}</div>
              <div className="text-[10px] text-slate-400">Shopify Ads {formatNumber(pacing.shopifyInstalls)} · Google Ads {formatNumber(pacing.googleInstalls)} · kỳ trước {formatNumber(pacing.prevInstalls)}</div>
            </div>
            <div className="rounded border border-slate-100 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Target kỳ này</div>
              <div className="text-lg font-semibold text-slate-900">{pacing.target === null ? '—' : formatNumber(Math.round(pacing.target))}</div>
              <div className="text-[10px] text-slate-400">{pacing.targetPerDay === null ? 'chưa có target tháng này' : `${pacing.targetPerDay.toFixed(1)} install/ngày · ADS_MONTHLY_TARGETS`}</div>
            </div>
            <div className="rounded border border-slate-100 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Đạt</div>
              <div className={cn('text-lg font-semibold', pacing.pct === null ? 'text-slate-400' : pacing.pct >= 1 ? 'text-emerald-700' : pacing.pct >= 0.8 ? 'text-amber-700' : 'text-rose-600')}>
                {pacing.pct === null ? '—' : `${Math.round(pacing.pct * 100)}%`}
              </div>
              <div className="text-[10px] text-slate-400">{pacing.perDay.toFixed(1)} install/ngày thực</div>
            </div>
            <div className="rounded border border-slate-100 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">So kỳ trước</div>
              <div className="text-lg font-semibold text-slate-900">{delta(pacing.prevInstalls > 0 ? (pacing.installs - pacing.prevInstalls) / pacing.prevInstalls : null)}</div>
              <div className="text-[10px] text-slate-400">cùng độ dài, cả hai kênh</div>
            </div>
          </div>
          {pacing.missingTargetMonths.length > 0 && (
            <p className="mt-2 text-[10px] text-amber-700">Thiếu target tháng {pacing.missingTargetMonths.join(', ')} trong lib/config/ads-targets.ts — target kỳ này không tính được.</p>
          )}
          <p className="mt-1 text-[10px] text-slate-400">
            Install paid = install Shopify Ads (export theo ngày) + conversion install của Google Ads (chỉ hành động app_install / shopify_app_install, không đếm click_get_app). Target là target tháng của paid pro-rate theo số ngày trong kỳ. Google Ads thường trễ một ngày so với Shopify.
          </p>
        </div>
      )}
    </section>
  );
}
