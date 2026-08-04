'use client';

// Tiny inline SVG sparkline — no chart lib, cheap enough to render one per table
// row. Plots (t, v) points scaled to the box, skips null values (the line just
// bridges the gap), and can drop a vertical marker at a given t (e.g. a note
// date) so you see the trend before vs after that moment.

interface Pt {
  t: number;
  v: number | null;
}

interface Props {
  points: Pt[];
  width?: number;
  height?: number;
  /** x-position (same units as t) of a vertical marker line, if any. */
  markerT?: number | null;
  stroke?: string;
  className?: string;
}

export function Sparkline({
  points,
  width = 96,
  height = 24,
  markerT = null,
  stroke = '#0891b2',
  className,
}: Props) {
  const pad = 2;
  const w = width;
  const h = height;
  const valued = points.filter((p): p is { t: number; v: number } => p.v !== null && Number.isFinite(p.v));
  if (valued.length < 2) {
    return (
      <svg width={w} height={h} className={className} aria-hidden>
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 2" />
      </svg>
    );
  }

  const ts = points.map((p) => p.t);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const vs = valued.map((p) => p.v);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  const tSpan = tMax - tMin || 1;
  const vSpan = vMax - vMin || 1;

  const x = (t: number) => pad + ((t - tMin) / tSpan) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - (v - vMin) / vSpan) * (h - 2 * pad);

  const d = valued.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = valued[valued.length - 1];
  const markerX = markerT != null && markerT >= tMin && markerT <= tMax ? x(markerT) : null;

  return (
    <svg width={w} height={h} className={className} aria-hidden>
      {markerX != null && (
        <line x1={markerX} y1={0} x2={markerX} y2={h} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2 2" />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.t)} cy={y(last.v)} r={1.8} fill={stroke} />
    </svg>
  );
}
