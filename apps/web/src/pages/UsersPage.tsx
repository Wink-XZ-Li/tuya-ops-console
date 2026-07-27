import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api/client';
import { DeviceRow, DeviceTable } from '../components/DeviceTable';

type EndUser = {
  id: string;
  tuyaUid: string;
  username?: string | null;
  mobile?: string | null;
  email?: string | null;
};

type ListResponse = {
  items: EndUser[];
  total: number;
};

export function UsersPage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(query = q) {
    setError(null);
    try {
      const res = await api<ListResponse>(
        `/api/end-users${qs({ q: query, page: 1, pageSize: 50 })}`,
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

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>终端用户</h1>
      </div>
      <div className="card">
        <form className="filters" onSubmit={onSearch}>
          <input
            placeholder="搜索 uid / 用户名 / 手机 / 邮箱"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn primary" type="submit">
            搜索
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>tuyaUid</th>
                  <th>用户名</th>
                  <th>手机</th>
                  <th>邮箱</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link to={`/users/${encodeURIComponent(u.tuyaUid)}`}>
                        {u.tuyaUid}
                      </Link>
                    </td>
                    <td>{u.username ?? '—'}</td>
                    <td>{u.mobile ?? '—'}</td>
                    <td>{u.email ?? '—'}</td>
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

export function UserDetailPage() {
  const { tuyaUid = '' } = useParams();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tuyaUid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<DeviceRow[]>(
          `/api/end-users/${encodeURIComponent(tuyaUid)}/devices`,
        );
        if (!cancelled) setDevices(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tuyaUid]);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>用户设备 · {tuyaUid}</h1>
        <Link to="/users">← 返回用户</Link>
      </div>
      <div className="card">
        {error && <p className="error">{error}</p>}
        <DeviceTable items={devices} />
      </div>
    </div>
  );
}
