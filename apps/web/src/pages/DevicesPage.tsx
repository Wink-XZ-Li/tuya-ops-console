import { FormEvent, useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import { DeviceTable, DeviceRow } from '../components/DeviceTable';
import { RoleGate } from '../components/RoleGate';

type ListResponse = {
  items: DeviceRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PRODUCT_IDS = [
  '',
  'uhmj5b0ba31zpme6',
  'qxjzruuqz40bty7e',
  'nohrp3vbmef7vxvx',
];

export function DevicesPage() {
  const [q, setQ] = useState('');
  const [productId, setProductId] = useState('');
  const [onlineStatus, setOnlineStatus] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function load(next?: { q?: string; productId?: string; onlineStatus?: string }) {
    setError(null);
    try {
      const res = await api<ListResponse>(
        `/api/devices${qs({
          q: next?.q ?? q,
          productId: next?.productId ?? productId,
          onlineStatus: next?.onlineStatus ?? onlineStatus,
          page: 1,
          pageSize: 20,
        })}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  async function reconcile() {
    setSyncMsg(null);
    try {
      await api('/api/sync/reconcile', { method: 'POST' });
      setSyncMsg('同步已触发');
      void load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          设备
          <span className="hint">Demo · 设备 &lt; 10</span>
        </h1>
        <RoleGate allow={['admin']}>
          <button type="button" className="btn" onClick={() => void reconcile()}>
            触发同步
          </button>
        </RoleGate>
      </div>

      <div className="card">
        <form className="filters" onSubmit={onFilter}>
          <input
            placeholder="搜索 deviceId / 名称"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">全部产品</option>
            {PRODUCT_IDS.filter(Boolean).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <select value={onlineStatus} onChange={(e) => setOnlineStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="online">online</option>
            <option value="offline">offline</option>
            <option value="unknown">unknown</option>
          </select>
          <button className="btn primary" type="submit">
            筛选
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {syncMsg && <p className="muted">{syncMsg}</p>}
        {data && (
          <>
            <p className="muted">共 {data.total} 台</p>
            <DeviceTable items={data.items} />
          </>
        )}
      </div>
    </div>
  );
}
