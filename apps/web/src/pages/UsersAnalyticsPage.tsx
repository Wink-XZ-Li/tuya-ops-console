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

type UsersInsights = {
  startDay: string;
  endDay: string;
  productId: string | null;
  star: {
    register: Array<{ dt: string; todayRegisterNum: number; totalRegisterNum: number }>;
    control: Array<{ dt: string; controlNum: number; controlUserNum: number }>;
    locations: { dateType: string; items: Array<{ name: string; value: number; percentage: string }> };
    kpis: {
      registerTotal: number;
      registerNew: number;
      controlTotal: number;
      controlUsers: number;
    };
  };
  local: {
    endUserTotal: number;
    boundUserCount: number;
    boundUserRate: number | null;
    bindingDistribution: { zero: number; one: number; two: number; threePlus: number };
    countryCodeDistribution: Array<{ countryCode: string; count: number }>;
  };
  warnings: string[];
};

export function UsersAnalyticsPage() {
  const { applyPresetDays } = useAnalyticsRange();
  const [preset, setPreset] = useState<DayPreset>('30');
  const [startDay, setStartDay] = useState(() => daysAgoYmd(29));
  const [endDay, setEndDay] = useState(() => todayYmdLocal());
  const [productId, setProductId] = useState('');
  const [data, setData] = useState<UsersInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(opts?: { startDay?: string; endDay?: string; productId?: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await api<UsersInsights>(
        `/api/analytics/users-insights${qs({
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

  const bd = data?.local.bindingDistribution;

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          用户分析
          <span className="hint">涂鸦数据星象仪 · 本地绑定</span>
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
      {data?.warnings?.map((w) => (
        <p key={w} className="warn">
          {w}
        </p>
      ))}

      {data && (
        <>
          <div className="kpi-grid">
            <KpiCard
              label="累计注册"
              value={data.star.kpis.registerTotal}
              sub="来源：涂鸦数据星象仪"
            />
            <KpiCard
              label="区间新增注册"
              value={data.star.kpis.registerNew}
              sub="来源：涂鸦数据星象仪"
            />
            <KpiCard
              label="区间控制次数"
              value={data.star.kpis.controlTotal}
              sub={`来源：涂鸦数据星象仪 · 控制用户 ${formatNumber(data.star.kpis.controlUsers)}`}
            />
            <KpiCard
              label="有绑定的用户占比"
              value={
                data.local.boundUserRate == null
                  ? '—'
                  : `${(data.local.boundUserRate * 100).toFixed(1)}%`
              }
              sub={`有绑定 ${formatNumber(data.local.boundUserCount)} / 本地用户 ${formatNumber(data.local.endUserTotal)}`}
            />
          </div>

          <div className="dash-charts">
            <section className="card chart-card">
              <h2>
                每日新增注册
                <span className="hint">来源：涂鸦数据星象仪</span>
              </h2>
              <MiniSparkline
                values={data.star.register.map((r) => ({
                  day: r.dt,
                  value: r.todayRegisterNum,
                }))}
                valueLabel="新增注册"
              />
            </section>
            <section className="card chart-card">
              <h2>
                每日控制次数
                <span className="hint">来源：涂鸦数据星象仪</span>
              </h2>
              <MiniSparkline
                values={data.star.control.map((r) => ({ day: r.dt, value: r.controlNum }))}
                color="#0d7a4f"
                valueLabel="控制次数"
                emptyHint="该区间暂无控制数据"
              />
            </section>
          </div>

          <section className="card">
            <h2>
              激活地区分布
              <span className="hint">来源：涂鸦数据星象仪 · date_type={data.star.locations.dateType}</span>
            </h2>
            <BarTable
              nameHeader="地区"
              rows={data.star.locations.items.map((i) => ({
                name: i.name,
                value: i.value,
                pct: i.percentage,
              }))}
            />
          </section>

          <div className="dash-charts">
            <section className="card">
              <h2>绑定数分布（本地用户）</h2>
              <BarTable
                nameHeader="绑定数"
                rows={[
                  { name: '0 台', value: bd?.zero ?? 0 },
                  { name: '1 台', value: bd?.one ?? 0 },
                  { name: '2 台', value: bd?.two ?? 0 },
                  { name: '3+ 台', value: bd?.threePlus ?? 0 },
                ]}
              />
            </section>
            <section className="card">
              <h2>国家/地区码分布</h2>
              <BarTable
                nameHeader="countryCode"
                rows={data.local.countryCodeDistribution.map((r) => ({
                  name: r.countryCode,
                  value: r.count,
                }))}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
