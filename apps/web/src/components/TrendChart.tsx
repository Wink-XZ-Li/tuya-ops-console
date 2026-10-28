import { useEffect, useRef, useState } from 'react';
import { formatDtLabel, formatNumber } from './AnalyticsFilters';

export type TrendPoint = { day: string; value: number };

export function TrendChart({
  values,
  color = '#1a1a1a',
  emptyHint = '暂无数据',
  valueLabel = '数值',
}: {
  values: TrendPoint[];
  color?: string;
  emptyHint?: string;
  valueLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (values.length === 0) return <p className="hint">{emptyHint}</p>;

  const height = 240;
  const pad = { top: 18, right: 12, bottom: 32, left: 48 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...values.map((p) => p.value));
  const xAt = (i: number) =>
    pad.left + (values.length === 1 ? plotW / 2 : (i / (values.length - 1)) * plotW);
  const yAt = (value: number) => pad.top + plotH - (value / max) * plotH;
  const line = values
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${xAt(values.length - 1).toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`;
  const yTicks = [0, 0.5, 1];
  const xLabelIndexes = labelIndexes(values.length);
  const active = hover != null ? values[hover] : null;
  const tipLeft = active && hover != null ? clamp(xAt(hover), 72, Math.max(72, width - 72)) : 0;

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    values.forEach((_, i) => {
      const dist = Math.abs(xAt(i) - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div className="trend-chart" ref={wrapRef}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="趋势图，悬停可查看每个数据点"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((tick) => {
            const y = pad.top + plotH * (1 - tick);
            return (
              <g key={tick}>
                <line
                  className="trend-grid"
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                />
                <text className="trend-axis" x={pad.left - 8} y={y + 4} textAnchor="end">
                  {formatNumber(Math.round(max * tick))}
                </text>
              </g>
            );
          })}
          <path d={area} fill={color} opacity="0.14" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" />
          {values.map((point, i) => (
            <circle
              key={`${point.day}-${i}`}
              cx={xAt(i)}
              cy={yAt(point.value)}
              r={hover === i ? 5 : values.length > 45 ? 0 : 3}
              fill={hover === i ? '#fff' : color}
              stroke={color}
              strokeWidth={hover === i ? 2 : 0}
            />
          ))}
          {hover != null && (
            <line
              className="trend-guide"
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={pad.top}
              y2={pad.top + plotH}
            />
          )}
          {xLabelIndexes.map((i) => (
            <text
              key={i}
              className="trend-axis"
              x={xAt(i)}
              y={height - 8}
              textAnchor={i === 0 ? 'start' : i === values.length - 1 ? 'end' : 'middle'}
            >
              {formatDtLabel(values[i].day)}
            </text>
          ))}
        </svg>
      )}
      {active && hover != null && (
        <div className="trend-tip" style={{ left: tipLeft }}>
          <strong>{formatFullDay(active.day)}</strong>
          <span>
            {valueLabel} {formatNumber(active.value)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatFullDay(dt: string): string {
  if (dt.length !== 8) return dt;
  return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
}

function labelIndexes(length: number): number[] {
  if (length <= 1) return [0];
  if (length <= 6) return valuesRange(length);
  const mid = Math.floor((length - 1) / 2);
  return [0, mid, length - 1];
}

function valuesRange(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
