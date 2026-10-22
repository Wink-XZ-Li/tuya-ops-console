import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

type HealthLevel = 'healthy' | 'degraded' | 'critical';
type HealthSeverity = 'warn' | 'crit';

type HealthComponent = {
  key: string;
  label: string;
  status: HealthLevel;
  summary: string;
};

type HealthIssue = {
  code: string;
  severity: HealthSeverity;
  title: string;
  since?: string;
  impact: string;
  steps: string[];
  commands: string[];
  status: 'open';
  related?: {
    deviceEventMaxAt?: string;
    deviceLastSeenMaxAt?: string;
    kafkaHw?: number;
    lag?: number;
  };
};

type HealthReport = {
  status: HealthLevel;
  checkedAt: string;
  durationMs: number;
  components: HealthComponent[];
  issues: HealthIssue[];
};

const LEVEL_LABEL: Record<HealthLevel, string> = {
  healthy: '正常',
  degraded: '降级',
  critical: '严重',
};

const LEVEL_CLASS: Record<HealthLevel, string> = {
  healthy: 'ok',
  degraded: 'warn',
  critical: 'bad',
};

const REFRESH_MS = 60_000;

function StatusBadge({ status }: { status: HealthLevel }) {
  return <span className={`pill ${LEVEL_CLASS[status]}`}>{LEVEL_LABEL[status]}</span>;
}

function formatElapsed(since: string | undefined, checkedAt: string): string {
  if (!since) return '—';
  const ms = new Date(checkedAt).getTime() - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'true');
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function ComponentGrid({ components }: { components: HealthComponent[] }) {
  return (
    <div className="health-grid">
      {components.map((item) => (
        <section key={item.key} className={`health-card ${item.status}`}>
          <StatusBadge status={item.status} />
          <h3>{item.label}</h3>
          <p>{item.summary}</p>
        </section>
      ))}
    </div>
  );
}

function IssueTable({
  report,
  copiedCode,
  onCopy,
}: {
  report: HealthReport;
  copiedCode: string | null;
  onCopy: (issue: HealthIssue) => void;
}) {
  if (report.issues.length === 0) {
    return <p className="muted">当前没有未恢复的链路故障。</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>故障码</th>
            <th>标题</th>
            <th>级别</th>
            <th>开始时间</th>
            <th>持续</th>
            <th>影响</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {report.issues.map((issue) => (
            <Fragment key={issue.code}>
              <tr className="no-click">
                <td className="mono">{issue.code}</td>
                <td>{issue.title}</td>
                <td>
                  <span className={`pill ${issue.severity === 'crit' ? 'bad' : 'warn'}`}>
                    {issue.severity === 'crit' ? '严重' : '警告'}
                  </span>
                </td>
                <td>{formatWhen(issue.since)}</td>
                <td>{formatElapsed(issue.since, report.checkedAt)}</td>
                <td>{issue.impact}</td>
                <td>{issue.status}</td>
              </tr>
              <tr className="no-click">
                <td colSpan={7}>
                  <div className="health-runbook">
                    <ol className="issue-steps">
                      {issue.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {issue.commands.length > 0 && (
                      <>
                        <pre className="cmd-block">{issue.commands.join('\n')}</pre>
                        <button type="button" className="btn" onClick={() => onCopy(issue)}>
                          {copiedCode === issue.code ? '已复制' : '复制全部命令'}
                        </button>
                        <span className="hint">复制后在仓库根目录的终端执行。这个页面不会执行命令。</span>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SystemHealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (kind: 'get' | 'post') => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const next =
        kind === 'post'
          ? await api<HealthReport>('/api/system-health/check', { method: 'POST' })
          : await api<HealthReport>('/api/system-health');
      if (id !== seq.current) return;
      setReport(next);
    } catch (err) {
      if (id !== seq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('get');
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void load('get');
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  async function copyCommands(issue: HealthIssue) {
    const text = issue.commands.join('\n');
    if (!text) return;
    try {
      await copyText(text);
      setCopiedCode(issue.code);
      window.setTimeout(() => {
        setCopiedCode((current) => (current === issue.code ? null : current));
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败');
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>系统健康</h1>
          <p className="device-product">
            看 API、MySQL、Redpanda、Kafka 消费、Bridge 和事件是否还在写入。这里不是设备故障码。
          </p>
        </div>
        {report && <StatusBadge status={report.status} />}
      </div>

      <div className="card">
        <div className="filters">
          <label className="check-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            每 60 秒刷新
          </label>
          <button
            type="button"
            className="btn primary"
            onClick={() => void load('post')}
            disabled={loading}
          >
            {loading ? '探测中…' : '立即探测'}
          </button>
          {report && (
            <span className="muted">
              最后探测 {formatWhen(report.checkedAt)} · 耗时 {report.durationMs} ms
            </span>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {!report && error && (
          <section className="health-card critical">
            <StatusBadge status="critical" />
            <h3>API</h3>
            <p>无响应</p>
          </section>
        )}
        {report && (
          <div className="stack">
            <ComponentGrid components={report.components} />
            <IssueTable report={report} copiedCode={copiedCode} onCopy={(issue) => void copyCommands(issue)} />
          </div>
        )}
      </div>
    </div>
  );
}
