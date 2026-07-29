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
  const range = values.range ?? values.list;
  if (Array.isArray(range)) return range.map(String);
  return [];
}

function isWritable(fn: DeviceFunction): boolean {
  const mode = (fn.mode ?? 'rw').toLowerCase();
  return mode.includes('w') || mode === 'rw' || mode === 'wr';
}

export function StatusPanel({ deviceId, functions, statusJson, disabled, onSent }: Props) {
  const rows = useMemo(() => {
    const byCode = new Map<string, DeviceFunction>();
    for (const fn of functions) byCode.set(fn.code, fn);
    const codes = new Set<string>([
      ...functions.map((f) => f.code),
      ...Object.keys(statusJson ?? {}),
    ]);
    return [...codes]
      .sort()
      .map((code) => {
        const fn = byCode.get(code);
        return {
          code,
          fn,
          writable: fn ? isWritable(fn) : false,
          value: statusJson?.[code],
        };
      });
  }, [functions, statusJson]);

  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const res = await api<{ success: boolean }>(
        `/api/devices/${encodeURIComponent(deviceId)}/commands`,
        {
          method: 'POST',
          body: JSON.stringify({ code, value: drafts[code] }),
        },
      );
      setMessage(res.success ? `已下发 ${code}` : `下发失败 ${code}`);
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

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>code</th>
              <th>名称</th>
              <th>当前值</th>
              <th>编辑 / 下发</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const fn = row.fn;
              const type = (fn?.type ?? 'string').toLowerCase();
              const parsed = parseValues(fn?.values);
              const options = enumOptions(parsed);
              const label = fn?.alias ?? fn?.name ?? row.code;
              const panelDisabled = Boolean(disabled) || !row.writable;

              return (
                <tr key={row.code} className="no-click">
                  <td className="mono">{row.code}</td>
                  <td>
                    {label}
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {row.writable ? '可下发' : '只读'}
                      {fn?.type ? ` · ${fn.type}` : ''}
                    </div>
                  </td>
                  <td>
                    <code className="mono">{row.value === undefined ? '—' : JSON.stringify(row.value)}</code>
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
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
