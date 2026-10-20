'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Clapperboard } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMetaProveny } from '@/lib/hooks/useMetaProveny';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { SortableTh } from '@/components/shared/SortableTh';
import { Sparkline } from '@/components/shared/Sparkline';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDMY, formatDMYTime, formatNumber } from '@/lib/utils/format';
import {
  PAID_COUNTRIES,
  activeDays,
  alerts as buildAlerts,
  campaignStats,
  countryName,
  creativeStats,
  delta,
  geoSummary,
  kpis,
  ratio,
  shortCampaign,
  windows,
  type Alert,
} from '@/lib/meta/analysis';
import type { MetaAdRow, MetaCampaignRow, MetaDailyRow, MetaProvenyPayload } from '@/lib/meta/types';
import { cn } from '@/lib/utils';

// Meta Ads · app PROVENY.
//
// Account quảng cáo riêng (FireGroup Technology JSC, USD). Không đọc sheet ASO,
// không so với TrueProfit: mọi số ở đây là của Proveny và chỉ của Proveny.
//
// Bố cục từ tổng quan tới chi tiết: dải KPI (cửa sổ ngày chọn được) → funnel →
// cảnh báo → trend ngày → bảng campaign → bảng creative → geo / placement /
// tuổi-giới. Bảng campaign/creative/geo là 30 ngày cố định vì Meta chỉ cho
// breakdown theo đối tượng trong một khoảng, còn KPI và chart theo cửa sổ.

type Win = 7 | 14 | 30;

const usd = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${n.toFixed(digits)}`;
const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(digits)}%`;
const int = (n: number | null | undefined) => formatNumber(n === undefined ? null : n);

function DeltaChip({ d, goodWhenUp = true }: { d: number | null; goodWhenUp?: boolean }) {
  if (d === null) return <span className="text-[10px] text-slate-400">—</span>;
  const good = goodWhenUp ? d >= 0 : d <= 0;
  const flat = Math.abs(d) < 0.02;
  return (
    <span
      className={cn(
        'rounded px-1 text-[10px] font-semibold',
        flat ? 'bg-slate-100 text-slate-500' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
      )}
    >
      {d > 0 ? '+' : ''}
      {(d * 100).toFixed(0)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  sub,
  d,
  goodWhenUp,
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  d: number | null;
  goodWhenUp?: boolean;
  spark: { t: number; v: number | null }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <DeltaChip d={d} goodWhenUp={goodWhenUp} />
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <div className="text-lg font-bold leading-tight text-slate-900">{value}</div>
          {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
        </div>
        <Sparkline points={spark} width={72} height={22} stroke="#4f46e5" />
      </div>
    </div>
  );
}

function Group({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-2 pb-0.5 pt-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
        {n}
      </span>
      <h2 className="text-[13px] font-bold tracking-tight text-slate-900">{title}</h2>
      <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">{sub}</span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span
      title={status}
      className={cn('inline-block h-2 w-2 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-300')}
    />
  );
}

function AlertRow({ a }: { a: Alert }) {
  const Icon = a.level === 'bad' ? AlertCircle : a.level === 'warn' ? AlertTriangle : Info;
  const tone =
    a.level === 'bad'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : a.level === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-slate-50 text-slate-800';
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border p-2.5 text-xs', tone)}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <div className="font-semibold">{a.title}</div>
        <div className="mt-0.5 text-[11px] leading-snug opacity-90">{a.detail}</div>
      </div>
    </div>
  );
}

// ---------------- Funnel ----------------
function Funnel({ k, campaigns }: { k: ReturnType<typeof kpis>; campaigns: MetaCampaignRow[] }) {
  const results = campaigns.reduce((t, c) => t + c.results, 0);
  const steps: { label: string; value: number; note?: string }[] = [
    { label: 'Impressions', value: k.impressions },
    { label: 'Clicks', value: k.clicks },
    { label: 'Link clicks', value: k.linkClicks },
    { label: 'Landing page view', value: k.lpv },
    { label: 'Đăng ký', value: k.registrations, note: 'Pixel complete_registration' },
    { label: 'Kết quả camp (30d)', value: results, note: 'Create Video / FirstVideoCreated / Visit App' },
    { label: 'Start trial', value: k.startTrials },
    { label: 'Subscribe', value: k.subscribes },
    { label: 'Purchase', value: k.purchases },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = prev && prev > 0 ? s.value / prev : null;
        return (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-2.5" title={s.note}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className="mt-0.5 text-base font-bold text-slate-900">{int(s.value)}</div>
            <div className="text-[10px] text-slate-500">{i === 0 ? 'đầu phễu' : `${pct(conv, 2)} từ bước trước`}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Chart ----------------
function DailyChart({ rows }: { rows: MetaDailyRow[] }) {
  const data = rows.map((r) => ({
    d: formatDMY(r.date).slice(0, 5),
    spend: Number(r.spend.toFixed(2)),
    ctr: r.impressions > 0 ? Number(((r.clicks / r.impressions) * 100).toFixed(2)) : null,
    cpm: r.impressions > 0 ? Number(((r.spend / r.impressions) * 1000).toFixed(2)) : null,
    lpv: r.lpv,
  }));
  return (
    <div className="h-56 rounded-lg border border-slate-200 bg-white p-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="r"
            orientation="right"
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: '#e2e8f0' }}
            formatter={(v, name) => {
              const label = String(name);
              const val = typeof v === 'number' ? v : Number(v ?? 0);
              if (label === 'Chi tiêu' || label === 'CPM') return [`$${val}`, label];
              if (label === 'CTR') return [`${val}%`, label];
              return [val, label];
            }}
          />
          <Bar yAxisId="l" dataKey="spend" name="Chi tiêu" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
          <Line yAxisId="r" type="monotone" dataKey="ctr" name="CTR" stroke="#4f46e5" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="l" type="monotone" dataKey="cpm" name="CPM" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------- Campaign table ----------------
type CampKey = 'name' | 'spend' | 'ctr' | 'cpm' | 'linkClicks' | 'lpv' | 'costPerLpv' | 'results' | 'cpr' | 'frequency' | 'trials';
function CampaignTable({ rows }: { rows: MetaCampaignRow[] }) {
  const { sortKey, sortDir, toggle, sortRows } = useTableSort<CampKey>('spend', { ascFirst: ['name', 'cpm', 'costPerLpv', 'cpr'] });
  const sorted = useMemo(
    () =>
      sortRows(rows, (c, k) => {
        const s = campaignStats(c);
        switch (k) {
          case 'name':
            return c.name;
          case 'spend':
            return c.spend;
          case 'ctr':
            return s.ctr;
          case 'cpm':
            return s.cpm;
          case 'linkClicks':
            return c.linkClicks;
          case 'lpv':
            return c.lpv;
          case 'costPerLpv':
            return s.costPerLpv;
          case 'results':
            return c.results;
          case 'cpr':
            return s.cpr;
          case 'frequency':
            return c.frequency;
          case 'trials':
            return c.startTrials;
        }
      }),
    [rows, sortRows],
  );
  const th = (col: CampKey, label: string, align: 'left' | 'right' = 'right', title?: string) => (
    <SortableTh col={col} sortKey={sortKey} sortDir={sortDir} onSort={toggle} label={label} align={align} title={title} className="px-2 py-2" />
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[960px] text-xs">
        <thead className="bg-slate-50 text-[11px] text-slate-600">
          <tr>
            {th('name', 'Campaign', 'left')}
            <th className="px-2 py-2 text-right font-medium">Budget/ngày</th>
            {th('spend', 'Chi 30d')}
            {th('ctr', 'CTR')}
            {th('cpm', 'CPM')}
            {th('frequency', 'Tần suất')}
            {th('linkClicks', 'Link clicks')}
            {th('lpv', 'LPV', 'right', 'Landing page views')}
            {th('costPerLpv', '$/LPV')}
            {th('results', 'Kết quả', 'right', 'Event campaign tối ưu, ghi tên bên dưới số')}
            {th('cpr', '$/kết quả')}
            {th('trials', 'Start trial', 'right', 'Pixel start_trial, cùng 30 ngày')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const s = campaignStats(c);
            return (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="max-w-[300px] px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={c.status} />
                    <span className="truncate font-medium text-slate-800" title={c.name}>
                      {shortCampaign(c.name)}
                    </span>
                  </div>
                  <div className="pl-3.5 text-[10px] text-slate-400">tạo {formatDMY(c.createdAt)}</div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{usd(c.dailyBudget, 0)}</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{usd(c.spend, 0)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{pct(s.ctr, 2)}</td>
                <td className={cn('px-2 py-1.5 text-right tabular-nums', s.cpm !== null && s.cpm > 20 && 'text-rose-700')}>{usd(s.cpm)}</td>
                <td className={cn('px-2 py-1.5 text-right tabular-nums', c.frequency >= 2 && 'text-amber-700')}>{c.frequency.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{int(c.linkClicks)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{int(c.lpv)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{usd(s.costPerLpv)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <div className="font-semibold">{int(c.results)}</div>
                  <div className="text-[10px] text-slate-400">{c.resultType}</div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{usd(s.cpr)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <div>{int(c.startTrials)}</div>
                  <div className="text-[10px] text-slate-400">{usd(s.costPerTrial)}/trial</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Creative table ----------------
type AdKey = 'name' | 'spend' | 'ctr' | 'cpm' | 'hook' | 'hold' | 'complete' | 'avg' | 'lpvRate' | 'costPerLpv' | 'results' | 'cpr' | 'frequency';
function CreativeTable({ rows }: { rows: MetaAdRow[] }) {
  const [onlyActive, setOnlyActive] = useState(false);
  const [minSpend, setMinSpend] = useState(10);
  const { sortKey, sortDir, toggle, sortRows } = useTableSort<AdKey>('spend', { ascFirst: ['name', 'cpm', 'costPerLpv', 'cpr'] });
  const list = useMemo(() => {
    const f = rows.filter((a) => a.spend >= minSpend && (!onlyActive || a.status === 'ACTIVE'));
    return sortRows(f, (a, k) => {
      const s = creativeStats(a);
      switch (k) {
        case 'name':
          return a.name;
        case 'spend':
          return a.spend;
        case 'ctr':
          return s.ctr;
        case 'cpm':
          return s.cpm;
        case 'hook':
          return s.hook;
        case 'hold':
          return s.hold;
        case 'complete':
          return s.complete;
        case 'avg':
          return a.avgWatchSec;
        case 'lpvRate':
          return s.lpvRate;
        case 'costPerLpv':
          return s.costPerLpv;
        case 'results':
          return a.results;
        case 'cpr':
          return s.cpr;
        case 'frequency':
          return a.frequency;
      }
    });
  }, [rows, minSpend, onlyActive, sortRows]);
  const th = (col: AdKey, label: string, title?: string, align: 'left' | 'right' = 'right') => (
    <SortableTh col={col} sortKey={sortKey} sortDir={sortDir} onSort={toggle} label={label} align={align} title={title} className="px-2 py-2" />
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Chỉ ad đang chạy
        </label>
        <label className="flex items-center gap-1">
          Chi tối thiểu
          <select value={minSpend} onChange={(e) => setMinSpend(Number(e.target.value))} className="rounded border border-slate-200 px-1 py-0.5">
            {[0, 5, 10, 20, 50].map((v) => (
              <option key={v} value={v}>
                ${v}
              </option>
            ))}
          </select>
        </label>
        <span className="text-slate-400">
          Hook = xem qua 25% / lượt phát · Hold = ThruPlay (15s) / lượt phát · Xem hết = 100% / 25%
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-600">
            <tr>
              {th('name', 'Creative · campaign', undefined, 'left')}
              {th('spend', 'Chi 30d')}
              {th('ctr', 'CTR')}
              {th('cpm', 'CPM')}
              {th('frequency', 'Tần suất')}
              {th('hook', 'Hook', 'p25 / plays')}
              {th('hold', 'Hold', 'ThruPlay / plays')}
              {th('complete', 'Xem hết', 'p100 / p25')}
              {th('avg', 'Giây TB', 'Thời gian xem trung bình')}
              {th('lpvRate', 'LPV rate', 'Landing page view / link click')}
              {th('costPerLpv', '$/LPV')}
              {th('results', 'Kết quả')}
              {th('cpr', '$/kết quả')}
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const s = creativeStats(a);
              const burning = a.status === 'ACTIVE' && a.spend >= 20 && a.results === 0;
              return (
                <tr key={a.id} className={cn('border-t border-slate-100 hover:bg-slate-50/60', burning && 'bg-rose-50/40')}>
                  <td className="max-w-[320px] px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={a.status} />
                      <span className="font-medium text-slate-800">{a.name}</span>
                    </div>
                    <div className="truncate pl-3.5 text-[10px] text-slate-400" title={`${a.campaignName} › ${a.adsetName}`}>
                      {shortCampaign(a.campaignName)} › {a.adsetName}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{usd(a.spend, 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(s.ctr, 2)}</td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums', s.cpm !== null && s.cpm > 20 && 'text-rose-700')}>{usd(s.cpm)}</td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums', a.frequency >= 2 && 'text-amber-700')}>{a.frequency.toFixed(2)}</td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums', s.hook !== null && s.hook >= 0.25 && 'text-emerald-700')}>{pct(s.hook, 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(s.hold, 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(s.complete, 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.avgWatchSec ? `${a.avgWatchSec}s` : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(s.lpvRate, 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{usd(s.costPerLpv)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <div className="font-semibold">{int(a.results)}</div>
                    <div className="text-[10px] text-slate-400">{a.resultType}</div>
                  </td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums', burning && 'font-semibold text-rose-700')}>
                    {burning ? 'chưa có' : usd(s.cpr)}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={13} className="px-2 py-4 text-center text-slate-400">
                  Không có ad nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Geo / placement / demo ----------------
function GeoTable({ p }: { p: MetaProvenyPayload }) {
  const geo = useMemo(() => geoSummary(p.countries), [p.countries]);
  const rows = useMemo(() => [...p.countries].sort((a, b) => b.spend - a.spend).slice(0, 20), [p.countries]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 font-semibold',
            geo.paidShare !== null && geo.paidShare >= 0.6 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
          )}
        >
          {pct(geo.paidShare, 0)} chi tiêu vào nước trả tiền
        </span>
        <span className="text-slate-500">
          Nước trả tiền = danh sách “Paid Countries” team đặt trong targeting. Phần còn lại: {geo.topCheap.map((r) => countryName(r.country)).join(', ')}…
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Nước</th>
              <th className="px-2 py-2 text-right font-medium">Chi 30d</th>
              <th className="px-2 py-2 text-right font-medium">% chi</th>
              <th className="px-2 py-2 text-right font-medium">Impressions</th>
              <th className="px-2 py-2 text-right font-medium">CPM</th>
              <th className="px-2 py-2 text-right font-medium">CTR</th>
              <th className="px-2 py-2 text-right font-medium">Link clicks</th>
              <th className="px-2 py-2 text-right font-medium">LPV</th>
              <th className="px-2 py-2 text-right font-medium">$/LPV</th>
              <th className="px-2 py-2 text-right font-medium">Hold</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const paid = PAID_COUNTRIES.has(r.country);
              return (
                <tr key={r.country} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <span className={cn('mr-1.5 inline-block rounded px-1 text-[9px] font-bold', paid ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {paid ? 'PAID' : 'rẻ'}
                    </span>
                    {countryName(r.country)} <span className="text-slate-400">{r.country}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{usd(r.spend, 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(ratio(r.spend, geo.total), 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{int(r.impressions)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{usd(r.impressions > 0 ? (r.spend / r.impressions) * 1000 : null)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(ratio(r.clicks, r.impressions), 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{int(r.linkClicks)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{int(r.lpv)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{usd(ratio(r.spend, r.lpv))}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(ratio(r.thruplays, r.plays), 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlacementTable({ p }: { p: MetaProvenyPayload }) {
  const total = p.placements.reduce((t, r) => t + r.spend, 0);
  const rows = [...p.placements].sort((a, b) => b.spend - a.spend).filter((r) => r.spend >= 1);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[11px] text-slate-600">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Placement</th>
            <th className="px-2 py-2 text-right font-medium">Chi</th>
            <th className="px-2 py-2 text-right font-medium">% chi</th>
            <th className="px-2 py-2 text-right font-medium">CPM</th>
            <th className="px-2 py-2 text-right font-medium">CTR</th>
            <th className="px-2 py-2 text-right font-medium">$/LPV</th>
            <th className="px-2 py-2 text-right font-medium">Hold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.platform}/${r.position}/${r.device}`} className="border-t border-slate-100">
              <td className="px-2 py-1.5">
                <span className="font-medium text-slate-800">
                  {r.platform} · {r.position.replace(/_/g, ' ')}
                </span>{' '}
                <span className="text-slate-400">{r.device.replace(/_/g, ' ')}</span>
              </td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{usd(r.spend, 0)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{pct(ratio(r.spend, total), 0)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{usd(r.impressions > 0 ? (r.spend / r.impressions) * 1000 : null)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{pct(ratio(r.clicks, r.impressions), 2)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{usd(ratio(r.spend, r.lpv))}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{pct(ratio(r.thruplays, r.plays), 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemoGrid({ p }: { p: MetaProvenyPayload }) {
  const ages = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const genders: { k: string; label: string }[] = [
    { k: 'male', label: 'Nam' },
    { k: 'female', label: 'Nữ' },
  ];
  const total = p.demographics.reduce((t, r) => t + r.spend, 0);
  const cell = (age: string, g: string) => p.demographics.find((r) => r.age === age && r.gender === g);
  const maxShare = Math.max(...p.demographics.map((r) => r.spend / (total || 1)));
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[11px] text-slate-600">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Tuổi</th>
            {genders.map((g) => (
              <th key={g.k} className="px-2 py-2 text-right font-medium" colSpan={3}>
                {g.label}: % chi · CPM · CTR
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ages.map((age) => (
            <tr key={age} className="border-t border-slate-100">
              <td className="px-2 py-1.5 font-medium text-slate-800">{age}</td>
              {genders.map((g) => {
                const r = cell(age, g.k);
                const share = r ? r.spend / (total || 1) : 0;
                const alpha = maxShare > 0 ? 0.08 + (share / maxShare) * 0.5 : 0;
                return (
                  <td key={g.k} colSpan={3} className="px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: `rgba(79,70,229,${alpha.toFixed(2)})` }}>
                    <span className="font-semibold">{pct(share, 0)}</span>
                    <span className="mx-1.5 text-slate-500">·</span>
                    {r ? usd((r.spend / Math.max(1, r.impressions)) * 1000) : '—'}
                    <span className="mx-1.5 text-slate-500">·</span>
                    {r ? pct(ratio(r.clicks, r.impressions), 1) : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- View ----------------
export function MetaProvenyView() {
  const { data, isLoading, error } = useMetaProveny();
  const [win, setWin] = useState<Win>(7);

  const derived = useMemo(() => {
    if (!data) return null;
    const { current, previous } = windows(data.daily, win);
    const cur = kpis(current);
    const prev = kpis(previous);
    const all = activeDays(data.daily);
    const spark = (get: (d: MetaDailyRow) => number | null) => all.map((d, i) => ({ t: i, v: get(d) }));
    return {
      cur,
      prev,
      current,
      all,
      spark,
      alerts: buildAlerts(data, countryName),
    };
  }, [data, win]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (error || !data || !derived) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
        Không tải được Meta Ads Proveny: {error instanceof Error ? error.message : 'lỗi không rõ'}.
      </div>
    );
  }

  const { cur, prev, current, spark, alerts } = derived;
  const live = data.source === 'graph_api';
  const sinceLabel = current[0] ? formatDMY(current[0].date) : '';
  const untilLabel = current[current.length - 1] ? formatDMY(current[current.length - 1].date) : '';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Clapperboard className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            <div className="text-xs text-slate-700">
              <div className="font-semibold text-slate-900">
                Meta Ads · app <span className="text-indigo-700">Proveny</span>
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                  Account riêng · không liên quan TrueProfit ASO
                </span>
              </div>
              <div className="mt-0.5 leading-relaxed">
                Ad account {data.account.id} ({data.account.business}, {data.account.currency}). KPI và chart theo cửa sổ ngày chọn bên phải;
                bảng campaign / creative / geo là 30 ngày gần nhất ({formatDMY(data.dateRange.since)} → {formatDMY(data.dateRange.until)}).
                {' '}
                {live ? (
                  <span className="text-emerald-700">Đang đọc trực tiếp Graph API, cập nhật {formatDMYTime(data.fetchedAt)}.</span>
                ) : (
                  <span className="text-amber-700">
                    Đang hiển thị snapshot kéo qua MCP lúc {formatDMYTime(data.fetchedAt)}. Nối Graph API (META_ACCESS_TOKEN) để tự cập nhật.
                  </span>
                )}
                {data.stale && <span className="text-rose-700"> Graph API lỗi: {data.stale.reason}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-white p-0.5 ring-1 ring-slate-200">
            {([7, 14, 30] as Win[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWin(w)}
                className={cn(
                  'rounded px-2 py-1 text-[11px] font-semibold transition',
                  win === w ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                L{w}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Group n={1} title={`Tổng quan L${win}`} sub={`${sinceLabel} → ${untilLabel}, delta so với ${prev.days} ngày liền trước`} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Chi tiêu" value={usd(cur.spend, 0)} sub={`${usd(cur.days ? cur.spend / cur.days : null, 0)}/ngày`} d={delta(cur.spend, prev.spend)} spark={spark((d) => d.spend)} />
        <Kpi label="FirstVideoCreated" value={int(cur.firstVideoCreated)} sub={`${usd(cur.costPerFvc)} / kết quả`} d={delta(cur.firstVideoCreated, prev.firstVideoCreated)} spark={spark((d) => d.firstVideoCreated)} />
        <Kpi label="Start trial" value={int(cur.startTrials)} sub={`${usd(cur.costPerTrial)} / trial`} d={delta(cur.startTrials, prev.startTrials)} spark={spark((d) => d.startTrials)} />
        <Kpi label="Landing page view" value={int(cur.lpv)} sub={`${usd(cur.costPerLpv)} / LPV`} d={delta(cur.lpv, prev.lpv)} spark={spark((d) => d.lpv)} />
        <Kpi label="CTR" value={pct(cur.ctr, 2)} sub={`${int(cur.clicks)} clicks`} d={delta(cur.ctr, prev.ctr)} spark={spark((d) => (d.impressions ? d.clicks / d.impressions : null))} />
        <Kpi label="CPM" value={usd(cur.cpm)} sub={`${formatNumber(cur.impressions, { compact: true })} impressions`} d={delta(cur.cpm, prev.cpm)} goodWhenUp={false} spark={spark((d) => (d.impressions ? (d.spend / d.impressions) * 1000 : null))} />
        <Kpi label="Hold rate" value={pct(cur.holdRate, 0)} sub={`${formatNumber(cur.thruplays, { compact: true })} ThruPlay`} d={delta(cur.holdRate, prev.holdRate)} spark={spark((d) => (d.plays ? d.thruplays / d.plays : null))} />
        <Kpi label="Reach" value={formatNumber(cur.reach, { compact: true })} sub={`tần suất ${cur.reach ? (cur.impressions / cur.reach).toFixed(2) : '—'}`} d={delta(cur.reach, prev.reach)} spark={spark((d) => d.reach)} />
      </div>

      <Group n={2} title="Phễu" sub={`Impressions → kết quả → trial → subscribe, cửa sổ L${win}; cột “Kết quả camp” là tổng 30 ngày vì Meta không cho event tuỳ chỉnh theo ngày`} />
      <Funnel k={cur} campaigns={data.campaigns} />

      <Group n={3} title="Cảnh báo" sub="Tự tính từ 7 ngày gần nhất so với 7 ngày trước, geo, tần suất, ad đốt tiền" />
      {alerts.length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">Không có gì bất thường.</div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {alerts.map((a, i) => (
            <AlertRow key={i} a={a} />
          ))}
        </div>
      )}

      <Group n={4} title="Trend theo ngày" sub="Cột = chi tiêu (USD), đường tím = CTR (%), đường cam = CPM (USD)" />
      <DailyChart rows={derived.all} />

      <Group n={5} title="Campaign" sub="30 ngày. Chấm xanh = đang chạy. Mỗi campaign tối ưu một event khác nhau, xem dòng nhỏ dưới cột Kết quả" />
      <CampaignTable rows={data.campaigns} />

      <Group n={6} title="Creative" sub="Từng video/ad trong từng campaign. Hàng đỏ nhạt = đang chạy, chi trên $20, chưa ra kết quả" />
      <CreativeTable rows={data.ads} />

      <Group n={7} title="Geo" sub="Top 20 nước theo chi tiêu. Nhãn PAID = nằm trong danh sách Paid Countries của team" />
      <GeoTable p={data} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <Group n={8} title="Placement" sub="Nền tảng · vị trí · thiết bị, từ $1 trở lên" />
          <PlacementTable p={data} />
        </div>
        <div>
          <Group n={9} title="Tuổi × giới" sub="Ô càng đậm càng nhiều tiền. CPM tăng theo tuổi nhưng CTR cũng tăng" />
          <DemoGrid p={data} />
        </div>
      </div>
    </div>
  );
}
