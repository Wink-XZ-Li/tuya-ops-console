import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { CommandPanel, DeviceFunction } from '../components/CommandPanel';
import { getRole } from '../auth/storage';

type DeviceDetail = {
  deviceId: string;
  productId: string;
  name?: string | null;
  onlineStatus: string;
  statusJson?: unknown;
  bindings: Array<{ tuyaUid: string; username?: string | null; mobile?: string | null }>;
  openAlertCount: number;
};

export function DeviceDetailPage() {
  const { deviceId = '' } = useParams();
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [functions, setFunctions] = useState<DeviceFunction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const role = getRole();
  const readonly = role === 'readonly';

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [d, fns] = await Promise.all([
          api<DeviceDetail>(`/api/devices/${encodeURIComponent(deviceId)}`),
          api<DeviceFunction[]>(
            `/api/devices/${encodeURIComponent(deviceId)}/functions`,
          ),
        ]);
        if (!cancelled) {
          setDevice(d);
          setFunctions(fns);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>设备详情</h1>
        <Link to="/devices">← 返回列表</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {device && (
        <div className="grid-2">
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>基本信息</h2>
            <dl className="kv">
              <dt>deviceId</dt>
              <dd>{device.deviceId}</dd>
              <dt>名称</dt>
              <dd>{device.name ?? '—'}</dd>
              <dt>productId</dt>
              <dd>{device.productId}</dd>
              <dt>在线</dt>
              <dd>{device.onlineStatus}</dd>
              <dt>未关闭告警</dt>
              <dd>{device.openAlertCount}</dd>
            </dl>
            <h3 style={{ fontSize: '0.95rem' }}>绑定用户</h3>
            {device.bindings.length === 0 ? (
              <p className="muted">无绑定</p>
            ) : (
              <ul>
                {device.bindings.map((b) => (
                  <li key={b.tuyaUid}>
                    <Link to={`/users/${encodeURIComponent(b.tuyaUid)}`}>
                      {b.username || b.tuyaUid}
                    </Link>
                    {b.mobile ? ` · ${b.mobile}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <h3 style={{ fontSize: '0.95rem' }}>status JSON</h3>
            <pre className="pre">{JSON.stringify(device.statusJson ?? null, null, 2)}</pre>
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>指令面板</h2>
            {readonly && (
              <p className="muted">只读角色不可下发指令</p>
            )}
            <CommandPanel
              deviceId={device.deviceId}
              functions={functions}
              disabled={readonly}
            />
          </div>
        </div>
      )}
    </div>
  );
}
