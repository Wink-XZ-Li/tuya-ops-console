import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api/client';
import { getProductDps } from '../constants/product-dp-schemas';
import {
  TREND_MAX_RANGE_MS,
  TREND_SERIES_LIMIT,
  type TrendBucket,
  type TrendPreset,
  bucketForRange,
  readTrendSelection,
  trendWindow,
  writeTrendSelection,
} from '../utils/dp-trend';
import { DpTrendChart, type DpTrendFault, type DpTrendSeries } from './DpTrendChart';

type TrendResponse = {
  from: string;
  to: string;
  bucket: TrendBucket;
  series: DpTrendSeries[];
};

type FaultHistoryItem = {
  id: string;
  status: string;
  faultCode: string | null;
  title: string;
  openedAt: string;
  closedAt: string | null;
  conditionStartedAt: string | null;
  connectivity: boolean;
};

type FaultHistoryResponse = {
  items: FaultHistoryItem[];
  nextCursor: string | null;
};

const PRESETS: Array<{ key: TrendPreset; label: string }> = [
  { key: '24h', label: '近 24 小时' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
];

type Props = {
  deviceId: string;
  productId: string;
  now?: Date;
};

export function DpTrendPanel({ deviceId, productId, now }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [preset, setPreset] = useState<TrendPreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selected, setSelected] = useState<string[] | null>(() => readTrendSelection(productId));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [compare, setCompare] = useState(false);
  const [series, setSeries] = useState<DpTrendSeries[]>([]);
  const [domain, setDomain] = useState<{ from: string; to: string; bucket: TrendBucket } | null>(null);
  const [faults, setFaults] = useState<DpTrendFault[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const numericDps = useMemo(
    () => getProductDps(productId).filter((dp) => dp.type === 'value'),
    [productId],
  );

  useEffect(() => {
    setSelected(readTrendSelection(productId));
    setHidden(new Set());
  }, [productId]);

  const requestedWindow = useMemo(() => {
    if (customFrom && customTo) {
      const from = new Date(customFrom);
      const to = new Date(customTo);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
      const span = to.getTime() - from.getTime();
      if (span <= 0) return { error: '开始时间要早于结束时间' as const };
      if (span > TREND_MAX_RANGE_MS) return { error: '区间不能超过 90 天' as const };
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        bucket: bucketForRange(span),
      };
    }
    return trendWindow(preset, now ?? new Date());
  }, [customFrom, customTo, now, preset]);

  useEffect(() => {
    if (requestedWindow && 'error' in requestedWindow) {
      setError(requestedWindow.error);
      setSeries([]);
      setDomain(null);
      return;
    }
    if (selected && selected.length === 0) {
      setSeries([]);
      setDomain(requestedWindow);
      setLoading(false);
      setError(null);
      return;
    }
    if (!requestedWindow) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<TrendResponse>(
      `/api/devices/${encodeURIComponent(deviceId)}/dp-trends${qs({
        dpIds: selected ? selected.join(',') : undefined,
        from: requestedWindow.from,
        to: requestedWindow.to,
        bucket: requestedWindow.bucket,
      })}`,
    )
      .then((res) => {
        if (cancelled) return;
        setSeries(res.series ?? []);
        setDomain({
          from: res.from || requestedWindow.from,
          to: res.to || requestedWindow.to,
          bucket: res.bucket || requestedWindow.bucket,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSeries([]);
        setDomain(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, requestedWindow, selected, reload]);

  useEffect(() => {
    if (!expanded || !compare || !domain) {
      setFaults([]);
      return;
    }
    let cancelled = false;
    const bounds = domain;
    (async () => {
      const marks: DpTrendFault[] = [];
      let cursor: string | undefined;
      try {
        for (let page = 0; page < 8; page += 1) {
          const res = await api<FaultHistoryResponse>(
            `/api/devices/${encodeURIComponent(deviceId)}/fault-history${qs({
              from: bounds.from,
              to: bounds.to,
              includeConnectivity: '0',
              cursor,
            })}`,
          );
          for (const item of res.items) {
            if (item.connectivity) continue;
            marks.push({
              id: item.id,
              label: item.faultCode || item.title || '故障',
              start: item.conditionStartedAt || item.openedAt,
              end: item.closedAt || bounds.to,
              open: item.status !== 'closed',
            });
          }
          if (!res.nextCursor) break;
          cursor = res.nextCursor;
        }
        if (!cancelled) setFaults(marks);
      } catch (e) {
        if (!cancelled) {
          setFaults([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compare, deviceId, expanded, domain]);

  const checked = selected ?? series.map((item) => item.dpId);
  const options =
    numericDps.length > 0
      ? numericDps.map((dp) => ({
          code: dp.code,
          name: dp.name,
          unit: typeof dp.values?.unit === 'string' ? dp.values.unit : '',
        }))
      : series.map((item) => ({ code: item.dpId, name: item.name, unit: item.unit ?? '' }));
  const checkedNames = checked.map(
    (code) => options.find((item) => item.code === code)?.name || series.find((item) => item.dpId === code)?.name || code,
  );
  const hasPoints = series.some((item) => item.points.length > 0);

  function toggleCode(code: string) {
    const base = selected ?? series.map((item) => item.dpId);
    const next = base.includes(code) ? base.filter((item) => item !== code) : [...base, code];
    if (next.length > TREND_SERIES_LIMIT) {
      setError('最多同时看 8 条');
      return;
    }
    setError(null);
    setSelected(next);
    writeTrendSelection(productId, next);
  }

  return (
    <section className="card dp-trend" aria-label="参数走势">
      <div className="section-bar">
        <h2>参数走势</h2>
        <div className="row gap">
          <button type="button" className="btn" onClick={() => setExpanded((value) => !value)}>
            {expanded ? '收起' : '展开'}
          </button>
        </div>
      </div>
      <p className="hint dp-trend-picks">常用 DP：{loading && checkedNames.length === 0 ? '加载中' : checkedNames.join('、') || '尚未选择'}</p>
      {error && <p className="error">{error}</p>}
      {expanded && (
        <>
          <div className="row gap dp-trend-tools">
            <div className="seg" role="group" aria-label="走势时间">
              {PRESETS.map((item) => (
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
            <label className="muted check-label">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
              对比故障
            </label>
            <button type="button" className="btn" onClick={() => setReload((value) => value + 1)}>
              刷新
            </button>
          </div>
          {options.length > 0 && (
            <div className="dp-trend-choices">
              {options.map((item) => (
                <label key={item.code} className="check-label">
                  <input
                    type="checkbox"
                    checked={checked.includes(item.code)}
                    onChange={() => toggleCode(item.code)}
                  />
                  {item.name}
                  {item.unit ? ` ${item.unit}` : ''}
                </label>
              ))}
            </div>
          )}
          {loading && !hasPoints ? (
            <p className="hint">加载中</p>
          ) : !hasPoints ? (
            <p className="hint">
              这段时间没有数值上报。若设备长期离线，或桥接没有把属性事件写进来，曲线会是空的。
            </p>
          ) : domain ? (
            <DpTrendChart
              series={series}
              hidden={hidden}
              from={domain.from}
              to={domain.to}
              bucket={domain.bucket}
              faults={compare ? faults : []}
              onToggle={(dpId) => {
                setHidden((current) => {
                  const next = new Set(current);
                  if (next.has(dpId)) next.delete(dpId);
                  else next.add(dpId);
                  return next;
                });
              }}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
