import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { DataModeBar, useAnalyticsDataMode } from '../components/DataModeBar';
import { formatProductLabel } from '../constants/product-names';
import type { DataModeChoice } from '../data-mode/preference';
import { formatFaultDuration } from '../utils/format-fault-duration';

type FaultCorrelation = {
  productId: string;
  faultCode: string;
  newCount: number;
  liveFaultDevices: number;
};

export function groupFaultsByProduct(rows: FaultCorrelation[]): Array<{
  productId: string;
  rows: FaultCorrelation[];
}> {
  const groups = new Map<string, FaultCorrelation[]>();
  for (const row of rows) {
    const list = groups.get(row.productId) ?? [];
    list.push(row);
    groups.set(row.productId, list);
  }
  return [...groups.entries()]
    .map(([productId, items]) => ({
      productId,
      total: items.reduce((sum, item) => sum + item.newCount + item.liveFaultDevices, 0),
      rows: [...items].sort(
        (a, b) => b.newCount - a.newCount || a.faultCode.localeCompare(b.faultCode),
      ),
    }))
    .sort((a, b) => b.total - a.total || a.productId.localeCompare(b.productId))
    .map(({ productId, rows: grouped }) => ({ productId, rows: grouped }));
}

type FaultsAnalytics = {
  startDay: string;
  endDay: string;
  productId: string | null;
  kpis: {
    faultDevicesNow: number;
    openAlerts: number;
    avgMttrMinutes: number | null;
    avgDurationMinutes: number | null;
    qualityFaultDevices: number;
    inServiceDevices: number;
    qualityFaultRate: number | null;
    pendingDeviceCount: number;
    surveyFault: unknown;
  };
  dailyTrend: Array<{
    day: string;
    newCount: number;
    closedCount: number;
    openCount: number;
  }>;
  faultCodeHistogram: Array<{ productId: string; faultCode: string; count: number }>;
  correlation: Array<{
    productId: string;
    faultCode: string;
    newCount: number;
    liveFaultDevices: number;
  }>;
  byLocation?: Array<{ location: string; count: number }>;
  warnings: string[];
  virtual?: boolean;
  quotaExhausted?: boolean;
};

export function FaultsAnalyticsPage() {
  const dataMode = useAnalyticsDataMode();
  const { applyPresetDays } = useAnalyticsRange();
  const [preset, setPreset] = useState<DayPreset>('30');
  const [startDay, setStartDay] = useState(() => daysAgoYmd(29));
  const [endDay, setEndDay] = useState(() => todayYmdLocal());
  const [productId, setProductId] = useState('');
  const [data, setData] = useState<FaultsAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(opts?: {
    startDay?: string;
    endDay?: string;
    productId?: string;
    dataSource?: DataModeChoice;
    probe?: boolean;
  }) {
    setLoading(true);
    setError(null);
    const source = opts?.dataSource ?? dataMode.pref.mode;
    try {
      const res = await api<FaultsAnalytics>(
        `/api/analytics/faults${qs({
          startDay: opts?.startDay ?? startDay,
          endDay: opts?.endDay ?? endDay,
          productId: (opts?.productId ?? productId) || undefined,
          dataSource: source,
          probe: opts?.probe ? '1' : undefined,
        })}`,
      );
      dataMode.accept(res);
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

  const faultGroups = data ? groupFaultsByProduct(data.correlation) : [];

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          故障看板
          <span className="hint">质量故障率 · 待处理 · 持续时长</span>
        </h1>
        <div className="row gap">
          <Link className="btn" to="/alerts">
            告警列表
          </Link>
          <button type="button" className="btn" disabled={loading} onClick={() => void load()}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>
      </div>

      <DataModeBar
        mode={dataMode.pref.mode}
        manual={dataMode.pref.manual}
        quotaExhausted={dataMode.pref.quotaExhausted || Boolean(data?.quotaExhausted)}
        showingVirtual={Boolean(data?.virtual) || dataMode.pref.mode === 'virtual'}
        onSelect={(mode) => {
          dataMode.select(mode);
          void load({ dataSource: mode, probe: mode === 'live' });
        }}
      />

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
      {data?.warnings?.map((w) => (
        <p key={w} className="warn">
          {w}
        </p>
      ))}

      {data && (
        <>
          <div className="kpi-grid">
            <KpiCard
              label="质量故障率"
              value={
                data.kpis.qualityFaultRate == null
                  ? '—'
                  : `${(data.kpis.qualityFaultRate * 100).toFixed(1)}%`
              }
              sub={`故障设备 ${formatNumber(data.kpis.qualityFaultDevices)} / 在网 ${formatNumber(data.kpis.inServiceDevices)}`}
            />
            <KpiCard label="待处理台数" value={data.kpis.pendingDeviceCount} />
            <KpiCard
              label="平均持续时长"
              value={
                data.kpis.avgDurationMinutes == null
                  ? '—'
                  : formatFaultDuration(data.kpis.avgDurationMinutes)
              }
            />
            <KpiCard
              label="区间新发（聚合）"
              value={data.dailyTrend.reduce((s, d) => s + d.newCount, 0)}
            />
          </div>

          <div className="dash-charts">
            <section className="card chart-card">
              <h2>每日新发告警</h2>
              <MiniSparkline
                values={data.dailyTrend.map((r) => ({ day: r.day, value: r.newCount }))}
                color="#c4242a"
                valueLabel="新发告警"
                emptyHint="暂无故障日聚合，可设 ANALYTICS_ROLLUP_ON_START=true"
              />
            </section>
            <section className="card chart-card">
              <h2>每日关闭告警</h2>
              <MiniSparkline
                values={data.dailyTrend.map((r) => ({ day: r.day, value: r.closedCount }))}
                color="#0d7a4f"
                valueLabel="关闭告警"
              />
            </section>
          </div>

          <section className="card">
            <h2>故障码分析</h2>
            <p className="muted">按产品分开。同一个故障码在不同产品里不合并。</p>
            {faultGroups.length === 0 ? (
              <p className="hint">暂无故障码数据</p>
            ) : (
              faultGroups.map((group) => {
                const max = Math.max(1, ...group.rows.map((row) => row.newCount));
                return (
                  <section key={group.productId} aria-label={formatProductLabel(group.productId)}>
                    <h3>{formatProductLabel(group.productId)}</h3>
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>故障码</th>
                            <th>区间新发</th>
                            <th>当前故障设备</th>
                            <th>分布</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr key={row.faultCode} className="no-click">
                              <td>{row.faultCode}</td>
                              <td className="mono">{formatNumber(row.newCount)}</td>
                              <td className="mono">{formatNumber(row.liveFaultDevices)}</td>
                              <td>
                                <div className="bar-track">
                                  <div
                                    className="bar-fill"
                                    style={{ width: `${(row.newCount / max) * 100}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })
            )}
          </section>

          <section className="card">
            <h2>关联：故障 × 地区（可读地址）</h2>
            <BarTable
              nameHeader="地区"
              rows={(data.byLocation ?? []).map((r) => ({
                name: r.location,
                value: r.count,
              }))}
            />
          </section>
        </>
      )}
    </div>
  );
}
