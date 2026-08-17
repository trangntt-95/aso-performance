'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Megaphone, Search, X } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from '@/components/shared/Sparkline';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import {
  buildGoogleAdsReport,
  VERDICT_META,
  type CampaignRow,
  type ShareVerdict,
} from '@/lib/market/googleAdsReport';
import { BrandDemandTable } from './BrandDemandTable';
import { GoogleAdsDeepSections } from './GoogleAdsDeepSections';
import { cn } from '@/lib/utils';

// Google Ads — a separate channel, reported on its own terms.
//
// Two things shape this page. First, the account is in VND while the rest of the
// dashboard is USD, so nothing here is converted or compared across channels;
// every figure carries its own currency. Second, Google's "conversions" number
// is mostly page views (341 of the first 425), so cost-per-install is computed
// from the install conversion ACTIONS only — using the blended number would make
// the channel look several times cheaper than it is.

type SortKey = 'cost' | 'clicks' | 'impressions' | 'installs' | 'cpc' | 'cpi' | 'is' | 'lostBudget' | 'name';
type SortDir = 'asc' | 'desc';

function SortHead({
  label, col, sortKey, sortDir, onSort, align = 'left', extra, title,
}: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; align?: 'left' | 'right'; extra?: string; title?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      title={title}
      className={cn(
        'cursor-pointer select-none px-2 py-2 font-medium hover:text-slate-900',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-indigo-700',
        extra,
      )}
    >
      <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'flex-row-reverse')}>
        {label}
        <span className="w-2 text-[9px] text-indigo-600">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
      </span>
    </th>
  );
}

/** Divider that opens a group of related cards. */
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

export function GoogleAdsView() {
  const { data, isLoading, error } = useSheetData();
  const report = useMemo(() => (data ? buildGoogleAdsReport(data.googleAds) : null), [data]);

  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<ShareVerdict | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'name' ? 'asc' : 'desc');
    }
  };

  // Money is shown in the account's own currency. VND has no useful decimals and
  // very large magnitudes, so it gets compact grouping rather than cents.
  const cur = report?.currency || '';
  const money = (n: number | null, opts?: { compact?: boolean }) => {
    if (n === null || !Number.isFinite(n)) return '—';
    if (cur === 'VND') {
      return opts?.compact
        ? `${formatNumber(Math.round(n), { compact: true })}₫`
        : `${Math.round(n).toLocaleString('vi-VN')}₫`;
    }
    return `${n.toFixed(2)} ${cur}`;
  };

  const filtered = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    const rows = report.campaigns.filter((r) => {
      if (verdictFilter !== 'all' && r.verdict !== verdictFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const val = (r: CampaignRow): number | string | null => {
      switch (sortKey) {
        case 'clicks': return r.clicks;
        case 'impressions': return r.impressions;
        case 'installs': return r.installs;
        case 'cpc': return r.cpc;
        case 'cpi': return r.cpi;
        case 'is': return r.is;
        case 'lostBudget': return r.lostBudget;
        case 'name': return r.name.toLowerCase();
        default: return r.cost;
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      // Rows with no value for the sorted column always sink, so reversing never
      // promotes a blank above a real number.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const base = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : (va as number) - (vb as number);
      return base * dir || b.cost - a.cost;
    });
  }, [report, search, verdictFilter, sortKey, sortDir]);

  const verdictCounts = useMemo(() => {
    const m = new Map<ShareVerdict, number>();
    report?.campaigns.forEach((r) => m.set(r.verdict, (m.get(r.verdict) ?? 0) + 1));
    return m;
  }, [report]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-rose-500" />
        <div className="font-semibold">Couldn’t load data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <b>Chưa có dữ liệu Google Ads.</b> Trang này đọc sheet &quot;Google ads - Appscript&quot;. Nếu biến môi trường{' '}
        <code className="text-[10px]">GOOGLE_SHEET_ID_GADS</code> chưa cấu hình, sheet chưa share cho service account,
        hoặc tab <code className="text-[10px]">campaign_daily</code> còn trống thì bảng sẽ không có gì.
      </div>
    );
  }

  const t = report.totals;
  const installShare = t.conversions > 0 ? t.installs / t.conversions : null;

  return (
    <div className="space-y-3">
      {/* Context first: this is a different channel, in a different currency. */}
      <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <div className="space-y-0.5">
          <div>
            <b>Google Ads</b> — {report.from} → {report.to} ({report.days} ngày) · tài khoản{' '}
            <b>{report.account || '—'}</b> · tiền tệ <b>{report.currency || '—'}</b>
          </div>
          <div className="text-[11px] text-indigo-800">
            Đây là <b>kênh khác</b> với Shopify App Store Ads: campaign và keyword không trùng nhau, và tiền ở đây là{' '}
            {report.currency || 'nội tệ'} trong khi phần còn lại của dashboard là USD — nên trang này{' '}
            <b>không quy đổi và không so trực tiếp</b> với các tab kia.
          </div>
        </div>
      </div>

      <Group n={1} title="Tài khoản đang tiêu bao nhiêu, đổi lại được gì" sub="tổng quan · con số nào là install thật" />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        {([
          ['Chi phí', money(t.cost, { compact: true }), `${money(t.cost)} trong ${report.days} ngày`],
          ['Clicks', formatNumber(t.clicks), `CTR ${t.ctr === null ? '—' : formatPercent(t.ctr)}`],
          ['CPC', money(t.cpc), 'chi phí / click'],
          ['Impressions', formatNumber(t.impressions, { compact: true }), 'lượt hiển thị'],
          ['Install', t.installs.toFixed(1), 'chỉ đếm hành động install thật'],
          ['CPI', money(t.cpi), 'chi phí / install'],
        ] as const).map(([label, value, hint]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[10px] text-slate-500">{label}</div>
            <div className="font-mono text-lg font-bold text-slate-900">{value}</div>
            <div className="text-[9px] text-slate-400">{hint}</div>
          </div>
        ))}
      </div>

      {/* The single most misread number in this export. */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          &quot;Conversions&quot; gồm những gì
        </div>
        <div className="mt-1 text-[11px] text-slate-600">
          Google đếm <b>{t.conversions.toFixed(1)}</b> conversions, nhưng phần lớn là <b>lượt xem trang</b>. Chỉ{' '}
          <b>{t.installs.toFixed(1)}</b> ({installShare === null ? '—' : formatPercent(installShare)}) là install thật.
          Mọi chỉ số CPI trên trang này dùng con số install, không dùng tổng conversions — nếu dùng tổng thì kênh này sẽ
          trông rẻ hơn thực tế nhiều lần.
        </div>
        <div className="mt-2 space-y-0.5">
          {report.convActions.slice(0, 8).map((a) => (
            <div key={a.action} className="flex items-baseline gap-2 text-[10px]">
              <span className="w-14 shrink-0 text-right font-mono font-semibold text-slate-800">
                {a.conversions.toFixed(1)}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded px-1 text-[9px] font-medium',
                  a.isInstall ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500',
                )}
              >
                {a.isInstall ? 'install' : a.category.toLowerCase()}
              </span>
              <span className="truncate text-slate-600">{a.action}</span>
            </div>
          ))}
        </div>
      </div>

      <Group
        n={2}
        title="Từng campaign đang chạy ra sao"
        sub="click đẩy về đâu · xu hướng theo ngày · mất hiển thị vì ngân sách hay vì thứ hạng"
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Where the clicks land — the one real link to the ASO side. */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Quảng cáo đẩy về đâu
          </div>
          <table className="mt-2 w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 text-left font-medium">Đích</th>
                <th className="py-1 text-right font-medium">Chi phí</th>
                <th className="py-1 text-right font-medium">Clicks</th>
                <th className="py-1 text-right font-medium">CPC</th>
              </tr>
            </thead>
            <tbody>
              {report.destinations.map((d) => (
                <tr key={d.destination} className="border-t">
                  <td className="py-1.5">
                    <span className="font-medium text-slate-800">
                      {d.destination === 'appstore'
                        ? 'Trang app Shopify'
                        : d.destination === 'website'
                          ? 'Website trueprofit.io'
                          : 'Khác'}
                    </span>
                    {d.destination === 'appstore' && (
                      <div className="text-[9px] text-slate-400">cùng listing mà các tab ASO đang đo</div>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-mono">{money(d.cost, { compact: true })}</td>
                  <td className="py-1.5 text-right font-mono">{formatNumber(d.clicks)}</td>
                  <td className="py-1.5 text-right font-mono">{money(d.cpc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-[9px] text-slate-400">
            Install không tách được theo đích — export không kèm tên conversion action ở cấp landing page.
          </div>
        </div>

        {/* Daily trend */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Theo ngày</div>
          <div className="mt-2 space-y-2">
            {([
              ['Chi phí', report.daily.map((d) => ({ t: Date.parse(d.date), v: d.cost })), '#4f46e5'],
              ['Clicks', report.daily.map((d) => ({ t: Date.parse(d.date), v: d.clicks })), '#0d9488'],
              ['Install', report.daily.map((d) => ({ t: Date.parse(d.date), v: d.installs })), '#059669'],
            ] as const).map(([label, points, colour]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] text-slate-500">{label}</span>
                <Sparkline points={[...points]} width={180} height={26} stroke={colour} />
                <span className="font-mono text-[10px] text-slate-600">
                  {label === 'Chi phí'
                    ? money(report.daily.reduce((s, d) => s + d.cost, 0) / Math.max(1, report.days), { compact: true }) + '/ngày'
                    : label === 'Clicks'
                      ? (report.daily.reduce((s, d) => s + d.clicks, 0) / Math.max(1, report.days)).toFixed(1) + '/ngày'
                      : (report.daily.reduce((s, d) => s + d.installs, 0) / Math.max(1, report.days)).toFixed(1) + '/ngày'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] text-slate-400">
            Mới có {report.days} ngày dữ liệu — chưa đủ để so kỳ này với kỳ trước (cần gấp đôi).
          </div>
        </div>
      </div>

      {/* Impression share: the most actionable thing this export carries. */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Đang mất lượt hiển thị vì đâu
        </div>
        <div className="mt-1 text-[11px] text-slate-600">
          Google cho biết mỗi campaign lấy được bao nhiêu phần lượt hiển thị có thể lấy, và phần mất đi là vì{' '}
          <b>hết ngân sách</b> hay vì <b>thua thứ hạng</b>. Hai nguyên nhân này cần hai cách xử lý khác hẳn nhau — đây là
          thứ Shopify Ads không hề có.
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setVerdictFilter('all')}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition',
              verdictFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            Tất cả {report.campaigns.length}
          </button>
          {(['budget', 'rank', 'healthy', 'unknown'] as ShareVerdict[]).map((v) => {
            const n = verdictCounts.get(v) ?? 0;
            if (n === 0) return null;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVerdictFilter(verdictFilter === v ? 'all' : v)}
                title={VERDICT_META[v].action}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  verdictFilter === v ? 'ring-2 ring-slate-900 ring-offset-1' : '',
                  VERDICT_META[v].tone,
                )}
              >
                {VERDICT_META[v].label} <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Campaign table */}
      <div className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        Bảng campaign chi tiết
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <div className="relative min-w-[150px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm campaign…" className="h-7 pl-7 text-xs" />
        </div>
        {(search || verdictFilter !== 'all') && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setSearch(''); setVerdictFilter('all'); }}>
            <X className="h-3 w-3" />
            Reset
          </Button>
        )}
        <span className="ml-auto text-[11px] text-slate-500">{filtered.length} campaign</span>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
            <tr>
              <SortHead label="Campaign" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} extra="px-3 whitespace-nowrap" />
              <th className="px-2 py-2 text-left font-medium">Chặn bởi</th>
              <SortHead label="Chi phí" col="cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="Imp" col="impressions" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="Clicks" col="clicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="CPC" col="cpc" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="Install" col="installs" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Chỉ đếm hành động install thật, không phải tổng conversions" />
              <SortHead label="CPI" col="cpi" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="IS" col="is" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Impression share — phần lượt hiển thị lấy được" />
              <SortHead label="Mất do NS" col="lostBudget" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Phần lượt hiển thị mất vì hết ngân sách" />
              <th className="px-2 py-2 text-right font-medium" title="Phần lượt hiển thị mất vì thứ hạng thấp">Mất do TH</th>
              <th className="px-2 py-2 text-right font-medium" title="Tỉ lệ click dẫn về trang app Shopify">→ App</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const meta = VERDICT_META[r.verdict];
              return (
                <tr key={r.name} className="border-t align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="text-[12px] font-medium text-slate-800">{r.name}</div>
                    <div className="text-[9px] text-slate-400">
                      {r.status} · {r.days} ngày
                      {r.budget !== null && <> · ngân sách {money(r.budget, { compact: true })}/ngày</>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={cn('inline-block cursor-help whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium', meta.tone)}
                      title={meta.action}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[11px] font-semibold text-slate-800">
                    {money(r.cost, { compact: true })}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">{formatNumber(r.impressions)}</td>
                  <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">{r.clicks}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[11px] text-slate-700">{money(r.cpc, { compact: true })}</td>
                  <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-800">
                    {r.installs > 0 ? r.installs.toFixed(1) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[11px] text-slate-700">
                    {money(r.cpi, { compact: true })}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">
                    {r.is === null ? '—' : formatPercent(r.is)}
                  </td>
                  <td className={cn('px-2 py-2 text-right font-mono text-[11px]', (r.lostBudget ?? 0) >= 0.15 ? 'font-semibold text-amber-700' : 'text-slate-500')}>
                    {r.lostBudget === null ? '—' : formatPercent(r.lostBudget)}
                  </td>
                  <td className={cn('px-2 py-2 text-right font-mono text-[11px]', (r.lostRank ?? 0) >= 0.25 ? 'font-semibold text-rose-700' : 'text-slate-500')}>
                    {r.lostRank === null ? '—' : formatPercent(r.lostRank)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-500">
                    {r.appstoreClickShare === null ? '—' : formatPercent(r.appstoreClickShare)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t px-3 py-2 text-[10px] text-slate-400">
          <b>Chặn bởi</b> = nguyên nhân mất lượt hiển thị lớn nhất: ngân sách (từ 15% trở lên) hay thứ hạng (từ 25%).
          <b> IS</b> = phần lượt hiển thị lấy được. <b>→ App</b> = tỉ lệ click dẫn về trang app Shopify.
          <b> Click tiêu đề cột để sắp xếp.</b>
        </div>
      </div>

      <Group
        n={3}
        title="Vấn đề nằm ở đâu"
        sub="nước · Quality Score · chiến lược bid · thiết bị · asset — bấm để mở từng mục"
      />

      {/* Năm tab chẩn đoán: nước, Quality Score, chiến lược bid, thiết bị, asset. */}
      <GoogleAdsDeepSections />

      <Group
        n={4}
        title="Người dùng gõ gì, mình đã mua đúng chưa"
        sub="cùng cụm từ trên hai bề mặt · cụm đã hiện nhưng chưa thành keyword"
      />

      {/* Same phrase on both surfaces — the cross-channel view. */}
      <BrandDemandTable />

      {/* Search terms */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Cụm tìm kiếm đã kích hoạt quảng cáo
        </div>
        <div className="mt-1 text-[11px] leading-snug text-slate-600">
          Cụm người dùng thật sự gõ trên Google, kèm trạng thái: <b>đã thêm</b> làm keyword, <b>chưa thêm</b>, hay{' '}
          <b>đã loại</b>. Đây là chỗ quyết định thêm keyword hay thêm negative.
        </div>
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-lg border bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Search term ({report.searchTerms.length})</th>
              <th className="px-2 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-2 py-2 text-right font-medium">Chi phí</th>
              <th className="px-2 py-2 text-right font-medium">Clicks</th>
              <th className="px-2 py-2 text-right font-medium">CPC</th>
              <th className="px-2 py-2 text-right font-medium">Imp</th>
            </tr>
          </thead>
          <tbody>
            {report.searchTerms.map((s) => (
              <tr key={s.term} className="border-t hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-800">{s.term}</td>
                <td className="px-2 py-1.5">
                  {s.notAdded ? (
                    <span
                      className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      title="Người dùng gõ cụm này và quảng cáo có hiện, nhưng nó chưa được thêm làm keyword — cân nhắc thêm vào, hoặc thêm negative nếu không liên quan."
                    >
                      chưa thêm
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">đã có keyword</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">
                  {money(s.cost, { compact: true })}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">{s.clicks}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                  {money(s.cpc, { compact: true })}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">{formatNumber(s.impressions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t px-3 py-2 text-[10px] text-slate-400">
          <b>chưa thêm</b> = cụm người dùng thật sự gõ, quảng cáo có hiện, nhưng chưa nằm trong danh sách keyword. Đây là
          chỗ để quyết định: thêm làm keyword, hay thêm negative.
        </div>
      </div>
    </div>
  );
}
