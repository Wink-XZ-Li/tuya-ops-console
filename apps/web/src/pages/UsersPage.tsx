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

function cloudOrDash(value?: string | null): string {
  return value?.trim() ? value : '—';
}

function cloudHint(value?: string | null): string | undefined {
  return value?.trim() ? undefined : '云端未返回';
}

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
            placeholder="搜索 uid / 用户名 / 手机 / 邮箱 / 备注"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn primary" type="submit">
            搜索
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="hint" style={{ margin: '0 0 0.5rem' }}>
          用户名/手机依赖云端权限；空表示云端未返回，可用备注人工补充
        </p>
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
                      <Link className="mono" to={`/users/${encodeURIComponent(u.tuyaUid)}`}>
                        {u.tuyaUid}
                      </Link>
                    </td>
                    <td title={cloudHint(u.username)}>{cloudOrDash(u.username)}</td>
                    <td title={cloudHint(u.mobile)}>{cloudOrDash(u.mobile)}</td>
                    <td title={cloudHint(u.email)}>{cloudOrDash(u.email)}</td>
                    <td>
                      {editingUid === u.tuyaUid ? (
                        <div className="command-controls">
                          <input
                            value={draftRemark}
                            onChange={(e) => setDraftRemark(e.target.value)}
                            maxLength={512}
                            placeholder="显示名 / 电话等"
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
  const [user, setUser] = useState<EndUser | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draftRemark, setDraftRemark] = useState('');
  const role = getRole();
  const canEdit = role === 'operator' || role === 'admin';

  async function load() {
    if (!tuyaUid) return;
    setError(null);
    try {
      const [profile, deviceList] = await Promise.all([
        api<EndUser>(`/api/end-users/${encodeURIComponent(tuyaUid)}`),
        api<DeviceRow[]>(`/api/end-users/${encodeURIComponent(tuyaUid)}/devices`),
      ]);
      setUser(profile);
      setDraftRemark(profile.remark ?? '');
      setDevices(deviceList);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuyaUid]);

  async function refreshProfile() {
    setMsg(null);
    setError(null);
    try {
      const res = await api<{ user: EndUser; message: string }>(
        `/api/end-users/${encodeURIComponent(tuyaUid)}/refresh-profile`,
        { method: 'POST' },
      );
      setUser(res.user);
      setMsg(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveRemark() {
    setError(null);
    try {
      const updated = await api<EndUser>(
        `/api/end-users/${encodeURIComponent(tuyaUid)}/remark`,
        {
          method: 'PATCH',
          body: JSON.stringify({ remark: draftRemark }),
        },
      );
      setUser(updated);
      setMsg('备注已保存');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>用户详情</h1>
        <Link to="/users">← 返回用户</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="muted">{msg}</p>}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>资料</h2>
        {user ? (
          <>
            <dl className="kv">
              <dt>tuyaUid</dt>
              <dd className="mono">{user.tuyaUid}</dd>
              <dt>用户名</dt>
              <dd title={cloudHint(user.username)}>{cloudOrDash(user.username)}</dd>
              <dt>手机</dt>
              <dd title={cloudHint(user.mobile)}>{cloudOrDash(user.mobile)}</dd>
              <dt>邮箱</dt>
              <dd title={cloudHint(user.email)}>{cloudOrDash(user.email)}</dd>
            </dl>
            <p className="muted" style={{ fontSize: '0.82rem' }}>
              空字段表示云端未返回隐私信息（与项目权限有关），可用备注补充显示名/电话。
            </p>
            <div className="row gap" style={{ marginTop: '0.5rem' }}>
              <RoleGate allow={['operator', 'admin']}>
                <button type="button" className="btn secondary" onClick={() => void refreshProfile()}>
                  刷新云端资料
                </button>
              </RoleGate>
            </div>
            {canEdit && (
              <div className="field" style={{ marginTop: '0.75rem' }}>
                <label className="field-label">备注（人工补充）</label>
                <div className="command-controls">
                  <input
                    value={draftRemark}
                    onChange={(e) => setDraftRemark(e.target.value)}
                    maxLength={512}
                    style={{ minWidth: '16rem' }}
                  />
                  <button type="button" className="btn primary" onClick={() => void saveRemark()}>
                    保存备注
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="muted">加载中…</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>绑定设备</h2>
        <DeviceTable items={devices} />
      </div>
    </div>
  );
}
