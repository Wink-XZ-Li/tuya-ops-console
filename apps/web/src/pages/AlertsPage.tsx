import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/client';
import { RoleGate } from '../components/RoleGate';

type AlertItem = {
  id: string;
  title: string;
  source: string;
  status: string;
  openedAt: string;
  device?: { deviceId: string; name?: string | null; productId: string };
};

type ListResponse = {
  items: AlertItem[];
  total: number;
};

export function AlertsPage() {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(nextStatus = status) {
    setError(null);
    try {
      const res = await api<ListResponse>(
        `/api/alerts${qs({
          status: nextStatus || undefined,
          page: 1,
          pageSize: 50,
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

  async function ack(id: string) {
    setBusyId(id);
    try {
      await api(`/api/alerts/${encodeURIComponent(id)}/ack`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>告警</h1>
      </div>
      <div className="card">
        <div className="filters">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              void load(e.target.value);
            }}
          >
            <option value="">全部</option>
            <option value="open">open</option>
            <option value="acked">acked</option>
            <option value="closed">closed</option>
          </select>
          <button type="button" className="btn" onClick={() => void load()}>
            刷新
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>设备</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th>打开时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr className="no-click" key={a.id}>
                    <td>{a.title}</td>
                    <td>
                      {a.device ? (
                        <Link to={`/devices/${encodeURIComponent(a.device.deviceId)}`}>
                          {a.device.name || a.device.deviceId}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{a.source}</td>
                    <td>{a.status}</td>
                    <td>{new Date(a.openedAt).toLocaleString()}</td>
                    <td>
                      {a.status === 'open' ? (
                        <RoleGate allow={['operator', 'admin']}>
                          <button
                            type="button"
                            className="btn"
                            disabled={busyId === a.id}
                            onClick={() => void ack(a.id)}
                          >
                            确认
                          </button>
                        </RoleGate>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
