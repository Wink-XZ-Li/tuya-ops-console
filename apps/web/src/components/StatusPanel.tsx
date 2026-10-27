import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { RoleGate } from './RoleGate';

export type DeviceFunction = {
  code: string;
  name?: string;
  type?: string;
  values?: unknown;
  mode?: string;
  alias?: string;
  groupName?: string;
  /** Product DP id from local schema (also used as sort key). */
  sortOrder?: number;
};

type Props = {
  deviceId: string;
  functions: DeviceFunction[];
  statusJson: Record<string, unknown>;
  disabled?: boolean;
  onSent?: () => void;
};

function parseValues(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function enumOptions(values: Record<string, unknown> | null): string[] {
  if (!values) return [];
  const range = values.range ?? values.list ?? values.label;
  if (Array.isArray(range)) return range.map(String);
  return [];
}

function formatStatusValue(value: unknown, values: Record<string, unknown> | null): string {
  if (value === undefined || value === null || value === '') return '—';
  const labels = values && Array.isArray(values.label) ? values.label.map(String) : null;
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : null;
  if (labels && numeric != null && Number.isFinite(numeric)) {
    const n = numeric >>> 0;
    if (n === 0) return '0';
    const active = labels.filter((_, i) => (n & (1 << i)) !== 0);
    return active.length ? `${n} · ${active.join('+')}` : String(n);
  }
  return JSON.stringify(value);
}

function isWritable(fn: DeviceFunction): boolean {
  const mode = (fn.mode ?? 'rw').toLowerCase();
  return mode.includes('w') || mode === 'rw' || mode === 'wr';
}

function formatIssueError(code: string, tuyaResponse: unknown): string {
  if (tuyaResponse && typeof tuyaResponse === 'object' && 'error' in tuyaResponse) {
    const error = (tuyaResponse as { error?: unknown }).error;
    if (error != null && String(error).length > 0) return `下发失败 ${code}：${error}`;
  }
  return `下发失败 ${code}`;
}

const STATUS_PREVIEW_ROWS = 10;

export function StatusPanel({ deviceId, functions, statusJson, disabled, onSent }: Props) {
  const rows = useMemo(() => {
    const byCode = new Map<string, DeviceFunction>();
    for (const fn of functions) byCode.set(fn.code, fn);
    const codes = new Set<string>([
      ...functions.map((f) => f.code),
      ...Object.keys(statusJson ?? {}),
    ]);
    return [...codes]
      .map((code) => {
        const fn = byCode.get(code);
        return {
          code,
          fn,
          writable: fn ? isWritable(fn) : false,
          value: statusJson?.[code],
          sortOrder: fn?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
      );
  }, [functions, statusJson]);

  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (!(row.code in next)) {
          next[row.code] = row.value ?? false;
        }
      }
      return next;
    });
  }, [rows]);

  async function send(code: string) {
    setBusyCode(code);
    setMessage(null);
    setError(null);
    try {
      const res = await api<{ success: boolean; tuyaResponse?: unknown }>(
        `/api/devices/${encodeURIComponent(deviceId)}/commands`,
        {
          method: 'POST',
          body: JSON.stringify({ code, value: drafts[code] }),
        },
      );
      if (res.success) {
        setMessage(`已下发 ${code}`);
      } else {
        setError(formatIssueError(code, res.tuyaResponse));
      }
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyCode(null);
    }
  }

  if (rows.length === 0) {
    return <p className="muted">暂无状态点</p>;
  }

  const showId = rows.some((row) => row.sortOrder !== Number.MAX_SAFE_INTEGER);
  const visible = showAll ? rows : rows.slice(0, STATUS_PREVIEW_ROWS);
  const hiddenCount = rows.length - visible.length;

  return (
    <div>
      <div className="table-wrap">
        <table className="data status-table">
          <thead>
            <tr>
              {showId && <th>id</th>}
              <th>code</th>
              <th>名称</th>
              <th>当前值</th>
              <th>编辑 / 下发</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const fn = row.fn;
              const type = (fn?.type ?? 'string').toLowerCase();
              const parsed = parseValues(fn?.values);
              const options = enumOptions(parsed);
              const label = fn?.alias ?? fn?.name ?? row.code;
              const panelDisabled = Boolean(disabled) || !row.writable;
              const dpId =
                row.sortOrder !== Number.MAX_SAFE_INTEGER ? row.sortOrder : undefined;

              return (
                <tr key={row.code} className="no-click">
                  {showId && <td className="mono">{dpId ?? '—'}</td>}
                  <td className="mono">{row.code}</td>
                  <td>
                    <div className="status-name">
                      <span>{label !== row.code ? label : '—'}</span>
                      <span className={`tag ${row.writable ? 'tag-rw' : ''}`}>
                        {row.writable ? '可下发' : '只读'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <code className="mono">{formatStatusValue(row.value, parsed)}</code>
                  </td>
                  <td>
                    {row.writable ? (
                      <div className="command-controls">
                        {(type === 'boolean' || type === 'bool') && (
                          <select
                            disabled={panelDisabled}
                            value={String(Boolean(drafts[row.code]))}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.code]: e.target.value === 'true',
                              }))
                            }
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        )}
                        {type === 'enum' && options.length > 0 && (
                          <select
                            disabled={panelDisabled}
                            value={String(drafts[row.code] ?? '')}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [row.code]: e.target.value }))
                            }
                          >
                            {options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}
                        {(type === 'integer' || type === 'value') && (
                          <input
                            type="number"
                            disabled={panelDisabled}
                            value={Number(drafts[row.code] ?? 0)}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.code]: Number(e.target.value),
                              }))
                            }
                          />
                        )}
                        {!(
                          type === 'boolean' ||
                          type === 'bool' ||
                          type === 'integer' ||
                          type === 'value' ||
                          (type === 'enum' && options.length > 0)
                        ) && (
                          <input
                            disabled={panelDisabled}
                            value={String(drafts[row.code] ?? '')}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [row.code]: e.target.value }))
                            }
                          />
                        )}
                        <RoleGate allow={['operator', 'admin']}>
                          <button
                            className="btn primary"
                            type="button"
                            disabled={panelDisabled || busyCode === row.code}
                            onClick={() => void send(row.code)}
                          >
                            下发
                          </button>
                        </RoleGate>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <button type="button" className="btn status-more" onClick={() => setShowAll(true)}>
          展开更多（{hiddenCount}）
        </button>
      )}
      {showAll && rows.length > STATUS_PREVIEW_ROWS && (
        <button type="button" className="btn status-more" onClick={() => setShowAll(false)}>
          收起
        </button>
      )}
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
