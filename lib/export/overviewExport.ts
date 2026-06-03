'use client';

import type { SheetPayload } from '@/lib/sheets/types';
import {
  exportKeywordRows,
  exportCountryRows,
  keywordTableForRange,
  topCountriesFor,
  categoryShareFor,
  categoryShareForRange,
  computeKpis,
  kpisForRange,
  dailyTrend,
  type OverviewWindow,
  type OverviewFilters,
} from '@/components/overview/aggregate';
import { pct, type Cell, type ExportSheet } from './exporters';

export interface OverviewView {
  window: OverviewWindow;
  filters: OverviewFilters;
  dateRange: { from: string; to: string } | null;
}

const surfaceLabel = (s: string) => (s === 'search_ad' ? 'paid' : 'organic');
const deltaInstall = (l: number, p: number): string => (p > 0 ? pct((l - p) / p) : '');

function filtersText(f: OverviewFilters): string {
  return (
    [
      f.surface && f.surface !== 'all' ? f.surface : null,
      f.country,
      f.keyword ? `kw:${f.keyword}` : null,
      f.category ? `cat:${f.category}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'không'
  );
}

/** Build the full set of Overview sheets (every row, all columns) for the current view. */
export function buildOverviewSheets(data: SheetPayload | undefined, view: OverviewView): ExportSheet[] {
  const { window, filters, dateRange } = view;
  const scope = dateRange
    ? dateRange.from === dateRange.to
      ? dateRange.from
      : `${dateRange.from} → ${dateRange.to}`
    : window;

  const sheets: ExportSheet[] = [];

  // ── Info ──
  sheets.push({
    name: 'Info',
    rows: [
      ['TrueProfit ASO — Overview export'],
      ['Phạm vi', scope],
      ['Bộ lọc', filtersText(filters)],
      ['Lưu ý', 'Full data của view hiện tại (mọi keyword, đủ cột). Δ = so với kỳ trước.'],
    ],
  });

  if (dateRange) {
    // ===== DATE MODE — per-day data (deduped) =====
    const k = kpisForRange(data, dateRange.from, dateRange.to, filters);
    sheets.push({
      name: 'KPIs',
      rows: [
        ['Chỉ số', 'Giá trị', 'Δ vs kỳ trước'],
        ['Users', k.usersL, pct(k.usersDeltaPct)],
        ['Install (per-day)', k.getAppL ?? '', pct(k.getAppDeltaPct)],
        ['CR', k.cr !== null ? pct(k.cr) : '', ''],
      ],
    });

    const kw = keywordTableForRange(data, dateRange.from, dateRange.to, filters);
    sheets.push({
      name: 'Keywords (per-day)',
      rows: [
        ['Keyword', 'Category', 'Surface', 'Users', 'Install', 'CR'],
        ...kw.map((r): Cell[] => [
          r.keyword,
          r.category,
          r.surface,
          r.users,
          r.install ?? '',
          r.cr !== null ? pct(r.cr) : '',
        ]),
      ],
    });

    const cat = categoryShareForRange(data, dateRange.from, dateRange.to, filters);
    sheets.push({
      name: 'Category Share',
      rows: [
        ['Category', 'Users', 'Install', 'Share %', 'CR'],
        ...cat.map((c): Cell[] => [c.category, c.users, c.getApp, pct(c.share), pct(c.cr)]),
      ],
    });
    return sheets;
  }

  // ===== WINDOW MODE — full rolling-window tables =====
  const kpi = computeKpis(data, window, filters);
  const totalCr = kpi.usersL > 0 ? kpi.getAppL / kpi.usersL : null;
  sheets.push({
    name: 'KPIs',
    rows: [
      ['Chỉ số', `Giá trị (${window})`, 'Δ vs kỳ trước'],
      ['Users', kpi.usersL, pct(kpi.usersDeltaPct)],
      ['Install', kpi.getAppL, pct(kpi.getAppDeltaPct)],
      ['CR', totalCr !== null ? pct(totalCr) : '', ''],
      ['Alerts', kpi.totalAlerts, ''],
    ],
  });

  // Full keyword table (global / filtered) — every row, all columns.
  const rows = exportKeywordRows(data, window, filters);
  const hasCountry = rows.some((r) => r.country);
  const kwHeader: Cell[] = ['Category', 'Search Term'];
  if (hasCountry) kwHeader.push('Country');
  kwHeader.push(
    'Surface',
    'Users L',
    'Users P',
    'Δ Users %',
    'Install L',
    'Install P',
    'Δ Install %',
    'CR L',
    'CR P',
    'Δ CR %',
    'Pos L',
    'Pos P',
    'Δ Pos %',
    'Alert',
  );
  sheets.push({
    name: 'Keywords',
    rows: [
      kwHeader,
      ...rows.map((r): Cell[] => {
        const base: Cell[] = [r.category, r.searchTerm];
        if (hasCountry) base.push(r.country ?? '');
        return [
          ...base,
          surfaceLabel(r.surface),
          r.usersL,
          r.usersP,
          pct(r.deltaUsersPct / 100),
          r.getAppL,
          r.getAppP,
          deltaInstall(r.getAppL, r.getAppP),
          r.crL !== null ? pct(r.crL) : '',
          r.crP !== null ? pct(r.crP) : '',
          r.deltaCrPct !== null ? pct(r.deltaCrPct / 100) : '',
          r.posL ?? '',
          r.posP ?? '',
          r.deltaPosPct !== null ? pct(r.deltaPosPct / 100) : '',
          r.alert,
        ];
      }),
    ],
  });

  // Full keyword × country table.
  const cRows = exportCountryRows(data, window, {
    surface: filters.surface,
    keyword: filters.keyword,
    category: filters.category,
  });
  sheets.push({
    name: 'Keywords x Country',
    rows: [
      [
        'Category',
        'Search Term',
        'Country',
        'Surface',
        'Users L',
        'Users P',
        'Δ Users %',
        'Install L',
        'Install P',
        'CR L',
        'Pos L',
        'Alert',
      ],
      ...cRows.map((r): Cell[] => [
        r.category,
        r.searchTerm,
        r.country ?? '',
        surfaceLabel(r.surface),
        r.usersL,
        r.usersP,
        pct(r.deltaUsersPct / 100),
        r.getAppL,
        r.getAppP,
        r.crL !== null ? pct(r.crL) : '',
        r.posL ?? '',
        r.alert,
      ]),
    ],
  });

  // Country rollup (every country, not just top N).
  const countries = topCountriesFor(data, window, 9999, filters);
  sheets.push({
    name: 'Top Countries',
    rows: [
      ['Country', 'Users', 'Install', 'CR', 'Alerts'],
      ...countries.map((c): Cell[] => [c.country, c.users, c.getApp, pct(c.cr), c.alertCount]),
    ],
  });

  // Category share (all categories).
  const cats = categoryShareFor(data, window, filters);
  sheets.push({
    name: 'Category Share',
    rows: [
      ['Category', 'Users', 'Install', 'Share %', 'CR'],
      ...cats.map((c): Cell[] => [c.category, c.users, c.getApp, pct(c.share), pct(c.cr)]),
    ],
  });

  // Daily trend series (per-day).
  const trend = dailyTrend(data, filters);
  sheets.push({
    name: 'Daily Trend',
    rows: [
      ['Date', 'Users', 'Install', 'CR'],
      ...trend.map((d): Cell[] => [d.date, d.users, d.getApp ?? '', d.cr !== null ? pct(d.cr) : '']),
    ],
  });

  return sheets;
}
