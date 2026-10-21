import { FormEvent, useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import {
  AnalyticsFilters,
  BarTable,
  DayPreset,
  KpiCard,
  MiniSparkline,
  daysAgoYmd,
  formatNumber,
  todayYmdLocal,
  useAnalyticsRange,
} from '../components/AnalyticsFilters';
import { formatProductLabel } from '../constants/product-names';

type DevicesUsage = {
  startDay: string;
  endDay: string;
  productId: string | null;
  live: {
    total: number;
    online: number;
    offline: number;
    fault: number;
    onlineRate: number;
    byProduct: Array<{
      productId: string;
      online: number;
      offline: number;
      fault: number;
      total: number;
    }>;
    modeDistribution: Array<{ mode: string; count: number }>;
  };
  dailyTrend: Array<{
    day: string;
    onlineCount: number;
    offlineCount: number;
    faultCount: number;
    totalDevices: number;
    onlineRate: number;
  }>;
};

export function DevicesAnalyticsPage() {
  const { applyPresetDays } = useAnalyticsRange();
  const [preset, setPreset] = useState<DayPreset>('30');
  const [startDay, setStartDay] = useState(() => daysAgoYmd(29));
  const [endDay, setEndDay] = useState(() => todayYmdLocal());
  const [productId, setProductId] = useState('');
  const [data, setData] = useState<DevicesUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(opts?: { startDay?: string; endDay?: string; productId?: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await api<DevicesUsage>(
        `/api/analytics/devices-usage${qs({
          startDay: opts?.startDay ?? startDay,
          endDay: opts?.endDay ?? endDay,
          productId: (opts?.productId ?? productId) || undefined,
        })}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPreset(next: DayPreset) {
    if (next === 'custom') return;
    setPreset(next);
    const range = applyPresetDays(next);
    setStartDay(range.startDay);
    setEndDay(range.endDay);
    void load(range);
  }

  function onFilter(e: FormEvent) {
    e.preventDefault();
    setPreset('custom');
    void load();
  }

  const faultRate =
    data && data.live.total > 0
      ? `${((data.live.fault / data.live.total) * 100).toFixed(1)}%`
      : '—';

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          设备使用分析
          <span className="hint">当前快照在线率 · 模式 · 故障率</span>
        </h1>
        <button type="button" className="btn" disabled={loading} onClick={() => void load()}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      <AnalyticsFilters
        preset={preset}
        startDay={startDay}
        endDay={endDay}
        productId={productId}
        loading={loading}
        onPreset={onPreset}
        onStartDay={(v) => {
          setPreset('custom');
          setStartDay(v);
        }}
        onEndDay={(v) => {
          setPreset('custom');
          setEndDay(v);
        }}
        onProductId={setProductId}
        onSubmit={onFilter}
      />

      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="kpi-grid">
            <KpiCard label="纳管设备" value={data.live.total} />
            <KpiCard
              label="当前快照在线率"
              value={`${(data.live.onlineRate * 100).toFixed(1)}%`}
              sub={`在线 ${formatNumber(data.live.online)} / 离线 ${formatNumber(data.live.offline)}`}
            />
            <KpiCard label="故障设备" value={data.live.fault} sub={`故障率 ${faultRate}`} />
            <KpiCard
              label="识别到模式的设备"
              value={data.live.modeDistribution.reduce((s, m) => s + m.count, 0)}
            />
          </div>

          <div className="dash-charts">
            <section className="card chart-card">
              <h2>日在线设备数</h2>
              <MiniSparkline
                values={data.dailyTrend.map((r) => ({ day: r.day, value: r.onlineCount }))}
                valueLabel="在线设备"
                emptyHint="暂无日聚合，启动 API 后会自动写入"
              />
            </section>
            <section className="card chart-card">
              <h2>日故障设备数</h2>
              <MiniSparkline
                values={data.dailyTrend.map((r) => ({ day: r.day, value: r.faultCount }))}
                color="#c4242a"
                valueLabel="故障设备"
                emptyHint="暂无日聚合"
              />
            </section>
          </div>

          <div className="dash-charts">
            <section className="card">
              <h2>运行模式分布（最新状态）</h2>
              <BarTable
                nameHeader="模式"
                rows={data.live.modeDistribution.map((m) => ({
                  name: m.mode,
                  value: m.count,
                }))}
              />
            </section>
            <section className="card">
              <h2>分产品机群</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>产品</th>
                      <th>总数</th>
                      <th>在线</th>
                      <th>离线</th>
                      <th>故障</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.live.byProduct.map((row) => (
                      <tr key={row.productId} className="no-click">
                        <td>{formatProductLabel(row.productId)}</td>
                        <td className="mono">{formatNumber(row.total)}</td>
                        <td className="mono">{formatNumber(row.online)}</td>
                        <td className="mono">{formatNumber(row.offline)}</td>
                        <td className="mono">{formatNumber(row.fault)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
