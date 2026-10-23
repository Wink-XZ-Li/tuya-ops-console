import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api/client';
import { type TrendPreset, trendWindow } from '../utils/dp-trend';
import {
  type UsageMetricId,
  listShanghaiDates,
  usageMetricsForProduct,
} from '../utils/usage-metrics';

type UsageDay = { date: string; value: number };

type UsageResponse = {
  metricId: string;
  name: string;
  unit: string;
  from: string;
  to: string;
  total: number;
  dailyAvg: number | null;
  peakDay: { date: string; value: number } | null;
  days: UsageDay[];
  note: string | null;
};

const RANGES: Array<{ key: Extract<TrendPreset, '7d' | '30d'>; label: string }> = [
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
];

type Props = {
  deviceId: string;
  productId: string;
  now?: Date;
};

export function UsagePanel({ deviceId, productId, now }: Props) {
  const metrics = useMemo(() => usageMetricsForProduct(productId), [productId]);
  const [metricId, setMetricId] = useState<UsageMetricId | ''>(metrics[0]?.metricId ?? '');
  const [range, setRange] = useState<Extract<TrendPreset, '7d' | '30d'>>('7d');
  const [report, setReport] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMetricId(metrics[0]?.metricId ?? '');
    setReport(null);
  }, [metrics]);

  const window = useMemo(() => trendWindow(range, now ?? new Date()), [now, range]);

  useEffect(() => {
    if (!metricId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<UsageResponse>(
      `/api/devices/${encodeURIComponent(deviceId)}/usage${qs({
        metric: metricId,
        from: window.from,
        to: window.to,
      })}`,
    )
      .then((res) => {
        if (!cancelled) setReport(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setReport(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, metricId, window]);

  if (metrics.length === 0) return null;

  const active = metrics.find((item) => item.metricId === metricId) ?? metrics[0];
  const days = report?.days ?? [];
  const slots = listShanghaiDates(report?.from || window.from, report?.to || window.to);
  const byDate = new Map(days.map((day) => [day.date, day.value]));
  const max = days.reduce((peak, day) => Math.max(peak, day.value), 0);
  const unit = report?.unit || active.unit;

  return (
    <section className="card usage" aria-label="用量">
      <div className="section-bar">
        <h2>用量</h2>
        <div className="seg" role="group" aria-label="用量时间">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={range === item.key}
              onClick={() => setRange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {metrics.length > 1 && (
        <div className="usage-tabs" role="tablist" aria-label="用量项">
          {metrics.map((item) => (
            <button
              key={item.metricId}
              type="button"
              role="tab"
              aria-selected={item.metricId === active.metricId}
              onClick={() => setMetricId(item.metricId)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p className="usage-kpi">
        <span>本区间合计 {formatUsage(report?.total)}{unit ? ` ${unit}` : ''}</span>
        <span>日均 {formatUsage(report?.dailyAvg)}{unit ? ` ${unit}` : ''}</span>
        <span>
          峰值日 {report?.peakDay ? `${report.peakDay.date} ${formatUsage(report.peakDay.value)}` : '—'}
          {report?.peakDay && unit ? ` ${unit}` : ''}
        </span>
      </p>
      {loading && days.length === 0 ? (
        <p className="hint">加载中</p>
      ) : days.length === 0 ? (
        <p className="hint">这段时间没有用量上报。</p>
      ) : (
        <div className="usage-chart" role="img" aria-label={`${active.name}日柱`}>
          {slots.map((date, index) => {
            const value = byDate.get(date);
            const gap = value == null;
            const showLabel = slots.length <= 10 || index % Math.ceil(slots.length / 6) === 0 || index === slots.length - 1;
            return (
              <div key={date} className="usage-slot" data-date={date} data-gap={gap ? '1' : undefined}>
                {!gap && (
                  <div
                    className={`usage-bar${value === 0 ? ' is-zero' : ''}`}
                    data-value={value}
                    style={{ height: max > 0 ? `${Math.max(2, (value / max) * 100)}%` : undefined }}
                    title={`${date} ${formatUsage(value)}${unit ? ` ${unit}` : ''}`}
                  />
                )}
                {showLabel && <span className="usage-tick">{shortDate(date)}</span>}
              </div>
            );
          })}
        </div>
      )}
      {report?.note && <p className="hint usage-note">{report.note}</p>}
    </section>
  );
}

function formatUsage(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(Math.round(value * 1000) / 1000);
}

function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${Number(month)}/${Number(day)}`;
}
