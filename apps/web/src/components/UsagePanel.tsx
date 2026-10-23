import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api/client';
import { TREND_MAX_RANGE_MS, type TrendPreset, trendWindow } from '../utils/dp-trend';
import {
  type UsageBucket,
  type UsageMetricId,
  listUsageSlots,
  usageMetricsForProduct,
} from '../utils/usage-metrics';

type UsageDay = { date: string; value: number };

type UsageResponse = {
  metricId: string;
  name: string;
  unit: string;
  bucket?: UsageBucket;
  from: string;
  to: string;
  total: number;
  dailyAvg: number | null;
  peakDay: { date: string; value: number } | null;
  days: UsageDay[];
  note: string | null;
};

const RANGES: Array<{ key: TrendPreset; label: string }> = [
  { key: '24h', label: '近 24 小时' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
];

const HOUR_SPAN_MS = 48 * 60 * 60 * 1000;

type Props = {
  deviceId: string;
  productId: string;
  now?: Date;
};

export function UsagePanel({ deviceId, productId, now }: Props) {
  const metrics = useMemo(() => usageMetricsForProduct(productId), [productId]);
  const [metricId, setMetricId] = useState<UsageMetricId | ''>(metrics[0]?.metricId ?? '');
  const [preset, setPreset] = useState<TrendPreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [report, setReport] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ label: string; value: number; left: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMetricId(metrics[0]?.metricId ?? '');
    setReport(null);
  }, [metrics]);

  const requested = useMemo(
    () => usageQuery(preset, customFrom, customTo, now ?? new Date()),
    [customFrom, customTo, now, preset],
  );

  useEffect(() => {
    if ('error' in requested) {
      setError(requested.error);
      setReport(null);
      setLoading(false);
      return;
    }
    if (!metricId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<UsageResponse>(
      `/api/devices/${encodeURIComponent(deviceId)}/usage${qs({
        metric: metricId,
        from: requested.from,
        to: requested.to,
        bucket: requested.bucket,
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
  }, [deviceId, metricId, requested]);

  if (metrics.length === 0) return null;

  const active = metrics.find((item) => item.metricId === metricId) ?? metrics[0];
  const bucket: UsageBucket = report?.bucket ?? ('error' in requested ? 'day' : requested.bucket);
  const days = report?.days ?? [];
  const rangeFrom = report?.from || ('error' in requested ? '' : requested.from);
  const rangeTo = report?.to || ('error' in requested ? '' : requested.to);
  const slots = rangeFrom && rangeTo ? listUsageSlots(rangeFrom, rangeTo, bucket) : [];
  const byDate = new Map(days.map((day) => [day.date, day.value]));
  const max = days.reduce((peak, day) => Math.max(peak, day.value), 0);
  const unit = report?.unit || active.unit;
  const averageLabel = bucket === 'hour' ? '时均' : '日均';
  const peakLabel = bucket === 'hour' ? '峰值' : '峰值日';

  function showTip(event: React.MouseEvent<HTMLDivElement>, date: string, value: number) {
    const chart = chartRef.current;
    if (!chart) return;
    const chartBox = chart.getBoundingClientRect();
    const slotBox = event.currentTarget.getBoundingClientRect();
    const left = slotBox.left - chartBox.left + slotBox.width / 2;
    setHover({ label: displayStamp(date), value, left });
  }

  return (
    <section className="card usage" aria-label="用量">
      <div className="section-bar">
        <h2>用量</h2>
      </div>
      <div className="row gap usage-tools">
        <div className="seg" role="group" aria-label="用量时间">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={!customFrom && !customTo && preset === item.key}
              onClick={() => {
                setPreset(item.key);
                setCustomFrom('');
                setCustomTo('');
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">开始</span>
          <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">结束</span>
          <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </label>
        <span className="hint usage-grain">{bucket === 'hour' ? '按小时柱' : '按日柱'}</span>
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
        <span>
          {averageLabel} {formatUsage(report?.dailyAvg)}
          {unit ? ` ${unit}` : ''}
        </span>
        <span>
          {peakLabel} {report?.peakDay ? `${displayStamp(report.peakDay.date)} ${formatUsage(report.peakDay.value)}` : '—'}
          {report?.peakDay && unit ? ` ${unit}` : ''}
        </span>
      </p>
      {loading && days.length === 0 ? (
        <p className="hint">加载中</p>
      ) : days.length === 0 ? (
        <p className="hint">这段时间没有用量上报。</p>
      ) : (
        <div className="usage-chart" ref={chartRef} role="group" aria-label={`${active.name}${bucket === 'hour' ? '小时柱' : '日柱'}`}>
          <div className="usage-y" aria-hidden="true">
            <span>{formatUsage(max)}</span>
            <span>{formatUsage(max / 2)}</span>
            <span>0</span>
          </div>
          <div className="usage-body">
            <div className="usage-plot">
              {slots.map((date) => {
                const value = byDate.get(date);
                const gap = value == null;
                return (
                  <div
                    key={date}
                    className="usage-slot"
                    data-date={date}
                    data-gap={gap ? '1' : undefined}
                    onMouseEnter={gap ? undefined : (event) => showTip(event, date, value)}
                    onMouseLeave={gap ? undefined : () => setHover(null)}
                  >
                    {!gap && (
                      <div
                        className={`usage-bar${value === 0 ? ' is-zero' : ''}`}
                        data-value={value}
                        style={{ height: max > 0 && value > 0 ? `${(value / max) * 100}%` : undefined }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="usage-axis">
              {slots.map((date, index) => (
                <span key={date} className="usage-tick">
                  {showAxisLabel(index, slots.length, bucket) ? axisLabel(date, bucket, index) : ''}
                </span>
              ))}
            </div>
          </div>
          {hover && (
            <div className="trend-tip usage-tip" role="tooltip" style={{ left: hover.left }}>
              <span>{hover.label}</span>
              <span>
                {formatUsage(hover.value)}
                {unit ? ` ${unit}` : ''}
              </span>
            </div>
          )}
        </div>
      )}
      {report?.note && <p className="hint usage-note">{report.note}</p>}
    </section>
  );
}

function usageQuery(
  preset: TrendPreset,
  customFrom: string,
  customTo: string,
  now: Date,
): { from: string; to: string; bucket: UsageBucket } | { error: string } {
  if (customFrom && customTo) {
    const from = new Date(customFrom);
    const to = new Date(customTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { error: '开始时间要早于结束时间' };
    }
    const span = to.getTime() - from.getTime();
    if (span <= 0) return { error: '开始时间要早于结束时间' };
    if (span > TREND_MAX_RANGE_MS) return { error: '区间不能超过 90 天' };
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: span <= HOUR_SPAN_MS ? 'hour' : 'day',
    };
  }
  const window = trendWindow(preset, now);
  return { from: window.from, to: window.to, bucket: preset === '24h' ? 'hour' : 'day' };
}

function formatUsage(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(Math.round(value * 1000) / 1000);
}

function displayStamp(stamp: string): string {
  return stamp.replace('T', ' ');
}

function showAxisLabel(index: number, total: number, bucket: UsageBucket): boolean {
  if (bucket === 'hour') return index % 4 === 0 || index === total - 1;
  if (total <= 10) return true;
  return index % Math.ceil(total / 6) === 0 || index === total - 1;
}

function axisLabel(stamp: string, bucket: UsageBucket, index: number): string {
  if (bucket === 'day') {
    const [, month, day] = stamp.split('-');
    return `${Number(month)}/${Number(day)}`;
  }
  const [date, time] = stamp.split('T');
  const [, month, day] = date.split('-');
  const hour = time?.slice(0, 5) ?? '';
  if (index === 0 || hour === '00:00') return `${Number(month)}/${Number(day)} ${hour}`;
  return hour;
}
