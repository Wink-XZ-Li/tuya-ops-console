import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api/client';
import { DeviceRow, DeviceTable } from '../components/DeviceTable';
import { RoleGate } from '../components/RoleGate';
import { getRole } from '../auth/storage';

type EndUser = {
  id: string;
  tuyaUid: string;
  username?: string | null;
  mobile?: string | null;
  email?: string | null;
  remark?: string | null;
};

type ListResponse = {
  items: EndUser[];
  total: number;
};

export function UsersPage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draftRemark, setDraftRemark] = useState('');
  const role = getRole();
  const canEdit = role === 'operator' || role === 'admin';

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

  async function saveRemark(tuyaUid: string) {
    setError(null);
    try {
      await api(`/api/end-users/${encodeURIComponent(tuyaUid)}/remark`, {
        method: 'PATCH',
        body: JSON.stringify({ remark: draftRemark }),
      });
      setEditingUid(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
                  <th>备注</th>
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
                    <td>
                      {editingUid === u.tuyaUid ? (
                        <div className="command-controls">
                          <input
                            value={draftRemark}
                            onChange={(e) => setDraftRemark(e.target.value)}
                            maxLength={512}
                          />
                          <RoleGate allow={['operator', 'admin']}>
                            <button
                              type="button"
                              className="btn primary"
                              onClick={() => void saveRemark(u.tuyaUid)}
                            >
                              保存
                            </button>
                          </RoleGate>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => setEditingUid(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="command-controls">
                          <span>{u.remark ?? '—'}</span>
                          {canEdit && (
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => {
                                setEditingUid(u.tuyaUid);
                                setDraftRemark(u.remark ?? '');
                              }}
                            >
                              编辑
                            </button>
                          )}
                        </div>
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
