import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/client';

type CommandItem = {
  id: string;
  code: string;
  value: unknown;
  success: boolean;
  createdAt: string;
  productId: string;
  device?: { deviceId: string; name?: string | null };
  adminUser?: { username: string };
};

type ListResponse = {
  items: CommandItem[];
  total: number;
};

export function CommandHistoryPage() {
  const [deviceId, setDeviceId] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(filterDeviceId = deviceId) {
    setError(null);
    try {
      const res = await api<ListResponse>(
        `/api/commands${qs({
          deviceId: filterDeviceId || undefined,
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
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>指令历史</h1>
      </div>
      <div className="card">
        <form className="filters" onSubmit={onFilter}>
          <input
            placeholder="按 deviceId 筛选"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          />
          <button className="btn primary" type="submit">
            筛选
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>设备</th>
                  <th>code</th>
                  <th>value</th>
                  <th>操作者</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr className="no-click" key={c.id}>
                    <td>{new Date(c.createdAt).toLocaleString()}</td>
                    <td>
                      {c.device ? (
                        <Link to={`/devices/${encodeURIComponent(c.device.deviceId)}`}>
                          {c.device.name || c.device.deviceId}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{c.code}</td>
                    <td>
                      <code>{JSON.stringify(c.value)}</code>
                    </td>
                    <td>{c.adminUser?.username ?? '—'}</td>
                    <td>{c.success ? '成功' : '失败'}</td>
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
