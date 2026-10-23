import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api/client';
import { TREND_MAX_RANGE_MS, type TrendPreset, trendWindow } from '../utils/dp-trend';
import { statusBarDpsForProduct, statusTone } from '../utils/status-bars';

type StatusSegment = {
  tStart: string;
  tEnd: string;
  value: string | null;
  label: string;
};

type StatusBar = {
  dpId: string;
  name: string;
  type: 'enum' | 'bool';
  range?: string[];
  segments: StatusSegment[];
};

type StatusBarsResponse = {
  from: string;
  to: string;
  bars: StatusBar[];
};

const RANGES: Array<{ key: TrendPreset; label: string }> = [
  { key: '24h', label: '近 24 小时' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
];

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

type Props = {
  deviceId: string;
  productId: string;
  now?: Date;
};

export function StatusBarPanel({ deviceId, productId, now }: Props) {
  const configured = useMemo(() => statusBarDpsForProduct(productId), [productId]);
  const [preset, setPreset] = useState<TrendPreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [bars, setBars] = useState<StatusBar[]>([]);
  const [windowFrom, setWindowFrom] = useState('');
  const [windowTo, setWindowTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requested = useMemo(
    () => statusQuery(preset, customFrom, customTo, now ?? new Date()),
    [customFrom, customTo, now, preset],
  );

  useEffect(() => {
    if (configured.length === 0) return;
    if ('error' in requested) {
      setError(requested.error);
      setBars([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<StatusBarsResponse>(
      `/api/devices/${encodeURIComponent(deviceId)}/status-bars${qs({
        from: requested.from,
        to: requested.to,
      })}`,
    )
      .then((res) => {
        if (cancelled) return;
        setWindowFrom(res?.from || requested.from);
        setWindowTo(res?.to || requested.to);
        setBars(Array.isArray(res?.bars) ? res.bars : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setBars([]);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured.length, deviceId, requested]);

  if (configured.length === 0) return null;

  const allUnknown = bars.length > 0 && bars.every((bar) => bar.segments.every((segment) => segment.value == null));

  return (
    <section className="card status-bars" aria-label="运行状态">
      <div className="section-bar">
        <h2>
          运行状态
          <span className="hint">枚举与布尔，不含数值</span>
        </h2>
      </div>
      <div className="row gap usage-tools">
        <div className="seg" role="group" aria-label="运行状态时间">
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
      </div>
      {error && <p className="error">{error}</p>}
      {!error && loading && bars.length === 0 && <p className="hint">加载中</p>}
      {!error && !loading && bars.length === 0 && <p className="hint">这段时间没有状态上报。</p>}
      {!error &&
        bars.map((bar) => (
          <StatusRibbon key={bar.dpId} bar={bar} windowFrom={windowFrom} windowTo={windowTo} />
        ))}
      {!error && allUnknown && <p className="hint">这段时间没有状态上报，记为未知。</p>}
    </section>
  );
}

function StatusRibbon({
  bar,
  windowFrom,
  windowTo,
}: {
  bar: StatusBar;
  windowFrom: string;
  windowTo: string;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ text: string; left: number } | null>(null);
  const range = bar.range ?? [];
  const seen: StatusSegment[] = [];
  for (const segment of bar.segments) {
    if (seen.some((item) => item.value === segment.value)) continue;
    seen.push(segment);
  }

  function showTip(event: React.MouseEvent<HTMLDivElement>, segment: StatusSegment) {
    const chart = chartRef.current;
    if (!chart) return;
    const chartBox = chart.getBoundingClientRect();
    const slotBox = event.currentTarget.getBoundingClientRect();
    const duration = Math.max(0, Date.parse(segment.tEnd) - Date.parse(segment.tStart));
    setHover({
      text: `${segment.label} · ${formatShanghai(segment.tStart)} – ${formatShanghai(segment.tEnd)} · 持续 ${formatDuration(duration)}`,
      left: slotBox.left - chartBox.left + slotBox.width / 2,
    });
  }

  return (
    <div className="status-row">
      <div className="status-row-name">{bar.name}</div>
      <div>
        <div className="connectivity-chart" ref={chartRef}>
          <div className="connectivity-bar status-bar" role="group" aria-label={bar.name}>
            {bar.segments.map((segment) => {
              const duration = Math.max(1, Date.parse(segment.tEnd) - Date.parse(segment.tStart));
              return (
                <div
                  key={`${segment.value ?? 'unknown'}-${segment.tStart}`}
                  className={`connectivity-seg status-seg ${statusTone(bar.type, segment.value, range)}`}
                  data-value={segment.value ?? ''}
                  style={{ flexGrow: duration }}
                  onMouseEnter={(event) => showTip(event, segment)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </div>
          {hover && (
            <div className="trend-tip connectivity-tip" role="tooltip" style={{ left: hover.left }}>
              {hover.text}
            </div>
          )}
          <div className="connectivity-scale">
            <span>{formatShanghaiDay(windowFrom)}</span>
            <span>{formatShanghaiDay(windowTo)}</span>
          </div>
        </div>
        <ul className="status-legend">
          {seen.map((segment) => (
            <li key={segment.value ?? 'unknown'}>
              <i className={`status-swatch ${statusTone(bar.type, segment.value, range)}`} />
              {segment.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function statusQuery(
  preset: TrendPreset,
  customFrom: string,
  customTo: string,
  now: Date,
): { from: string; to: string } | { error: string } {
  if (customFrom && customTo) {
    const from = new Date(customFrom);
    const to = new Date(customTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { error: '开始时间要早于结束时间' };
    }
    const span = to.getTime() - from.getTime();
    if (span <= 0) return { error: '开始时间要早于结束时间' };
    if (span > TREND_MAX_RANGE_MS) return { error: '区间不能超过 90 天' };
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const window = trendWindow(preset, now);
  return { from: window.from, to: window.to };
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 48) return restMinutes ? `${hours} 小时 ${restMinutes} 分钟` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} 天 ${restHours} 小时` : `${days} 天`;
}

function formatShanghai(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  const shifted = new Date(parsed + SHANGHAI_OFFSET_MS);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${month}-${day} ${hour}:${minute}`;
}

function formatShanghaiDay(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '';
  const shifted = new Date(parsed + SHANGHAI_OFFSET_MS);
  return `${shifted.getUTCMonth() + 1}/${shifted.getUTCDate()}`;
}
