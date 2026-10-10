import { FormEvent, useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import {
  AnalyticsFilters,
  DayPreset,
  daysAgoYmd,
  formatNumber,
  todayYmdLocal,
  useAnalyticsRange,
  ymdToInput,
} from '../components/AnalyticsFilters';
import { getRole } from '../auth/storage';

type ReportListItem = {
  id: string;
  name: string;
  template: string;
  startDay: string;
  endDay: string;
  productId: string | null;
  sections: unknown;
  status: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type ReportDetail = ReportListItem & {
  csvText: string | null;
  resultJson: unknown;
};

const SECTION_OPTIONS = [
  { id: 'all', label: '全部章节' },
  { id: 'users', label: '用户分析' },
  { id: 'devices', label: '设备使用' },
  { id: 'faults', label: '故障分析' },
  { id: 'dashboard', label: '运营看板' },
] as const;

export function ReportsPage() {
  const role = getRole();
  const canCreate = role === 'operator' || role === 'admin';
  const { applyPresetDays } = useAnalyticsRange();

  const [preset, setPreset] = useState<DayPreset>('7');
  const [startDay, setStartDay] = useState(() => daysAgoYmd(6));
  const [endDay, setEndDay] = useState(() => todayYmdLocal());
  const [productId, setProductId] = useState('');
  const [template, setTemplate] = useState<'week' | 'month' | 'custom'>('week');
  const [sections, setSections] = useState<string[]>(['all']);
  const [name, setName] = useState('');

  const [list, setList] = useState<ReportListItem[]>([]);
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const rows = await api<ReportListItem[]>(`/api/analytics/reports${qs({ limit: 50 })}`);
      setList(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openReport(id: string) {
    setError(null);
    try {
      const detail = await api<ReportDetail>(`/api/analytics/reports/${id}`);
      setSelected(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  function onPreset(next: DayPreset) {
    if (next === 'custom') return;
    setPreset(next);
    const range = applyPresetDays(next);
    setStartDay(range.startDay);
    setEndDay(range.endDay);
    setTemplate(next === '7' ? 'week' : 'month');
  }

  function toggleSection(id: string) {
    setSections((prev) => {
      if (id === 'all') return ['all'];
      const withoutAll = prev.filter((s) => s !== 'all');
      if (withoutAll.includes(id)) {
        const next = withoutAll.filter((s) => s !== id);
        return next.length ? next : ['all'];
      }
      return [...withoutAll, id];
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api<ReportDetail>('/api/analytics/reports', {
        method: 'POST',
        body: JSON.stringify({
          template,
          startDay,
          endDay,
          productId: productId || undefined,
          sections,
          name: name.trim() || undefined,
        }),
      });
      setSelected(created);
      setName('');
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  function downloadCsv() {
    if (!selected?.csvText) return;
    const blob = new Blob([selected.csvText], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.name || selected.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          运营报表
          <span className="hint">周报 / 月报 · CSV</span>
        </h1>
        <button type="button" className="btn" disabled={loading} onClick={() => void loadList()}>
          {loading ? '加载中…' : '刷新列表'}
        </button>
      </div>

      {canCreate && (
        <section className="card">
          <h2>生成报表</h2>
          <AnalyticsFilters
            preset={preset}
            startDay={startDay}
            endDay={endDay}
            productId={productId}
            loading={creating}
            onPreset={onPreset}
            onStartDay={(v) => {
              setPreset('custom');
              setTemplate('custom');
              setStartDay(v);
            }}
            onEndDay={(v) => {
              setPreset('custom');
              setTemplate('custom');
              setEndDay(v);
            }}
            onProductId={setProductId}
            onSubmit={onCreate}
            extra={
              <>
                <div className="field">
                  <label htmlFor="rpt-tpl">模板</label>
                  <select
                    id="rpt-tpl"
                    value={template}
                    onChange={(e) => setTemplate(e.target.value as 'week' | 'month' | 'custom')}
                  >
                    <option value="week">周报</option>
                    <option value="month">月报</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rpt-name">名称（可选）</label>
                  <input
                    id="rpt-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="默认自动生成"
                  />
                </div>
              </>
            }
          />
          <div className="row gap" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {SECTION_OPTIONS.map((opt) => (
              <label key={opt.id} className="row gap" style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={sections.includes(opt.id)}
                  onChange={() => toggleSection(opt.id)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            将汇总所选章节并生成 CSV（operator/admin）
          </p>
        </section>
      )}

      {!canCreate && (
        <p className="hint">只读角色可查看历史报表；生成需要 operator 或 admin。</p>
      )}

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>历史报表</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>名称</th>
                <th>模板</th>
                <th>区间</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr className="no-click">
                  <td colSpan={5} className="hint">
                    暂无报表
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id} onClick={() => void openReport(row.id)}>
                    <td>{row.name}</td>
                    <td>{row.template}</td>
                    <td className="mono">
                      {ymdToInput(row.startDay)} ~ {ymdToInput(row.endDay)}
                    </td>
                    <td>{row.status}</td>
                    <td className="mono">{new Date(row.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="card">
          <div className="page-header">
            <h2>
              {selected.name}
              <span className="hint">{selected.status}</span>
            </h2>
            <button
              type="button"
              className="btn primary"
              disabled={!selected.csvText || selected.status !== 'ready'}
              onClick={downloadCsv}
            >
              下载 CSV
            </button>
          </div>
          {selected.error && <p className="error">{selected.error}</p>}
          <p className="hint">
            区间 {ymdToInput(selected.startDay)} ~ {ymdToInput(selected.endDay)}
            {selected.completedAt
              ? ` · 完成于 ${new Date(selected.completedAt).toLocaleString()}`
              : ''}
            {selected.csvText ? ` · CSV ${formatNumber(selected.csvText.length)} 字符` : ''}
          </p>
          {selected.csvText && (
            <pre className="mono" style={{ maxHeight: 280, overflow: 'auto', fontSize: 12 }}>
              {selected.csvText.slice(0, 4000)}
              {selected.csvText.length > 4000 ? '\n…' : ''}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
