import { FormEvent, useEffect, useState } from 'react';
import { api, qs } from '../api/client';

type DpAlias = {
  id: string;
  productId: string;
  code: string;
  alias: string;
  groupName?: string | null;
  sortOrder: number;
};

const PRODUCT_IDS = [
  'uhmj5b0ba31zpme6',
  'qxjzruuqz40bty7e',
  'nohrp3vbmef7vxvx',
];

export function SettingsAliasesPage() {
  const [productId, setProductId] = useState('');
  const [items, setItems] = useState<DpAlias[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: PRODUCT_IDS[0],
    code: '',
    alias: '',
    groupName: '',
    sortOrder: 0,
  });

  async function load(filterProductId = productId) {
    setError(null);
    try {
      const res = await api<DpAlias[]>(
        `/api/dp-aliases${qs({ productId: filterProductId || undefined })}`,
      );
      setItems(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await api('/api/dp-aliases', {
        method: 'PUT',
        body: JSON.stringify({
          productId: form.productId,
          code: form.code,
          alias: form.alias,
          groupName: form.groupName || undefined,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });
      setMessage('已保存别名');
      setForm((prev) => ({ ...prev, code: '', alias: '', groupName: '' }));
      await load(productId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>DP 别名设置</h1>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>新增 / 更新</h2>
        <form onSubmit={onSubmit}>
          <div className="filters">
            <select
              value={form.productId}
              onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))}
              required
            >
              {PRODUCT_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <input
              placeholder="code"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
            <input
              placeholder="alias"
              value={form.alias}
              onChange={(e) => setForm((p) => ({ ...p, alias: e.target.value }))}
              required
            />
            <input
              placeholder="groupName"
              value={form.groupName}
              onChange={(e) => setForm((p) => ({ ...p, groupName: e.target.value }))}
            />
            <input
              type="number"
              placeholder="sortOrder"
              value={form.sortOrder}
              onChange={(e) =>
                setForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))
              }
              min={0}
            />
            <button className="btn primary" type="submit">
              保存
            </button>
          </div>
        </form>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <div className="filters">
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              void load(e.target.value);
            }}
          >
            <option value="">全部产品</option>
            {PRODUCT_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => void load()}>
            刷新
          </button>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>productId</th>
                <th>code</th>
                <th>alias</th>
                <th>group</th>
                <th>sort</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr className="no-click" key={a.id}>
                  <td>{a.productId}</td>
                  <td>{a.code}</td>
                  <td>{a.alias}</td>
                  <td>{a.groupName ?? '—'}</td>
                  <td>{a.sortOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Demo 不提供删除入口；如需覆盖请用同 productId + code 再次保存。
        </p>
      </div>
    </div>
  );
}
