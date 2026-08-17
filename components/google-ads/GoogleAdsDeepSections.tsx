'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import {
  buildGoogleAdsDeep,
  type GadsCountryRow,
  type GadsKeywordRow,
  type QsCulprit,
} from '@/lib/market/googleAdsDeep';
import { FX_NOTE } from '@/lib/config/fx';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// The five Google Ads tabs that diagnose rather than total. Each section is
// collapsible and renders nothing at all when its tab is absent, so the page
// degrades cleanly on an export that didn't include everything.

const usd = (n: number | null) => (n === null ? '—' : `$${n < 10 ? n.toFixed(2) : Math.round(n)}`);

function Section({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold text-slate-800">{title}</span>
        {hint && <span className="hidden text-[10px] text-slate-500 sm:inline">— {hint}</span>}
        <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-2 border-t border-slate-200 p-3">{children}</div>}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded border border-slate-200 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn('text-lg font-semibold', tone ?? 'text-slate-900')}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------

const CULPRIT_LABEL: Record<QsCulprit, string> = {
  lp: 'Landing page',
  ad: 'Độ liên quan của ad',
  ctr: 'CTR kỳ vọng',
  none: 'Không có điểm yếu',
  unknown: 'Chưa có đánh giá',
};

const CULPRIT_FIX: Record<QsCulprit, string> = {
  lp: 'Sửa trang đích: nội dung khớp với cụm người dùng gõ, tốc độ tải, mobile. Sửa một lần thì mọi keyword trỏ về trang đó đều được hưởng.',
  ad: 'Viết lại headline/description trong ad group để nhắc đúng cụm từ. Rẻ nhất và nhanh nhất trong ba thứ.',
  ctr: 'Google dự đoán ít người bấm. Chậm cải thiện nhất — thường phải đổi cách viết ad hoặc bỏ keyword.',
  none: '—',
  unknown: '—',
};

function QsBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  if (!v) return <span className="text-[10px] text-slate-300">—</span>;
  const bad = v === 'BELOW_AVERAGE';
  const good = v === 'ABOVE_AVERAGE';
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded px-1 text-[9px] font-medium',
        bad ? 'bg-rose-100 text-rose-700' : good ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
      )}
    >
      {bad ? 'dưới TB' : good ? 'trên TB' : 'trung bình'}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function GoogleAdsDeepSections() {
  const { data } = useSheetData();
  const deep = useMemo(() => buildGoogleAdsDeep(data), [data]);
  const [qsFilter, setQsFilter] = useState<'weak' | 'all'>('weak');
  const [countryFilter, setCountryFilter] = useState<
    'spending' | 'all' | 'excluded' | 'uncapped' | 'no-revenue'
  >('spending');

  const countryRows = useMemo<GadsCountryRow[]>(() => {
    const rs = deep.country?.rows ?? [];
    switch (countryFilter) {
      case 'all': return rs;
      case 'excluded': return rs.filter((r) => r.excluded);
      case 'uncapped': return rs.filter((r) => r.costUsd > 0 && r.capUsd === null);
      case 'no-revenue':
        return rs.filter((r) => r.costUsd > 0 && (r.valuePerInstall === null || r.valuePerInstall <= 0));
      default: return rs.filter((r) => r.costUsd > 0);
    }
  }, [deep.country, countryFilter]);

  const qsRows = useMemo<GadsKeywordRow[]>(() => {
    const rs = deep.quality?.rows ?? [];
    return qsFilter === 'weak' ? rs.filter((r) => r.weakParts.length > 0 || (r.qs !== null && r.qs < 5)) : rs;
  }, [deep.quality, qsFilter]);

  if (!deep.country && !deep.quality && !deep.bidding && deep.devices.length === 0 && !deep.assets) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* ---------------- Country × CPI cap ---------------- */}
      {deep.country && (
        <Section
          title="Chi phí theo nước · đối chiếu trần CPI"
          hint="cột duy nhất của Google nối được với PerGeo_CPI_Cap"
          defaultOpen
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Tổng chi"
              value={usd(deep.country.totalCostUsd)}
              sub={`${deep.country.rows.filter((r) => r.costUsd > 0).length} nước có chi`}
            />
            <Stat
              label="Vào nước đang exclude"
              value={usd(deep.country.excludedCostUsd)}
              sub="danh sách exclude bên App Store"
              tone={deep.country.excludedCostUsd > 0 ? 'text-rose-600' : 'text-slate-900'}
            />
            <Stat
              label="Chưa có trần CPI"
              value={usd(deep.country.uncappedCostUsd)}
              sub={`${deep.country.uncappedCount} nước không có trong PerGeo_CPI_Cap`}
              tone={deep.country.uncappedCount > 0 ? 'text-amber-700' : 'text-slate-900'}
            />
            <Stat
              label="Vào nước không ra doanh thu"
              value={usd(deep.country.noRevenueCostUsd)}
              sub={`${deep.country.noRevenueCount} nước, $0 doanh thu ghi nhận`}
              tone={deep.country.noRevenueCostUsd > 0 ? 'text-rose-600' : 'text-slate-900'}
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value as typeof countryFilter)}
              className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="spending">Nước có chi tiền</option>
              <option value="excluded">Nước đang exclude bên App Store</option>
              <option value="uncapped">Chưa có trần CPI</option>
              <option value="no-revenue">Chưa ra doanh thu</option>
              <option value="all">Tất cả</option>
            </select>
            <span className="text-[10px] text-slate-500">{countryRows.length} nước</span>
          </div>

          <div className="max-h-[46vh] overflow-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Nước</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Chi</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Clicks</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CTR</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CPC</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium" title="Google conversions — gồm cả page view, KHÔNG phải install">
                    Cost / conv
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Trần CPI</th>
                  <th
                    className="whitespace-nowrap px-2 py-1.5 text-right font-medium"
                    title="Doanh thu ÷ install ở nước đó — kênh nào đưa người dùng tới không làm thay đổi giá trị của họ"
                  >
                    Giá trị 1 ins
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Camp</th>
                </tr>
              </thead>
              <tbody>
                {countryRows.map((r) => {
                  const over = r.capUsd !== null && r.cpaUsd !== null && r.cpaUsd > r.capUsd;
                  return (
                    <tr key={r.country} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className="font-medium text-slate-800">{r.country}</span>
                        {r.rank !== null && <span className="ml-1 text-[9px] text-slate-400">#{r.rank}</span>}
                        {r.tier1 && (
                          <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-600">T1</span>
                        )}
                        {r.excluded && (
                          <span
                            className="ml-1 rounded bg-rose-100 px-1 text-[9px] font-medium text-rose-700"
                            title="Nước này nằm trong danh sách exclude của App Store Ads — nhưng Google vẫn đang chi tiền vào đây."
                          >
                            exclude
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-slate-800">
                        {usd(r.costUsd)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                        {formatNumber(r.clicks)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
                        {r.ctr === null ? '—' : formatPercent(r.ctr)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                        {usd(r.cpcUsd)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]',
                          over ? 'font-semibold text-rose-600' : 'text-slate-700',
                        )}
                      >
                        {usd(r.cpaUsd)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
                        {r.capUsd === null ? (
                          <span className="text-amber-600" title="Nước này chưa có dòng trong PerGeo_CPI_Cap">
                            chưa đặt
                          </span>
                        ) : (
                          usd(r.capUsd)
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]">
                        {r.valuePerInstall === null ? (
                          <span className="text-slate-300" title="Nước này không có trong khối doanh thu">
                            —
                          </span>
                        ) : (
                          <span
                            className={cn(
                              r.valuePerInstall <= 0
                                ? 'font-semibold text-rose-600'
                                : r.cpaUsd !== null && r.cpaUsd > r.valuePerInstall
                                  ? 'font-semibold text-rose-600'
                                  : 'text-slate-700',
                            )}
                            title={
                              r.valuePerInstall <= 0
                                ? 'Nước này chưa tạo ra doanh thu nào — mọi đồng chi vào đây là lỗ.'
                                : r.cpaUsd !== null && r.cpaUsd > r.valuePerInstall
                                  ? `Cost/conv (${usd(r.cpaUsd)}) đã cao hơn giá trị một install (${usd(r.valuePerInstall)}) — mà cost/conv còn dễ dãi hơn CPI thật.`
                                  : undefined
                            }
                          >
                            {usd(r.valuePerInstall)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-[11px] text-slate-500">{r.campaigns}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] leading-snug text-slate-500">
            <b>Cost / conv</b> dùng cột <code className="text-[9px]">conversions</code> của Google — cột đó gồm cả page
            view, nên nó <b>không phải CPI</b> và luôn thấp hơn CPI thật. Đặt cạnh trần chỉ để thấy thứ tự lớn nhỏ: một
            nước đã vượt trần ngay ở con số dễ dãi này thì CPI thật còn tệ hơn. {FX_NOTE}
          </div>
        </Section>
      )}

      {/* ---------------- Quality Score ---------------- */}
      {deep.quality && (
        <Section title="Quality Score · điểm yếu nằm ở đâu" hint="ad relevance / landing page / CTR kỳ vọng">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="QS dưới 5"
              value={String(deep.quality.lowQsCount)}
              sub={`trên ${deep.quality.rows.length} keyword`}
              tone={deep.quality.lowQsCount > 0 ? 'text-rose-600' : 'text-slate-900'}
            />
            <Stat
              label="Chi vào keyword yếu"
              value={usd(deep.quality.weakCostUsd)}
              sub={
                deep.quality.totalCostUsd > 0
                  ? `${formatPercent(deep.quality.weakCostUsd / deep.quality.totalCostUsd)} tổng chi keyword`
                  : undefined
              }
              tone={deep.quality.weakCostUsd > 0 ? 'text-amber-700' : 'text-slate-900'}
            />
            {deep.quality.byCulprit.slice(0, 2).map((c) => (
              <Stat
                key={c.culprit}
                label={CULPRIT_LABEL[c.culprit]}
                value={String(c.keywords)}
                sub={`keyword · ${usd(c.costUsd)}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {deep.quality.byCulprit.map((c) => (
              <div key={c.culprit} className="rounded border border-slate-200 p-2">
                <div className="text-[11px] font-semibold text-slate-800">{CULPRIT_LABEL[c.culprit]}</div>
                <div className="text-[10px] text-slate-500">
                  {c.keywords} keyword · {usd(c.costUsd)}
                </div>
                <div className="mt-1 text-[10px] leading-snug text-slate-600">{CULPRIT_FIX[c.culprit]}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={qsFilter}
              onChange={(e) => setQsFilter(e.target.value as 'weak' | 'all')}
              className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="weak">Chỉ keyword có điểm yếu</option>
              <option value="all">Tất cả keyword</option>
            </select>
            <span className="text-[10px] text-slate-500">{qsRows.length} keyword</span>
          </div>

          <div className="max-h-[46vh] overflow-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Keyword</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">QS</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-center font-medium">Ad</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-center font-medium">Landing</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-center font-medium">CTR</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Chi</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CTR thực</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Sửa gì trước</th>
                </tr>
              </thead>
              <tbody>
                {qsRows.map((r) => (
                  <tr key={`${r.campaignName}||${r.adgroupName}||${r.keyword}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className="font-medium text-slate-800">{r.keyword}</span>
                      <div className="text-[9px] text-slate-400">
                        {r.matchType} · {r.campaignName}
                      </div>
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[12px] font-semibold',
                        r.qs === null ? 'text-slate-300' : r.qs < 5 ? 'text-rose-600' : r.qs >= 8 ? 'text-emerald-700' : 'text-slate-800',
                      )}
                    >
                      {r.qs ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center"><QsBadge value={r.qsAd} /></td>
                    <td className="px-2 py-1.5 text-center"><QsBadge value={r.qsLp} /></td>
                    <td className="px-2 py-1.5 text-center"><QsBadge value={r.qsCtr} /></td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">
                      {usd(r.costUsd)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
                      {r.ctr === null ? '—' : formatPercent(r.ctr)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-[11px] text-slate-600">
                      {r.weakParts.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span title={CULPRIT_FIX[r.culprit]} className="cursor-help">
                          {CULPRIT_LABEL[r.culprit]}
                          {r.weakParts.length > 1 && (
                            <span className="ml-1 text-[9px] text-amber-700">+{r.weakParts.length - 1} nữa</span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ---------------- Bid strategy ---------------- */}
      {deep.bidding && (
        <Section title="Chiến lược bid · target vs thực tế" hint="target CPA đặt ra so với CPA và CPI thật">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Vượt target CPA"
              value={String(deep.bidding.overTargetCount)}
              sub="camp trả cao hơn target của chính nó"
              tone={deep.bidding.overTargetCount > 0 ? 'text-rose-600' : 'text-slate-900'}
            />
            <Stat
              label="Không đặt target"
              value={String(deep.bidding.noTargetCount)}
              sub={`camp · ${usd(deep.bidding.noTargetCostUsd)}`}
              tone={deep.bidding.noTargetCount > 0 ? 'text-amber-700' : 'text-slate-900'}
            />
            <Stat label="Tổng camp" value={String(deep.bidding.rows.length)} />
          </div>
          <div className="max-h-[40vh] overflow-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Campaign</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Chiến lược</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Target CPA</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium" title="Google conversions (gồm page view)">
                    CPA thực
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium" title="Chỉ tính conversion action là install">
                    CPI thực
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Chi</th>
                </tr>
              </thead>
              <tbody>
                {deep.bidding.rows.map((r) => (
                  <tr key={r.campaignName} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-2 py-1.5 text-[11px] font-medium text-slate-800">
                      {r.campaignName}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-slate-500">
                      {r.bidStrategy.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                      {r.targetCpaUsd === null ? (
                        <span className="text-amber-600" title="Chiến lược này không đặt target CPA">chưa đặt</span>
                      ) : (
                        usd(r.targetCpaUsd)
                      )}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]',
                        r.vsTarget !== null && r.vsTarget > 0 ? 'font-semibold text-rose-600' : 'text-slate-700',
                      )}
                    >
                      {usd(r.actualCpaUsd)}
                      {r.vsTarget !== null && (
                        <span className="ml-1 text-[9px] font-normal text-slate-400">
                          {r.vsTarget > 0 ? '+' : ''}
                          {Math.round(r.vsTarget * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-800">
                      {usd(r.actualCpiUsd)}
                      {r.installs > 0 && (
                        <span className="ml-1 text-[9px] font-normal text-slate-400">{r.installs} ins</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">
                      {usd(r.costUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] leading-snug text-slate-500">
            Target CPA của Google được đo bằng cột <code className="text-[9px]">conversions</code> của nó — cột gồm cả
            page view. Cột <b>CPI thực</b> chỉ đếm conversion action là install, nên nó luôn cao hơn và là con số nên
            dùng để đánh giá target có hợp lý không.
          </div>
        </Section>
      )}

      {/* ---------------- Device ---------------- */}
      {deep.devices.length > 0 && (
        <Section title="Thiết bị" hint="chi tiêu và hiệu quả theo desktop / mobile / tablet">
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Thiết bị</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Chi</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">% chi</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Impressions</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Clicks</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CTR</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CPC</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Cost / conv</th>
                </tr>
              </thead>
              <tbody>
                {deep.devices.map((r) => (
                  <tr key={r.device} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-2 py-1.5 text-[11px] font-medium text-slate-800">
                      {r.device.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-slate-800">{usd(r.costUsd)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">{formatPercent(r.costShare)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">{formatNumber(r.impressions)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">{formatNumber(r.clicks)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">{r.ctr === null ? '—' : formatPercent(r.ctr)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">{usd(r.cpcUsd)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-700">{usd(r.cpaUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ---------------- RSA assets ---------------- */}
      {deep.assets && (
        <Section title="Asset quảng cáo · cái nào nên thay" hint="nhãn của Google + CTR so với trung vị cùng loại">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Google gắn nhãn LOW"
              value={String(deep.assets.lowCount)}
              sub={`trên ${deep.assets.rows.length} asset`}
              tone={deep.assets.lowCount > 0 ? 'text-rose-600' : 'text-slate-900'}
            />
            <Stat
              label="CTR dưới trung vị"
              value={String(deep.assets.belowMedianCount)}
              sub="asset đủ hiển thị để so"
              tone={deep.assets.belowMedianCount > 0 ? 'text-amber-700' : 'text-slate-900'}
            />
            <Stat label="Loại asset" value={String(deep.assets.byFieldType.length)} sub="headline, description, sitelink…" />
          </div>
          <div className="max-h-[40vh] overflow-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Nội dung</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Loại</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">Nhãn Google</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">Impressions</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">CTR</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium" title="So với trung vị CTR của cùng loại asset">
                    vs trung vị
                  </th>
                </tr>
              </thead>
              <tbody>
                {deep.assets.rows.slice(0, 200).map((r) => (
                  <tr key={`${r.campaignName}|${r.adgroupName}|${r.assetText}|${r.fieldType}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="max-w-[20rem] px-2 py-1.5 text-[11px] text-slate-800">{r.assetText || '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-slate-500">{r.fieldType.toLowerCase()}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span
                        className={cn(
                          'rounded px-1 text-[9px] font-medium',
                          r.perfLabel.toUpperCase() === 'LOW'
                            ? 'bg-rose-100 text-rose-700'
                            : r.perfLabel.toUpperCase() === 'BEST'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {r.perfLabel.replace(/_/g, ' ').toLowerCase() || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">{formatNumber(r.impressions)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] text-slate-600">{r.ctr === null ? '—' : formatPercent(r.ctr)}</td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px]',
                        r.vsMedian === null ? 'text-slate-300' : r.vsMedian < 0 ? 'text-rose-600' : 'text-emerald-700',
                      )}
                    >
                      {r.vsMedian === null ? '—' : `${r.vsMedian > 0 ? '+' : ''}${Math.round(r.vsMedian * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] leading-snug text-slate-500">
            Google <b>không</b> báo chi phí ở mức asset, nên không tính được cost-per-asset. So sánh duy nhất có được là
            CTR với trung vị của <b>cùng loại</b> asset — headline không so được với sitelink. Asset dưới 100 lượt hiển
            thị không được đưa vào trung vị vì CTR ở cỡ đó là một hai cú click, không phải tỷ lệ.
          </div>
        </Section>
      )}
    </div>
  );
}
