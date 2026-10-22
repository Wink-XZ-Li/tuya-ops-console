import { FormEvent, useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import { formatProductLabel, PRODUCT_IDS } from '../constants/product-names';

const WATER_HEATER_PRODUCT_ID = 'nohrp3vbmef7vxvx';

const PRODUCT_OPTIONS = PRODUCT_IDS.includes(WATER_HEATER_PRODUCT_ID)
  ? PRODUCT_IDS
  : [WATER_HEATER_PRODUCT_ID, ...PRODUCT_IDS];

type FaultCode = {
  id: string;
  productId: string;
  code: string;
  label: string;
  sortOrder: number;
  symptom: string | null;
  cause: string | null;
  suggestedAction: string | null;
  countInQualityRate: boolean;
  notifyAftersales: boolean;
};

type Draft = {
  code: string;
  label: string;
  sortOrder: number;
  symptom: string;
  cause: string;
  suggestedAction: string;
  countInQualityRate: boolean;
  notifyAftersales: boolean;
};

const emptyDraft = (): Draft => ({
  code: 'fault',
  label: '',
  sortOrder: 0,
  symptom: '',
  cause: '',
  suggestedAction: '',
  countInQualityRate: true,
  notifyAftersales: false,
});

function draftFrom(row: FaultCode): Draft {
  return {
    code: row.code,
    label: row.label,
    sortOrder: row.sortOrder,
    symptom: row.symptom ?? '',
    cause: row.cause ?? '',
    suggestedAction: row.suggestedAction ?? '',
    countInQualityRate: row.countInQualityRate,
    notifyAftersales: row.notifyAftersales,
  };
}

export function FaultCodeDictionaryPage() {
  const [productId, setProductId] = useState(WATER_HEATER_PRODUCT_ID);
  const [items, setItems] = useState<FaultCode[]>([]);
  const [editing, setEditing] = useState<FaultCode | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(nextProductId = productId) {
    setError(null);
    const rows = await api<FaultCode[]>(
      `/api/fault-codes${qs({ productId: nextProductId || undefined })}`,
    );
    setItems(rows);
    return rows;
  }

  useEffect(() => {
    void load(productId).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function openEditor(row: FaultCode) {
    setCreating(false);
    setMessage(null);
    setError(null);
    try {
      const detail = await api<FaultCode>(`/api/fault-codes/${row.id}`);
      setEditing(detail);
      setDraft(draftFrom(detail));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveEditor(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setMessage(null);
    setError(null);
    try {
      await api<FaultCode>(`/api/fault-codes/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          symptom: draft.symptom || null,
          cause: draft.cause || null,
          suggestedAction: draft.suggestedAction || null,
          countInQualityRate: draft.countInQualityRate,
          notifyAftersales: draft.notifyAftersales,
          sortOrder: Number(draft.sortOrder),
        }),
      });
      setMessage(`已更新 ${editing.label}`);
      const rows = await load();
      const fresh = rows.find((row) => row.id === editing.id) ?? null;
      setEditing(fresh);
      if (fresh) setDraft(draftFrom(fresh));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(row: FaultCode) {
    if (!window.confirm(`删除故障码 ${row.label}？位图已定义的 label 会被拒绝。`)) return;
    setMessage(null);
    setError(null);
    try {
      await api(`/api/fault-codes/${row.id}`, { method: 'DELETE' });
      if (editing?.id === row.id) setEditing(null);
      setMessage(`已删除 ${row.label}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createCode(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await api('/api/fault-codes', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          code: draft.code,
          label: draft.label,
          sortOrder: Number(draft.sortOrder),
          symptom: draft.symptom || null,
          cause: draft.cause || null,
          suggestedAction: draft.suggestedAction || null,
          countInQualityRate: draft.countInQualityRate,
          notifyAftersales: draft.notifyAftersales,
        }),
      });
      setMessage(`已创建 ${draft.label}`);
      setCreating(false);
      setDraft(emptyDraft());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          故障字典
          <span className="hint">现象 · 原因 · 建议动作</span>
        </h1>
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          已匹配产品的现象和建议动作来自面板收集的故障含义。重新执行 backfill
          会按含义回填这些文案，并保持位图顺序。计入质量故障率默认开，通知售后默认关。没有收集到含义的产品不写占位文案。
        </p>
        <div className="filters">
          <select
            aria-label="产品"
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setEditing(null);
              setCreating(false);
            }}
          >
            {PRODUCT_OPTIONS.map((id) => (
              <option key={id} value={id}>
                {formatProductLabel(id)}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => void load().catch((err) => setError(String(err)))}>
            刷新
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEditing(null);
              setCreating(true);
              setDraft(emptyDraft());
              setMessage(null);
              setError(null);
            }}
          >
            新增
          </button>
        </div>
        {productId === WATER_HEATER_PRODUCT_ID && (
          <p className="muted">
            热水器顺序必须保持 E1 → E3 → E4 → E2。提交其他 sortOrder，或删除这些 label，会返回 400。
          </p>
        )}
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>顺序</th>
                <th>label</th>
                <th>code</th>
                <th>现象</th>
                <th>建议动作</th>
                <th>质量率</th>
                <th>通知售后</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr className="no-click" key={row.id}>
                  <td>{row.sortOrder}</td>
                  <td>{row.label}</td>
                  <td>{row.code}</td>
                  <td>{row.symptom ?? '—'}</td>
                  <td>{row.suggestedAction ?? '—'}</td>
                  <td>{row.countInQualityRate ? '是' : '否'}</td>
                  <td>{row.notifyAftersales ? '是' : '否'}</td>
                  <td>
                    <div className="row gap">
                      <button type="button" className="btn" onClick={() => void openEditor(row)}>
                        编辑 {row.label}
                      </button>
                      <button type="button" className="btn" onClick={() => void remove(row)}>
                        删除 {row.label}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr className="no-click">
                  <td colSpan={8}>这个产品还没有故障码。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <form className="card" onSubmit={saveEditor}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
            详情 / 编辑 {editing.label}
          </h2>
          <div className="grid-2">
            <TextField label="现象" value={draft.symptom} onChange={(symptom) => setDraft((prev) => ({ ...prev, symptom }))} />
            <TextField label="原因" value={draft.cause} onChange={(cause) => setDraft((prev) => ({ ...prev, cause }))} />
            <TextField
              label="建议动作"
              value={draft.suggestedAction}
              onChange={(suggestedAction) => setDraft((prev) => ({ ...prev, suggestedAction }))}
            />
            <div className="form-row field">
              <label htmlFor="sort-order">sortOrder</label>
              <input
                id="sort-order"
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))
                }
              />
            </div>
          </div>
          <div className="filters">
            <label className="row gap">
              <input
                type="checkbox"
                checked={draft.countInQualityRate}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, countInQualityRate: event.target.checked }))
                }
              />
              计入质量故障率
            </label>
            <label className="row gap">
              <input
                type="checkbox"
                checked={draft.notifyAftersales}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, notifyAftersales: event.target.checked }))
                }
              />
              通知售后
            </label>
            <button className="btn primary" type="submit">
              保存
            </button>
          </div>
        </form>
      )}

      {creating && (
        <form className="card" onSubmit={createCode}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>新增故障码</h2>
          <p className="muted">
            已有位图的产品只能补回位图里的 label，序号必须与位图一致。
          </p>
          <div className="filters">
            <input
              aria-label="code"
              placeholder="code"
              value={draft.code}
              onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
              required
            />
            <input
              aria-label="label"
              placeholder="label"
              value={draft.label}
              onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
              required
            />
            <input
              aria-label="sortOrder"
              type="number"
              min={0}
              value={draft.sortOrder}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))
              }
            />
            <button className="btn primary" type="submit">
              创建
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `fault-${label}`;
  return (
    <div className="form-row field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={2} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
