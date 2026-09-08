'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useYAxisScale,
} from 'recharts';
import { AlertCircle, LayoutGrid } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AXIS_NAME,
  DEFAULT_ON,
  LABEL_GAP,
  TOTAL_GROUP,
  buildTrendCube,
  cfgOf,
  endLabelPadding,
  fmtValue,
  groupsPresent,
  layoutEndLabels,
  legendLabel,
  metricsOfGroup,
  pickFactors,
} from '@/lib/market/paidCategoryTrend';

// Trend view of the 'By categories' pivot, laid out to match Trang's own Apps
// Script dashboard (Code.gs v4 + Dashboard.html) so the two screens agree on
// every number and every label.
//
// Read-only, and nothing is recomputed from the per-day feed: that feed is
// filtered to campaigns still live in the main sheet, so recomputing August from
// it gives $3,088 where the pivot says $3,154. Reading the pivot keeps one
// answer. The aggregate TOTAL row is the one thing computed here, by the same
// rules the script uses — see paidCategoryTrend.ts.
//
// Charting is recharts, already a dependency, rather than the script's Chart.js:
// no reason to add a second charting library. The parts that matter (factor
// choice, legend wording, end-of-line label placement, dual axis) are ported
// exactly and unit-tested; only the drawing layer differs.

const AXIS_COLOR = '#57606a';

interface TipPayload {
  dataKey?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-sm">
      <div className="mb-1 text-[11px] font-semibold text-slate-700">{String(label ?? '')}</div>
      {payload.map((p) => {
        const metric = String(p.dataKey ?? '').replace(/^scaled_/, '');
        // Always the untouched value in its own unit. The factor exists to make
        // lines shareable, not to change what a number means.
        const raw = p.payload?.[`raw_${metric}`];
        return (
          <div key={metric} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="text-slate-600">{metric}</span>
            <span className="ml-auto font-mono font-medium text-slate-900">
              {fmtValue(typeof raw === 'number' ? raw : null, cfgOf(metric).fmt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Metric names printed at the end of each line, so the eye never has to travel
 * back up to the legend to know which line is which.
 *
 * Positions come from recharts' public hooks — usePlotArea for the drawing box
 * and useYAxisScale for value → pixel. The first version of this read
 * `formattedGraphicalItems` off a `<Customized>` element, which is how it worked
 * in recharts 2; recharts 3 does not pass that prop at all, so the component
 * rendered nothing and the labels simply never appeared. Computing from the
 * scales is both public API and less fragile: it needs the value, not recharts'
 * internal render state.
 *
 * Rendered as a normal child of the chart. `Customized` is deprecated in
 * recharts 3 — arbitrary elements can be children directly.
 */
function EndLabels({
  rows,
  metrics,
  axisOf,
}: {
  rows: Record<string, string | number | null>[];
  metrics: string[];
  axisOf: (metric: string) => 'L' | 'R';
}) {
  const area = usePlotArea();
  const scaleL = useYAxisScale('L');
  const scaleR = useYAxisScale('R');
  if (!area || !metrics.length) return null;

  const found: { y: number; text: string; color: string }[] = [];
  for (const m of metrics) {
    // The last period this metric actually has a number for — a line that stops
    // early should be labelled where it stops, not off the end of the chart.
    let v: number | null = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const raw = rows[i][`scaled_${m}`];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        v = raw;
        break;
      }
    }
    if (v === null) continue;
    const scale = axisOf(m) === 'R' ? scaleR : scaleL;
    if (!scale) continue;
    const y = scale(v);
    if (typeof y !== 'number' || !Number.isFinite(y)) continue;
    found.push({ y, text: m, color: cfgOf(m).color });
  }
  if (!found.length) return null;

  const ys = layoutEndLabels(
    found.map((f) => f.y),
    area.y + 4,
    area.y + area.height - 4,
    LABEL_GAP,
  );

  return (
    <g className="pct-end-labels" pointerEvents="none">
      {found.map((f, i) => (
        <text
          key={f.text}
          x={area.x + area.width + 6}
          y={ys[i]}
          fill={f.color}
          fontSize={11}
          fontWeight={600}
          dominantBaseline="middle"
        >
          {f.text}
        </text>
      ))}
    </g>
  );
}

export function PaidCategoryBoardView() {
  const { data, isLoading, error } = useSheetData();
  const board = data?.paidCategoryBoard ?? null;
  const cube = useMemo(() => (board ? buildTrendCube(board) : null), [board]);

  const [cat, setCat] = useState('');
  const [group, setGroup] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [autoScale, setAutoScale] = useState(true);
  /** Hidden metrics per group. Kept separate on purpose: switching Clicks off in
   *  the volume group must not switch it off in TOTAL. */
  const [off, setOff] = useState<Record<string, Record<string, boolean>>>({});
  const seeded = useRef(false);

  const groups = useMemo(() => (cube ? groupsPresent(cube.metrics) : []), [cube]);

  // Seed selections once. On a later read the user's choices are kept — except
  // that sitting on the newest period means "keep me on the newest": pinning the
  // old label would quietly hide a period that just arrived.
  useEffect(() => {
    if (!cube || !groups.length) return;
    const last = cube.periods[cube.periods.length - 1] ?? '';
    if (!seeded.current) {
      seeded.current = true;
      setCat(
        cube.categories.includes(cube.totalLabel) ? cube.totalLabel : cube.categories[0] ?? '',
      );
      // TOTAL opens by default: it answers "how is paid doing" without the
      // reader first having to pick a lens.
      setGroup(groups.some((g) => g.id === TOTAL_GROUP) ? TOTAL_GROUP : groups[0].id);
      setFrom(cube.periods[0] ?? '');
      setTo(last);
      const init: Record<string, Record<string, boolean>> = {};
      for (const g of groups) {
        const on = DEFAULT_ON[g.id] ?? [];
        init[g.id] = {};
        for (const m of metricsOfGroup(cube.metrics, g.id)) init[g.id][m] = !on.includes(m);
      }
      setOff(init);
      return;
    }
    setTo((prev) => (prev && cube.periods.includes(prev) ? prev : last));
    setFrom((prev) => (prev && cube.periods.includes(prev) ? prev : cube.periods[0] ?? ''));
  }, [cube, groups]);

  const span = useMemo(() => {
    if (!cube) return { list: [] as string[], i0: 0 };
    let a = cube.periods.indexOf(from);
    let b = cube.periods.indexOf(to);
    if (a < 0) a = 0;
    if (b < 0) b = cube.periods.length - 1;
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    return { list: cube.periods.slice(a, b + 1), i0: a };
  }, [cube, from, to]);

  const view = useMemo(() => {
    if (!cube || !group) return null;
    const all = metricsOfGroup(cube.metrics, group);
    const hidden = off[group] ?? {};
    const series = (m: string) => span.list.map((_, k) => cube.at(m, cat, span.i0 + k));

    // A metric with nothing in this window is dropped rather than drawn as an
    // empty line.
    const present = all.filter((m) => series(m).some((v) => v !== null));
    const shown = present.filter((m) => !hidden[m]);

    const isTotal = group === TOTAL_GROUP;
    const onL = shown.filter((m) => (isTotal ? cfgOf(m).axis !== 'R' : true));
    const onR = isTotal ? shown.filter((m) => cfgOf(m).axis === 'R') : [];

    // Each axis is scaled among its own lines only.
    const factors: Record<string, number> = {
      ...pickFactors(onL, series, autoScale),
      ...pickFactors(onR, series, autoScale),
    };

    const rows = span.list.map((label, k) => {
      const row: Record<string, string | number | null> = { period: label };
      for (const m of shown) {
        const v = cube.at(m, cat, span.i0 + k);
        row[`raw_${m}`] = v;
        row[`scaled_${m}`] = v === null ? null : v * (factors[m] ?? 1);
      }
      return row;
    });

    const singleL = onL.length === 1;
    const singleR = onR.length === 1;
    const pad = endLabelPadding(shown) + (isTotal && onL.length && onR.length ? 44 : 0);

    return { all, present, shown, hidden, factors, rows, onL, onR, isTotal, singleL, singleR, pad };
  }, [cube, group, off, cat, span, autoScale]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-red-500" />
        <div className="font-semibold">Couldn’t load sheet data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-[430px]" />
      </div>
    );
  }
  if (!cube || !cube.metrics.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
        <LayoutGrid className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <div className="text-sm font-semibold text-slate-700">
          Chưa đọc được tab &ldquo;By categories&rdquo;
        </div>
        <div className="mx-auto mt-1 max-w-md text-[11px] leading-snug text-slate-500">
          Tab này nằm trong sheet Shopify Ads (
          <code className="text-[10px]">GOOGLE_SHEET_ID_SHOPIFY</code>). Trang trống khi tab bị đổi
          tên, bị xoá, hoặc sheet chưa share cho service account — xem{' '}
          <code className="text-[10px]">/api/shopify-schema</code> để biết là trường hợp nào.
        </div>
      </div>
    );
  }

  const sel =
    'h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const toggleMetric = (m: string) =>
    setOff((o) => ({ ...o, [group]: { ...(o[group] ?? {}), [m]: !o[group]?.[m] } }));
  const setAll = (hide: boolean) =>
    setOff((o) => {
      const next = { ...(o[group] ?? {}) };
      for (const m of view?.all ?? []) next[m] = hide;
      return { ...o, [group]: next };
    });

  return (
    <div className="space-y-3">
      {/* Controls — same row, same order as the Apps Script dialog. */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Category</span>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className={cn(sel, 'min-w-[150px]')}
            title={
              'Số của từng category (kể cả Pos) đọc thẳng từ sheet.\n\n' +
              'Riêng TOTAL thì sheet không có: chỉ Installs / Impressions / Clicks / Spend có dòng tổng, ' +
              'còn CR / CPI / CPC / CTR / Pos thì không. TOTAL của chúng được tính — đại lượng đếm được thì cộng, ' +
              'tỉ số tính lại từ tổng các thành phần (CPI = ΣSpend/ΣInstalls), Pos bình quân gia quyền theo Impressions. ' +
              'Mốc nào các category có số chiếm dưới 80% trọng số thì để trống chứ không trả số lệch.\n\n' +
              "Tab này gộp 'Test, others' làm một nhóm, còn các trang khác tách Test và Others riêng theo Max bid cap — đừng cộng số hai bên."
            }
          >
            {cube.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Nhóm metric</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className={cn(sel, 'min-w-[215px]')}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Từ</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={cn(sel, 'min-w-[92px]')}>
            {cube.periods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Đến</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={cn(sel, 'min-w-[92px]')}>
            {cube.periods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Legend: one button per metric — swatch, name, current factor. */}
      <div className="flex flex-wrap items-center gap-2">
        {(view?.present ?? []).map((m) => {
          const c = cfgOf(m);
          const hidden = !!view?.hidden[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggleMetric(m)}
              title={`Bấm để ẩn / hiện ${m}`}
              className={cn(
                'flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] text-slate-800 hover:bg-slate-100',
                hidden && 'opacity-40',
              )}
            >
              <span className="h-[3px] w-[18px] shrink-0 rounded-sm" style={{ background: c.color }} />
              {legendLabel(m, hidden ? undefined : view?.factors[m])}
              {view?.isTotal && (
                <span className="text-[10px] text-slate-400">{c.axis === 'L' ? '◀' : '▶'}</span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAll(false)}
          className="ml-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] hover:bg-slate-100"
        >
          Hiện tất cả
        </button>
        <button
          type="button"
          onClick={() => setAll(true)}
          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] hover:bg-slate-100"
        >
          Ẩn hết
        </button>
        <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-500">
          <input type="checkbox" checked={autoScale} onChange={(e) => setAutoScale(e.target.checked)} />
          tự chỉnh hệ số
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3" style={{ height: 430 }}>
        {view?.isTotal && view.onL.length > 0 && view.onR.length > 0 && (
          <div className="mb-1 text-[10px] text-amber-700">
            Hai trục độc lập — chỗ hai đường cắt nhau không mang ý nghĩa gì, chỉ đọc hướng lên
            xuống. Nét liền <b>◀</b> trục trái, nét gạch <b>▶</b> trục phải.
          </div>
        )}
        {!view?.shown.length ? (
          <div className="flex h-full items-center justify-center text-center text-[11px] text-slate-400">
            {view?.present.length
              ? 'Mọi metric đang bị ẩn — bấm “Hiện tất cả”.'
              : 'Metric của nhóm này không có số nào trong khoảng đang chọn.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={view.rows} margin={{ top: 8, right: view.pad, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="#eef1f4" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: AXIS_COLOR }}
                axisLine={{ stroke: '#d8dee4' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="L"
                orientation="left"
                tick={{ fontSize: 11, fill: AXIS_COLOR }}
                axisLine={false}
                tickLine={false}
                domain={[0, 'auto']}
                tickFormatter={(v: number) =>
                  view.singleL
                    ? fmtValue(v, cfgOf(view.onL[0]).fmt)
                    : v >= 1000
                      ? v.toLocaleString('en-US')
                      : String(v)
                }
              />
              {/* The right axis is rendered only when lines actually read against
                  it — a stranded empty axis looks like data that failed to load. */}
              {view.isTotal && view.onR.length > 0 && (
                <YAxis
                  yAxisId="R"
                  orientation="right"
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 'auto']}
                  tickFormatter={(v: number) =>
                    view.singleR ? fmtValue(v, cfgOf(view.onR[0]).fmt) : String(v)
                  }
                />
              )}
              <Tooltip content={<ChartTooltip />} />
              {view.shown.map((m) => {
                const c = cfgOf(m);
                return (
                  <Line
                    key={m}
                    yAxisId={view.isTotal && c.axis === 'R' ? 'R' : 'L'}
                    type="monotone"
                    dataKey={`scaled_${m}`}
                    stroke={c.color}
                    strokeWidth={2}
                    strokeDasharray={c.dash}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
              <EndLabels
                rows={view.rows}
                metrics={view.shown}
                axisOf={(m) => (view.isTotal && cfgOf(m).axis === 'R' ? 'R' : 'L')}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* One line: where the numbers came from.
          The caveats that used to be spelled out here — how TOTAL is derived for
          the ratio metrics, and that this tab merges 'Test, others' where the
          rest of the dashboard splits them — moved into the tooltip of the
          control they qualify. Still one hover away, no longer six lines of prose
          under every chart. */}
      <div className="text-[10.5px] leading-relaxed text-slate-500">
        Nguồn:{' '}
        {board?.sourceUrl ? (
          <a
            href={board.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-700 hover:underline"
          >
            Google Sheet · tab {board.sourceTab || 'By categories'}
          </a>
        ) : (
          <b>tab {board?.sourceTab || 'By categories'}</b>
        )}
        {data?.fetchedAt && (
          <>
            {' '}· đọc lúc{' '}
            {new Date(data.fetchedAt).toLocaleString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: '2-digit',
            })}
          </>
        )}
        {board?.from && board?.to && (
          <>
            {' '}· <span className="font-mono">{board.from} → {board.to}</span>
          </>
        )}{' '}
        · {cube.periods.length} mốc · {cube.dataPoints} điểm
      </div>
    </div>
  );
}
