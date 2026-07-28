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
      const res = await api<{
        devicesSynced: number;
        bindingsSynced: number;
        purgedMock?: number;
      }>('/api/sync/reconcile', { method: 'POST' });
      setSyncMsg(
        `同步完成：设备 ${res.devicesSynced}，绑定 ${res.bindingsSynced}` +
          (res.purgedMock ? `，已清除 mock ${res.purgedMock}` : ''),
      );
      void load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function reconcileOne() {
    const deviceId = window.prompt('输入涂鸦 deviceId（例如测试设备）');
    if (!deviceId?.trim()) return;
    setSyncMsg(null);
    try {
      const res = await api<{ device: { deviceId: string; productId: string; name: string | null } }>(
        '/api/sync/reconcile-device',
        { method: 'POST', body: JSON.stringify({ deviceId: deviceId.trim() }) },
      );
      setSyncMsg(
        `已同步单设备 ${res.device.deviceId}（${res.device.name ?? ''} / ${res.device.productId}）`,
      );
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
          <span className="hint">设备上限 50</span>
        </h1>
        <RoleGate allow={['admin']}>
          <div className="row gap">
            <button type="button" className="btn" onClick={() => void reconcile()}>
              触发同步
            </button>
            <button type="button" className="btn secondary" onClick={() => void reconcileOne()}>
              同步指定设备
            </button>
          </div>
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
