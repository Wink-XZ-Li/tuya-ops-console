import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api/client';
import { TREND_MAX_RANGE_MS, type TrendPreset, trendWindow } from '../utils/dp-trend';

type ConnectivityState = 'online' | 'offline' | 'unknown';

type ConnectivitySegment = {
  state: ConnectivityState;
  from: string;
  to: string;
};

type ConnectivityResponse = {
  from: string;
  to: string;
  source?: string;
  segments: ConnectivitySegment[];
};

const RANGES: Array<{ key: TrendPreset; label: string }> = [
  { key: '24h', label: '近 24 小时' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
];

const STATE_LABEL: Record<ConnectivityState, string> = {
  online: '在线',
  offline: '离线',
  unknown: '未知',
};

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

type Props = {
  deviceId: string;
  now?: Date;
};

export function ConnectivityPanel({ deviceId, now }: Props) {
  const [preset, setPreset] = useState<TrendPreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [report, setReport] = useState<ConnectivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ text: string; left: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const requested = useMemo(
    () => connectivityQuery(preset, customFrom, customTo, now ?? new Date()),
    [customFrom, customTo, now, preset],
  );

  useEffect(() => {
    if ('error' in requested) {
      setError(requested.error);
      setReport(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<ConnectivityResponse>(
      `/api/devices/${encodeURIComponent(deviceId)}/connectivity${qs({
        from: requested.from,
        to: requested.to,
      })}`,
    )
      .then((res) => {
        if (cancelled) return;
        setReport({
          from: res?.from || requested.from,
          to: res?.to || requested.to,
          source: res?.source,
          segments: Array.isArray(res?.segments) ? res.segments : [],
        });
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
  }, [deviceId, requested]);

  const segments = report?.segments ?? [];
  const allUnknown = segments.length > 0 && segments.every((segment) => segment.state === 'unknown');
  const windowFrom = report?.from || ('error' in requested ? '' : requested.from);
  const windowTo = report?.to || ('error' in requested ? '' : requested.to);

  function showTip(event: React.MouseEvent<HTMLDivElement>, segment: ConnectivitySegment) {
    const bar = barRef.current;
    if (!bar) return;
    const barBox = bar.getBoundingClientRect();
    const slotBox = event.currentTarget.getBoundingClientRect();
    const left = slotBox.left - barBox.left + slotBox.width / 2;
    const duration = Math.max(0, Date.parse(segment.to) - Date.parse(segment.from));
    setHover({
      text: `${STATE_LABEL[segment.state]} · ${formatShanghai(segment.from)} – ${formatShanghai(segment.to)} · 持续 ${formatDuration(duration)}`,
      left,
    });
  }

  return (
    <section className="card connectivity" aria-label="在线状态">
      <div className="section-bar">
        <h2>
          在线状态
          <span className="hint">上下线事件，不含故障</span>
        </h2>
        <a className="btn ghost" href="#device-logs">
          详情
        </a>
      </div>
      <div className="row gap usage-tools">
        <div className="seg" role="group" aria-label="在线时间">
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
      <ul className="connectivity-legend">
        <li>
          <i className="connectivity-swatch is-online" />
          在线
        </li>
        <li>
          <i className="connectivity-swatch is-offline" />
          离线
        </li>
        <li>
          <i className="connectivity-swatch is-unknown" />
          未知
        </li>
      </ul>
      {error && <p className="error">{error}</p>}
      {!error && loading && segments.length === 0 ? (
        <p className="hint">加载中</p>
      ) : !error && segments.length === 0 ? (
        <p className="hint">这段时间没有连通上报。</p>
      ) : !error ? (
        <>
          <p className="connectivity-summary">{summarize(segments)}</p>
          <div className="connectivity-chart" ref={barRef}>
            <div className="connectivity-bar" role="group" aria-label="连通色带">
              {segments.map((segment) => {
                const duration = Math.max(1, Date.parse(segment.to) - Date.parse(segment.from));
                return (
                  <div
                    key={`${segment.state}-${segment.from}`}
                    className={`connectivity-seg is-${segment.state}`}
                    data-state={segment.state}
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
          {allUnknown && <p className="hint">这段时间没有连通上报，记为未知。</p>}
        </>
      ) : null}
    </section>
  );
}

function connectivityQuery(
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

function summarize(segments: ConnectivitySegment[]): string {
  const totals: Record<ConnectivityState, number> = { online: 0, offline: 0, unknown: 0 };
  for (const segment of segments) {
    const span = Date.parse(segment.to) - Date.parse(segment.from);
    if (Number.isFinite(span) && span > 0) totals[segment.state] += span;
  }
  return (['online', 'offline', 'unknown'] as const)
    .filter((state) => totals[state] > 0)
    .map((state) => `${STATE_LABEL[state]} ${formatDuration(totals[state])}`)
    .join(' · ');
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 48) {
    return restMinutes ? `${hours} 小时 ${restMinutes} 分钟` : `${hours} 小时`;
  }
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
