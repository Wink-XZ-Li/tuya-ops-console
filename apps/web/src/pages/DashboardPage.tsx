import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import { DataModeBar, useAnalyticsDataMode } from '../components/DataModeBar';
import { TrendChart } from '../components/TrendChart';
import { formatProductLabel, PRODUCT_IDS } from '../constants/product-names';
import type { DataModeChoice } from '../data-mode/preference';

type SeriesPoint = { dt: string; value: number; label?: string };

type DashboardResponse = {
  startDay: string;
  endDay: string;
  productId: string | null;
  cachedAt: string;
  fromCache: boolean;
  note: string;
  kpis: {
    activationTotal: number;
    activationNew: number;
    activeLatest: number;
    registerTotal: number;
    registerNew: number;
    controlTotal: number;
    controlUsers: number;
  };
  series: {
    device: Array<{
      dt: string;
      activationNum: number;
      activationTotalNum: number;
      activeNum: number;
    }>;
    register: Array<{
      dt: string;
      todayRegisterNum: number;
      totalRegisterNum: number;
    }>;
    control: Array<{
      dt: string;
      controlNum: number;
      controlUserNum: number;
    }>;
  };
  locations: {
    dateType: string;
    items: Array<{ name: string; value: number; percentage: string }>;
  };
  warnings: string[];
  virtual?: boolean;
  quotaExhausted?: boolean;
  dataMode?: 'live' | 'virtual';
};

type Preset = '7' | '30' | 'custom';

function todayYmdLocal(): string {
  const d = new Date();
  return formatYmd(d);
}

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatYmd(d);
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function ymdToInput(ymd: string): string {
  if (ymd.length !== 8) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function inputToYmd(value: string): string {
  return value.replace(/-/g, '');
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(n);
}

export function DashboardPage() {
  const dataMode = useAnalyticsDataMode();
  const [preset, setPreset] = useState<Preset>('30');
  const [startDay, setStartDay] = useState(() => daysAgoYmd(29));
  const [endDay, setEndDay] = useState(() => todayYmdLocal());
  const [productId, setProductId] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(opts?: {
    startDay?: string;
    endDay?: string;
    productId?: string;
    refresh?: boolean;
    dataSource?: DataModeChoice;
    probe?: boolean;
  }) {
    setLoading(true);
    setError(null);
    const source = opts?.dataSource ?? dataMode.pref.mode;
    try {
      const res = await api<DashboardResponse>(
        `/api/analytics/dashboard${qs({
          startDay: opts?.startDay ?? startDay,
          endDay: opts?.endDay ?? endDay,
          productId: (opts?.productId ?? productId) || undefined,
          refresh: opts?.refresh ? '1' : undefined,
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

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === '7') {
      const s = daysAgoYmd(6);
      const e = todayYmdLocal();
      setStartDay(s);
      setEndDay(e);
      void load({ startDay: s, endDay: e });
    } else if (next === '30') {
      const s = daysAgoYmd(29);
      const e = todayYmdLocal();
      setStartDay(s);
      setEndDay(e);
      void load({ startDay: s, endDay: e });
    }
  }

  function onFilter(e: FormEvent) {
    e.preventDefault();
    setPreset('custom');
    void load();
  }

  const activationSeries: SeriesPoint[] = (data?.series.device ?? []).map((row) => ({
    dt: row.dt,
    value: row.activationNum,
  }));
  const activeSeries: SeriesPoint[] = (data?.series.device ?? []).map((row) => ({
    dt: row.dt,
    value: row.activeNum,
  }));
  const registerSeries: SeriesPoint[] = (data?.series.register ?? []).map((row) => ({
    dt: row.dt,
    value: row.todayRegisterNum,
  }));
  const controlSeries: SeriesPoint[] = (data?.series.control ?? []).map((row) => ({
    dt: row.dt,
    value: row.controlNum,
  }));

  const maxLocation = Math.max(1, ...(data?.locations.items.map((i) => i.value) ?? [1]));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          运营看板
          <span className="hint">数据星象仪 · App 级</span>
        </h1>
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() => void load({ refresh: true })}
        >
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      <DataModeBar
        mode={dataMode.pref.mode}
        manual={dataMode.pref.manual}
        quotaExhausted={dataMode.pref.quotaExhausted || Boolean(data?.quotaExhausted)}
        showingVirtual={Boolean(data?.virtual) || dataMode.pref.mode === 'virtual'}
        onSelect={(mode) => {
          dataMode.select(mode);
          void load({ dataSource: mode, probe: mode === 'live', refresh: mode === 'live' });
        }}
      />

      <form className="filters" onSubmit={onFilter}>
        <div className="field">
          <label>区间</label>
          <div className="row gap">
            <button
              type="button"
              className={`btn ${preset === '7' ? 'primary' : ''}`}
              onClick={() => applyPreset('7')}
            >
              近 7 天
            </button>
            <button
              type="button"
              className={`btn ${preset === '30' ? 'primary' : ''}`}
              onClick={() => applyPreset('30')}
            >
              近 30 天
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="dash-start">开始</label>
          <input
            id="dash-start"
            type="date"
            value={ymdToInput(startDay)}
            onChange={(e) => {
              setPreset('custom');
              setStartDay(inputToYmd(e.target.value));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="dash-end">结束</label>
          <input
            id="dash-end"
            type="date"
            value={ymdToInput(endDay)}
            onChange={(e) => {
              setPreset('custom');
              setEndDay(inputToYmd(e.target.value));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="dash-pid">产品（可选）</label>
          <select
            id="dash-pid"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">全部 App</option>
            {PRODUCT_IDS.map((id) => (
              <option key={id} value={id}>
                {formatProductLabel(id)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn primary" disabled={loading}>
          查询
        </button>
      </form>

      {data && (
        <p className="hint">
          {data.note}
          {data.virtual ? ' · 虚拟数据' : data.fromCache ? ' · 缓存' : ' · 实时'} · 更新于{' '}
          {new Date(data.cachedAt).toLocaleString()}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {data?.warnings?.map((w) => (
        <p key={w} className="warn">
          {w}
        </p>
      ))}

      {data && (
        <>
          <div className="kpi-grid">
            <Kpi label="累计激活" value={data.kpis.activationTotal} />
            <Kpi label="区间新增激活" value={data.kpis.activationNew} />
            <Kpi label="最新日活跃" value={data.kpis.activeLatest} />
            <Kpi label="累计注册" value={data.kpis.registerTotal} />
            <Kpi label="区间新增注册" value={data.kpis.registerNew} />
            <Kpi
              label="区间控制次数"
              value={data.kpis.controlTotal}
              sub={
                data.kpis.controlUsers
                  ? `控制用户 ${formatNumber(data.kpis.controlUsers)}`
                  : undefined
              }
            />
          </div>

          <div className="dash-charts">
            <ChartCard title="每日新增激活">
              <Sparkline points={activationSeries} color="var(--accent)" />
            </ChartCard>
            <ChartCard title="每日活跃设备">
              <Sparkline points={activeSeries} color="#0d7a4f" />
            </ChartCard>
            <ChartCard title="每日新增注册">
              <Sparkline points={registerSeries} color="#b54708" />
            </ChartCard>
            <ChartCard title="每日控制次数">
              <Sparkline
                points={controlSeries}
                color="#5a6d86"
                emptyHint="该区间暂无控制数据"
              />
            </ChartCard>
          </div>

          <section className="card">
            <h2>
              激活地区分布
              <span className="hint">date_type={data.locations.dateType} · 省</span>
            </h2>
            {data.locations.items.length === 0 ? (
              <p className="hint">暂无地区数据</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>地区</th>
                      <th>数量</th>
                      <th>占比</th>
                      <th>分布</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.locations.items.map((row) => (
                      <tr key={row.name} className="no-click">
                        <td>{row.name}</td>
                        <td className="mono">{formatNumber(row.value)}</td>
                        <td className="mono">{row.percentage}</td>
                        <td>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{ width: `${(row.value / maxLocation) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono">{formatNumber(value)}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card chart-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Sparkline({
  points,
  color,
  emptyHint = '暂无数据',
}: {
  points: SeriesPoint[];
  color: string;
  emptyHint?: string;
}) {
  return (
    <TrendChart
      values={points.map((p) => ({ day: p.dt, value: p.value }))}
      color={color.startsWith('var(') ? '#1a1a1a' : color}
      emptyHint={emptyHint}
    />
  );
}
