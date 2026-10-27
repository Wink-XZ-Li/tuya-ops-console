import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { RoleGate } from './RoleGate';

export type DeviceFunction = {
  code: string;
  name?: string;
  type?: string;
  values?: unknown;
  alias?: string;
  groupName?: string;
  sortOrder?: number;
};

type Props = {
  deviceId: string;
  functions: DeviceFunction[];
  disabled?: boolean;
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

function formatIssueError(code: string, tuyaResponse: unknown): string {
  if (tuyaResponse && typeof tuyaResponse === 'object' && 'error' in tuyaResponse) {
    const error = (tuyaResponse as { error?: unknown }).error;
    if (error != null && String(error).length > 0) return `下发失败 ${code}：${error}`;
  }
  return `下发失败 ${code}`;
}

function defaultValue(fn: DeviceFunction): unknown {
  const t = (fn.type ?? '').toLowerCase();
  if (t === 'boolean' || t === 'bool') return false;
  if (t === 'integer' || t === 'value') return 0;
  return '';
}

export function CommandPanel({ deviceId, functions, disabled }: Props) {
  const sorted = useMemo(
    () =>
      [...functions].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code),
      ),
    [functions],
  );

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const fn of functions) init[fn.code] = defaultValue(fn);
    return init;
  });
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(code: string) {
    setBusyCode(code);
    setMessage(null);
    setError(null);
    try {
      const res = await api<{ success: boolean; tuyaResponse?: unknown }>(
        `/api/devices/${encodeURIComponent(deviceId)}/commands`,
        {
          method: 'POST',
          body: JSON.stringify({ code, value: values[code] }),
        },
      );
      if (res.success) {
        setMessage(`已下发 ${code}`);
      } else {
        setError(formatIssueError(code, res.tuyaResponse));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyCode(null);
    }
  }

  if (sorted.length === 0) {
    return <p className="muted">无可下发功能</p>;
  }

  return (
    <div>
      <div className="command-list">
        {sorted.map((fn) => {
          const label = fn.alias ?? fn.code;
          const type = (fn.type ?? 'string').toLowerCase();
          const parsed = parseValues(fn.values);
          const options = enumOptions(parsed);
          const panelDisabled = Boolean(disabled);

          return (
            <div className="command-item" key={fn.code}>
              <div>
                <strong>{label}</strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {fn.code}
                  {fn.name ? ` · ${fn.name}` : ''}
                  {fn.groupName ? ` · ${fn.groupName}` : ''}
                  {` · ${fn.type ?? 'string'}`}
                </div>
              </div>
              <div className="command-controls">
                {(type === 'boolean' || type === 'bool') && (
                  <select
                    disabled={panelDisabled}
                    value={String(Boolean(values[fn.code]))}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [fn.code]: e.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                )}
                {(type === 'enum') && options.length > 0 && (
                  <select
                    disabled={panelDisabled}
                    value={String(values[fn.code] ?? '')}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [fn.code]: e.target.value }))
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
                    value={Number(values[fn.code] ?? 0)}
                    min={typeof parsed?.min === 'number' ? parsed.min : undefined}
                    max={typeof parsed?.max === 'number' ? parsed.max : undefined}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [fn.code]: Number(e.target.value),
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
                    value={String(values[fn.code] ?? '')}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [fn.code]: e.target.value }))
                    }
                  />
                )}
                <RoleGate allow={['operator', 'admin']}>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={panelDisabled || busyCode === fn.code}
                    onClick={() => void send(fn.code)}
                  >
                    下发
                  </button>
                </RoleGate>
              </div>
            </div>
          );
        })}
      </div>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Exported for tests — label prefers alias over code */
export function functionLabel(fn: Pick<DeviceFunction, 'alias' | 'code'>): string {
  return fn.alias ?? fn.code;
}
