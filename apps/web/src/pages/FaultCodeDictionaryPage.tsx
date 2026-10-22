import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { MultiSelect } from '../components/MultiSelect';
import { formatProductLabel, PRODUCT_IDS } from '../constants/product-names';

const WATER_HEATER_PRODUCT_ID = 'nohrp3vbmef7vxvx';

const PRODUCT_OPTIONS = (
  PRODUCT_IDS.includes(WATER_HEATER_PRODUCT_ID)
    ? PRODUCT_IDS
    : [WATER_HEATER_PRODUCT_ID, ...PRODUCT_IDS]
).map((id) => ({ value: id, label: formatProductLabel(id) }));

type GroupCode = {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  symptom: string | null;
  cause: string | null;
  suggestedAction: string | null;
  countInQualityRate: boolean;
  notifyAftersales: boolean;
};

type FaultCodeGroup = {
  id: string;
  name: string;
  productIds: string[];
  codes: GroupCode[];
};

type Draft = {
  sortOrder: number;
  symptom: string;
  cause: string;
  suggestedAction: string;
  countInQualityRate: boolean;
  notifyAftersales: boolean;
};

export function FaultCodeDictionaryPage() {
  const [groups, setGroups] = useState<FaultCodeGroup[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [productIds, setProductIds] = useState<string[]>([]);
  const [codes, setCodes] = useState<GroupCode[]>([]);
  const [editing, setEditing] = useState<GroupCode | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected = groups.find((group) => group.id === selectedId) ?? null;

  function showGroup(group: FaultCodeGroup) {
    setSelectedId(group.id);
    setName(group.name);
    setProductIds(group.productIds);
    setCodes(group.codes);
    setEditing(null);
    setDraft(null);
  }

  async function load(preferId?: string) {
    const rows = await api<FaultCodeGroup[]>('/api/fault-code-groups');
    setGroups(rows);
    const preferred =
      rows.find((group) => group.id === (preferId || selectedId)) ??
      rows.find((group) => group.productIds.includes(WATER_HEATER_PRODUCT_ID)) ??
      rows[0];
    if (preferred) showGroup(preferred);
    return rows;
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveGroup(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError(null);
    setMessage(null);
    try {
      const updated = await api<FaultCodeGroup>(`/api/fault-code-groups/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, productIds }),
      });
      setMessage(`已更新故障组，${updated.productIds.length} 个产品`);
      await load(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveCode(event: FormEvent) {
    event.preventDefault();
    if (!selected || !editing || !draft) return;
    setError(null);
    setMessage(null);
    const next = codes.map((code) =>
      code.id === editing.id
        ? {
            ...code,
            sortOrder: Number(draft.sortOrder),
            symptom: draft.symptom || null,
            cause: draft.cause || null,
            suggestedAction: draft.suggestedAction || null,
            countInQualityRate: draft.countInQualityRate,
            notifyAftersales: draft.notifyAftersales,
          }
        : code,
    );
    try {
      const updated = await api<FaultCodeGroup>(`/api/fault-code-groups/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          codes: next.map(({ id: _id, ...code }) => code),
        }),
      });
      setMessage(`已更新 ${editing.label}，并同步到本组 ${updated.productIds.length} 个产品`);
      await load(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const created = await api<FaultCodeGroup>('/api/fault-code-groups', {
        method: 'POST',
        body: JSON.stringify({ name: newName }),
      });
      setNewName('');
      setMessage(`已新增故障组 ${created.name}`);
      await load(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          故障字典
          <span className="hint">相同字典合成一组</span>
        </h1>
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          故障码内容相同的产品放在同一组里，改一处会写到组内每个 PID。保存产品列表时，位图顺序不一致的产品会被拒绝。
        </p>
        <form className="filters" onSubmit={createGroup}>
          <input
            aria-label="新故障组名称"
            placeholder="新故障组名称"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
          />
          <button className="btn" type="submit">
            新增组
          </button>
        </form>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <div className="filters">
          <select
            aria-label="故障组"
            value={selectedId}
            onChange={(event) => {
              const group = groups.find((item) => item.id === event.target.value);
              if (group) showGroup(group);
            }}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}（{group.productIds.length} 个产品）
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected && (
        <form className="card" onSubmit={saveGroup}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>故障组</h2>
          <div className="form-row field">
            <label htmlFor="group-name">名称</label>
            <input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <MultiSelect
            label="产品 PID"
            hint="一个产品只属于一个组"
            options={PRODUCT_OPTIONS}
            value={productIds}
            onChange={setProductIds}
            placeholder="选择产品"
          />
          {productIds.includes(WATER_HEATER_PRODUCT_ID) && (
            <p className="muted">本组含热水器，故障码顺序必须保持 E1 → E3 → E4 → E2。</p>
          )}
          <ul className="muted">
            {productIds.map((productId) => (
              <li key={productId}>{formatProductLabel(productId)}</li>
            ))}
          </ul>
          <button className="btn primary" type="submit">
            保存组和产品
          </button>
        </form>
      )}

      {selected && (
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>本组故障码</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>顺序</th>
                  <th>label</th>
                  <th>code</th>
                  <th>现象</th>
                  <th>建议动作</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr className="no-click" key={code.id}>
                    <td>{code.sortOrder}</td>
                    <td>{code.label}</td>
                    <td>{code.code}</td>
                    <td>{code.symptom ?? '—'}</td>
                    <td>{code.suggestedAction ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setEditing(code);
                          setDraft({
                            sortOrder: code.sortOrder,
                            symptom: code.symptom ?? '',
                            cause: code.cause ?? '',
                            suggestedAction: code.suggestedAction ?? '',
                            countInQualityRate: code.countInQualityRate,
                            notifyAftersales: code.notifyAftersales,
                          });
                          setError(null);
                        }}
                      >
                        编辑 {code.label}
                      </button>
                    </td>
                  </tr>
                ))}
                {codes.length === 0 && (
                  <tr className="no-click">
                    <td colSpan={6}>这个组还没有故障码。把已有字典的产品加进来后会带上它们的故障码。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && draft && (
        <form className="card" onSubmit={saveCode}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
            编辑 {editing.label}
          </h2>
          <div className="grid-2">
            <div className="form-row field">
              <label htmlFor="symptom">现象</label>
              <textarea
                id="symptom"
                rows={2}
                value={draft.symptom}
                onChange={(event) => setDraft({ ...draft, symptom: event.target.value })}
              />
            </div>
            <div className="form-row field">
              <label htmlFor="cause">原因</label>
              <textarea
                id="cause"
                rows={2}
                value={draft.cause}
                onChange={(event) => setDraft({ ...draft, cause: event.target.value })}
              />
            </div>
            <div className="form-row field">
              <label htmlFor="action">建议动作</label>
              <textarea
                id="action"
                rows={2}
                value={draft.suggestedAction}
                onChange={(event) => setDraft({ ...draft, suggestedAction: event.target.value })}
              />
            </div>
            <div className="form-row field">
              <label htmlFor="sort-order">sortOrder</label>
              <input
                id="sort-order"
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft({ ...draft, sortOrder: Number(event.target.value) })
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
                  setDraft({ ...draft, countInQualityRate: event.target.checked })
                }
              />
              计入质量故障率
            </label>
            <label className="row gap">
              <input
                type="checkbox"
                checked={draft.notifyAftersales}
                onChange={(event) =>
                  setDraft({ ...draft, notifyAftersales: event.target.checked })
                }
              />
              通知售后
            </label>
            <button className="btn primary" type="submit">
              保存故障码
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
