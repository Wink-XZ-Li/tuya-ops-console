import { useEffect, useMemo, useRef, useState } from 'react';
import { trendX } from '../utils/dp-trend';

export type DpTrendPoint = { t: string; avg: number; min: number; max: number };

export type DpTrendSeries = {
  dpId: string;
  name: string;
  unit: string | null;
  points: DpTrendPoint[];
};

export type DpTrendFault = {
  id: string;
  label: string;
  start: string;
  end: string;
  open: boolean;
};

const COLORS = ['#1b6c80', '#1e7b4f', '#b45309', '#3b4da3', '#9f1239', '#0f766e', '#7c3aed', '#57534e'];

const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

type Props = {
  series: DpTrendSeries[];
  hidden: ReadonlySet<string>;
  from: string;
  to: string;
  faults: DpTrendFault[];
  onToggle: (dpId: string) => void;
};

export function DpTrendChart({ series, hidden, from, to, faults, onToggle }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverT, setHoverT] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (next: number) => setWidth(next > 0 ? next : el.clientWidth);
    if (typeof ResizeObserver === 'undefined') {
      apply(el.clientWidth);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      apply(entries[0]?.contentRect.width ?? el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const height = 260;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;

  const visible = series.filter((item) => !hidden.has(item.dpId) && item.points.length > 0);
  const yDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const item of visible) {
      for (const point of item.points) {
        min = Math.min(min, point.min);
        max = Math.max(max, point.max);
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    if (min === max) return { min: min - 1, max: max + 1 };
    const pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad };
  }, [visible]);

  function yAt(value: number): number {
    const span = yDomain.max - yDomain.min || 1;
    return PAD.top + plotH - ((value - yDomain.min) / span) * plotH;
  }

  function xAt(timeMs: number): number {
    const clipped = Math.min(Math.max(timeMs, fromMs), toMs);
    return trendX(clipped, fromMs, toMs, PAD.left, plotW);
  }

  const hoverPoints = hoverT
    ? visible.flatMap((item) => {
        const point = item.points.find((row) => row.t === hoverT);
        return point ? [{ ...item, point }] : [];
      })
    : [];

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best: { t: string; dist: number } | null = null;
    for (const item of visible) {
      for (const point of item.points) {
        const dist = Math.abs(xAt(Date.parse(point.t)) - x);
        if (!best || dist < best.dist) best = { t: point.t, dist };
      }
    }
    setHoverT(best?.t ?? null);
  }

  const tipLeft = hoverT ? Math.min(Math.max(xAt(Date.parse(hoverT)), 72), Math.max(72, width - 72)) : 0;

  return (
    <div className="trend-chart dp-trend-chart" ref={wrapRef}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="参数走势，悬停可查看每个桶的均值和最小最大"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverT(null)}
        >
          {[0, 0.5, 1].map((tick) => {
            const value = yDomain.min + (yDomain.max - yDomain.min) * tick;
            const y = yAt(value);
            return (
              <g key={tick}>
                <line className="trend-grid" x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} />
                <text className="trend-axis" x={PAD.left - 6} y={y + 4} textAnchor="end">
                  {formatTick(value)}
                </text>
              </g>
            );
          })}
          {faults.map((fault) => {
            const start = Date.parse(fault.start);
            const end = Date.parse(fault.end);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end < fromMs || start > toMs) {
              return null;
            }
            const x1 = xAt(start);
            const x2 = xAt(end);
            return (
              <g key={fault.id}>
                <rect
                  className={`dp-fault-band${fault.open ? ' is-open' : ''}`}
                  data-role="fault"
                  data-start={fault.start}
                  data-x={x1.toFixed(1)}
                  x={Math.min(x1, x2)}
                  y={PAD.top}
                  width={Math.max(2, Math.abs(x2 - x1))}
                  height={plotH}
                >
                  <title>{`${fault.label} ${fault.open ? '未关闭' : '已关闭'}`}</title>
                </rect>
                <line
                  className={`dp-fault-line${fault.open ? ' is-open' : ''}`}
                  x1={x1}
                  x2={x1}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                />
              </g>
            );
          })}
          {series.map((item, index) => {
            if (hidden.has(item.dpId) || item.points.length === 0) return null;
            const color = COLORS[index % COLORS.length];
            const points = [...item.points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
            return (
              <g key={item.dpId} data-dp={item.dpId} data-runs="1">
                <TrendRun run={points} color={color} name={item.name} xAt={xAt} yAt={yAt} />
              </g>
            );
          })}
        </svg>
      )}
      {hoverT && hoverPoints.length > 0 && (
        <div className="trend-tip" style={{ left: tipLeft }}>
          <span>{new Date(hoverT).toLocaleString()}</span>
          {hoverPoints.map((row) => (
            <span key={row.dpId}>
              {row.name} {row.point.avg}
              {row.unit ? ` ${row.unit}` : ''}（{row.point.min}–{row.point.max}）
            </span>
          ))}
        </div>
      )}
      <div className="dp-trend-legend">
        {series.map((item, index) => (
          <button
            key={item.dpId}
            type="button"
            className={`dp-legend${hidden.has(item.dpId) ? ' is-off' : ''}`}
            aria-pressed={!hidden.has(item.dpId)}
            onClick={() => onToggle(item.dpId)}
          >
            <i style={{ background: COLORS[index % COLORS.length] }} />
            {item.name}
            {item.unit ? ` ${item.unit}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

function TrendRun({
  run,
  color,
  name,
  xAt,
  yAt,
}: {
  run: DpTrendPoint[];
  color: string;
  name: string;
  xAt: (timeMs: number) => number;
  yAt: (value: number) => number;
}) {
  const coords = run.map((point) => ({
    point,
    x: xAt(Date.parse(point.t)),
    avg: yAt(point.avg),
    min: yAt(point.min),
    max: yAt(point.max),
  }));
  const linePoints = coords.map((row) => pair(row.x, row.avg)).join(' ');
  const bandPoints =
    coords.length > 1
      ? [
          ...coords.map((row) => pair(row.x, row.max)),
          ...[...coords].reverse().map((row) => pair(row.x, row.min)),
        ].join(' ')
      : '';

  return (
    <>
      {bandPoints && <polygon className="dp-trend-band" points={bandPoints} fill={color} />}
      <polyline className="dp-trend-line" points={linePoints} stroke={color} fill="none" />
      {coords.map((row) => (
        <circle
          key={row.point.t}
          cx={row.x}
          cy={row.avg}
          r={3.5}
          fill={color}
          data-t={row.point.t}
          data-avg={row.point.avg}
          data-x={row.x.toFixed(1)}
        >
          <title>
            {name} {row.point.avg}（{row.point.min}–{row.point.max}）
          </title>
        </circle>
      ))}
    </>
  );
}

function pair(x: number, y: number): string {
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
