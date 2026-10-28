import { FormEvent, ReactNode } from 'react';
import { formatProductLabel, PRODUCT_IDS } from '../constants/product-names';
import { TrendChart } from './TrendChart';

export type DayPreset = '7' | '30' | 'custom';

export function todayYmdLocal(): string {
  return formatYmd(new Date());
}

export function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatYmd(d);
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function ymdToInput(ymd: string): string {
  if (ymd.length !== 8) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

export function inputToYmd(value: string): string {
  return value.replace(/-/g, '');
}

export function formatDtLabel(dt: string): string {
  if (dt.length !== 8) return dt;
  return `${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(n);
}

type Props = {
  preset: DayPreset;
  startDay: string;
  endDay: string;
  productId: string;
  loading?: boolean;
  onPreset: (preset: DayPreset) => void;
  onStartDay: (ymd: string) => void;
  onEndDay: (ymd: string) => void;
  onProductId: (id: string) => void;
  onSubmit: (e: FormEvent) => void;
  extra?: ReactNode;
};

export function AnalyticsFilters({
  preset,
  startDay,
  endDay,
  productId,
  loading,
  onPreset,
  onStartDay,
  onEndDay,
  onProductId,
  onSubmit,
  extra,
}: Props) {
  return (
    <form className="filters" onSubmit={onSubmit}>
      <div className="field">
        <label>区间</label>
        <div className="row gap">
          <button
            type="button"
            className={`btn ${preset === '7' ? 'primary' : ''}`}
            onClick={() => onPreset('7')}
          >
            近 7 天
          </button>
          <button
            type="button"
            className={`btn ${preset === '30' ? 'primary' : ''}`}
            onClick={() => onPreset('30')}
          >
            近 30 天
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="an-start">开始</label>
        <input
          id="an-start"
          type="date"
          value={ymdToInput(startDay)}
          onChange={(e) => onStartDay(inputToYmd(e.target.value))}
        />
      </div>
      <div className="field">
        <label htmlFor="an-end">结束</label>
        <input
          id="an-end"
          type="date"
          value={ymdToInput(endDay)}
          onChange={(e) => onEndDay(inputToYmd(e.target.value))}
        />
      </div>
      <div className="field">
        <label htmlFor="an-pid">产品（可选）</label>
        <select id="an-pid" value={productId} onChange={(e) => onProductId(e.target.value)}>
          <option value="">全部</option>
          {PRODUCT_IDS.map((id) => (
            <option key={id} value={id}>
              {formatProductLabel(id)}
            </option>
          ))}
        </select>
      </div>
      {extra}
      <button type="submit" className="btn primary" disabled={loading}>
        查询
      </button>
    </form>
  );
}

export function useAnalyticsRange() {
  // lightweight helpers for pages — state lives in each page
  return {
    applyPresetDays(preset: Exclude<DayPreset, 'custom'>): { startDay: string; endDay: string } {
      if (preset === '7') return { startDay: daysAgoYmd(6), endDay: todayYmdLocal() };
      return { startDay: daysAgoYmd(29), endDay: todayYmdLocal() };
    },
  };
}

export function MiniSparkline({
  values,
  color = '#1a1a1a',
  emptyHint = '暂无数据',
  valueLabel = '数值',
}: {
  values: Array<{ day: string; value: number }>;
  color?: string;
  emptyHint?: string;
  valueLabel?: string;
}) {
  return (
    <TrendChart values={values} color={color} emptyHint={emptyHint} valueLabel={valueLabel} />
  );
}

export function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  const display = typeof value === 'number' ? formatNumber(value) : value;
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono">{display}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function BarTable({
  rows,
  nameHeader,
}: {
  rows: Array<{ name: string; value: number; pct?: string }>;
  nameHeader: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="hint">暂无数据</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{nameHeader}</th>
            <th>数量</th>
            {rows.some((r) => r.pct) && <th>占比</th>}
            <th>分布</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="no-click">
              <td>{row.name}</td>
              <td className="mono">{formatNumber(row.value)}</td>
              {rows.some((r) => r.pct) && <td className="mono">{row.pct ?? ''}</td>}
              <td>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(row.value / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
