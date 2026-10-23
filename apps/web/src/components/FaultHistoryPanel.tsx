import { useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import { faultHistoryBounds, formatTimelineDuration, formatTimelineWhen } from '../utils/fault-history-format';

type RangeKey = '7d' | '30d' | 'all';
type FocusKey = '' | 'open' | 'opened';

export type FaultHistoryItem = {
  id: string;
  status: string;
  category: string | null;
  faultCode: string | null;
  title: string;
  openedAt: string;
  closedAt: string | null;
  conditionStartedAt: string | null;
  occurrenceCount: number;
  closedReason: string | null;
  closedReasonLabel: string | null;
  symptom: string | null;
  suggestedAction: string | null;
  durationMinutes: number;
  connectivity: boolean;
};

type FaultHistoryResponse = {
  items: FaultHistoryItem[];
  summary: {
    openCount: number;
    openedInRange: number;
    longestDurationMinutes: number | null;
  };
  nextCursor: string | null;
};

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'all', label: '全部' },
];

const AUX_PREVIEW = 5;

type Props = {
  deviceId: string;
  /** Fixed clock for tests. The page omits it and uses the request time. */
  now?: Date;
};

export function FaultHistoryPanel({ deviceId, now }: Props) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [includeConnectivity, setIncludeConnectivity] = useState(false);
  const [focus, setFocus] = useState<FocusKey>('');
  const [items, setItems] = useState<FaultHistoryItem[]>([]);
  const [summary, setSummary] = useState<FaultHistoryResponse['summary'] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function queryString(cursor?: string) {
    const bounds = faultHistoryBounds(range, now ?? new Date());
    return qs({
      from: bounds.from,
      to: bounds.to,
      includeConnectivity: includeConnectivity ? '1' : '0',
      focus: focus || undefined,
      cursor,
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(false);
    api<FaultHistoryResponse>(
      `/api/devices/${encodeURIComponent(deviceId)}/fault-history${queryString()}`,
    )
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setSummary(res.summary);
        setNextCursor(res.nextCursor);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setItems([]);
        setSummary(null);
        setNextCursor(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // queryString closes over the filters that already key this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, range, includeConnectivity, focus, now]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await api<FaultHistoryResponse>(
        `/api/devices/${encodeURIComponent(deviceId)}/fault-history${queryString(nextCursor)}`,
      );
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...res.items.filter((item) => !seen.has(item.id))];
      });
      setSummary(res.summary);
      setNextCursor(res.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleFocus(next: Exclude<FocusKey, ''>) {
    setFocus((current) => (current === next ? '' : next));
  }

  const clock = now ?? new Date();
  const rangeLabel = RANGES.find((item) => item.key === range)?.label ?? '近 30 天';
  const longest =
    summary?.longestDurationMinutes == null
      ? '—'
      : formatTimelineDuration(summary.longestDurationMinutes);

  return (
    <section className="card fault-history" aria-label="历史故障">
      <div className="section-bar">
        <h2>历史故障</h2>
        <div className="row gap">
          <div className="seg" role="group" aria-label="时间范围">
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
          <label className="muted check-label">
            <input
              type="checkbox"
              checked={includeConnectivity}
              onChange={(e) => setIncludeConnectivity(e.target.checked)}
            />
            含离线
          </label>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="fault-summary">
        <button
          type="button"
          className={`fault-stat${focus === 'open' ? ' is-active' : ''}`}
          onClick={() => toggleFocus('open')}
        >
          未关闭 {summary?.openCount ?? '—'}
        </button>
        <button
          type="button"
          className={`fault-stat${focus === 'opened' ? ' is-active' : ''}`}
          onClick={() => toggleFocus('opened')}
        >
          {rangeLabel}新开 {summary?.openedInRange ?? '—'}
        </button>
        <span>最长一次持续 {longest}</span>
      </div>

      {loading && items.length === 0 ? (
        <p className="hint">加载中</p>
      ) : items.length === 0 ? (
        <p className="hint">这个范围里没有故障记录</p>
      ) : (
        <ol className="fault-timeline">
          {items.map((item, index) => {
            const code = item.faultCode || item.title || '未知';
            const showAux = expanded || index < AUX_PREVIEW;
            return (
              <li
                key={item.id}
                className={[
                  'fault-item',
                  item.status === 'open'
                    ? 'is-open'
                    : item.status === 'acked'
                      ? 'is-acked'
                      : 'is-closed',
                  item.connectivity ? 'is-connectivity' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="fault-rail" aria-hidden="true">
                  <span className="fault-dot" />
                </span>
                <div className="fault-body">
                  <div className="fault-main">
                    <span className="fault-code mono">{code}</span>
                    {item.connectivity && <span className="fault-tag">离线</span>}
                    {item.symptom && (
                      <span className="fault-symptom" title={item.symptom}>
                        {item.symptom}
                      </span>
                    )}
                    <span className="fault-when">{formatTimelineWhen(item, clock)}</span>
                  </div>
                  {showAux && (
                    <div className="fault-aux">
                      <span>{item.suggestedAction || '无建议动作'}</span>
                      <span>出现 {item.occurrenceCount} 次</span>
                      {item.closedReasonLabel && <span>{item.closedReasonLabel}</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="row gap fault-more">
        {items.length > AUX_PREVIEW && (
          <button type="button" className="btn" onClick={() => setExpanded((value) => !value)}>
            {expanded ? '收起详情' : '展开更多'}
          </button>
        )}
        {nextCursor && (
          <button type="button" className="btn" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? '加载中' : '加载更多'}
          </button>
        )}
      </div>
    </section>
  );
}
