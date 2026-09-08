'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

/** Metric names drawn at the end of each line, de-collided. */
function EndLabels(props: Record<string, unknown>) {
  const items = props.formattedGraphicalItems as
    | { props: { points?: { x: number; y: number | null }[]; dataKey?: string; stroke?: string } }[]
    | undefined;
  const offset = props.offset as { top: number; height: number } | undefined;
  if (!items?.length || !offset) return null;

  const found: { x: number; y: number; text: string; color: string }[] = [];
  for (const it of items) {
    const pts = it.props.points ?? [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      if (p?.y === null || p?.y === undefined || !Number.isFinite(p.y)) continue;
      const metric = String(it.props.dataKey ?? '').replace(/^scaled_/, '');
      found.push({ x: p.x, y: p.y as number, text: metric, color: it.props.stroke ?? AXIS_COLOR });
      break;
    }
  }
  if (!found.length) return null;

  const top = offset.top + 4;
  const bottom = offset.top + offset.height - 4;
  const ys = layoutEndLabels(found.map((f) => f.y), top, bottom, LABEL_GAP);
  const right = Math.max(...found.map((f) => f.x));

  return (
    <g>
      {found.map((f, i) => (
        <text
          key={f.text}
          x={right + 7}
          y={ys[i]}
          fill={f.color}
          fontSize={11}
          fontWeight={500}
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
      setGroup(groups[0].id);
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
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={cn(sel, 'min-w-[150px]')}>
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
              <Customized component={EndLabels} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Axis labelling in words, since the axis itself carries scaled numbers. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
        <span>
          Trục trái:{' '}
          <b>
            {view?.singleL
              ? view.onL[0]
              : view?.isTotal
                ? `${AXIS_NAME.L} (quy hệ số)`
                : 'giá trị đã quy hệ số'}
          </b>
        </span>
        {view?.isTotal && view.onR.length > 0 && (
          <span>
            Trục phải:{' '}
            <b>{view.singleR ? view.onR[0] : `${AXIS_NAME.R} (quy hệ số)`}</b>
          </span>
        )}
      </div>

      {/* What the reader needs in order to read the chart correctly. */}
      <div className="space-y-1 text-[10.5px] leading-relaxed text-slate-500">
        <div>
          Tên metric in ở cuối mỗi đường. Bấm nhãn phía trên để ẩn / hiện.{' '}
          {view?.isTotal ? (
            <>
              Nét liền <b>◀</b> đọc theo trục trái, nét gạch <b>▶</b> đọc theo trục phải.{' '}
              {(view.singleL || view.singleR) && (
                <>
                  Trục{' '}
                  {view.singleL && view.singleR ? 'trái và phải' : view.singleL ? 'trái' : 'phải'}{' '}
                  đang chỉ có 1 đường nên hiện giá trị gốc, không quy hệ số.{' '}
                </>
              )}
              <b className="text-amber-700">
                Hai trục độc lập — chỗ hai đường cắt nhau không mang ý nghĩa gì, chỉ đọc hướng lên
                xuống.
              </b>
            </>
          ) : view?.shown.length === 1 ? (
            'Chỉ có 1 đường nên trục hiện giá trị gốc, không quy hệ số.'
          ) : (
            'Hệ số chọn theo category để các đường trải đều trên trục.'
          )}{' '}
          Tooltip luôn hiện giá trị thật.
        </div>
        <div>
          Đọc từ tab <b>By categories</b> của sheet Shopify Ads
          {data?.fetchedAt && (
            <>
              {' '}
              lúc{' '}
              {new Date(data.fetchedAt).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </>
          )}{' '}
          · {cube.metrics.length} metric · {cube.periods.length} mốc · {cube.dataPoints} điểm dữ liệu
          {board?.from && board?.to && (
            <>
              {' '}
              · Date range{' '}
              <span className="font-mono">
                {board.from} → {board.to}
              </span>
            </>
          )}{' '}
          · <i>cache 10 phút, không tự cập nhật theo thời gian thực</i>
        </div>
        <div>
          <b>TOTAL</b> không cộng thẳng mọi thứ: đại lượng đếm được thì cộng, tỉ số thì{' '}
          <b>tính lại từ tổng các thành phần</b> (CPI = ΣSpend/ΣInstalls), còn <b>Pos</b> bình quân
          gia quyền theo Impressions. Mốc nào các category có số chiếm dưới 80% trọng số thì để{' '}
          <b>trống</b> chứ không trả một con số lệch.
        </div>
        <div>
          Tab này gộp <code className="text-[9px]">Test, others</code> làm một nhóm, còn các trang
          khác tách <b>Test</b> và <b>Others</b> riêng theo{' '}
          <code className="text-[9px]">Max bid cap</code> — đừng cộng số hai bên với nhau.
        </div>
      </div>
    </div>
  );
}
