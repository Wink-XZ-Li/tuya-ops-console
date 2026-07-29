import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api/client';
import { DeviceRow, DeviceTable } from '../components/DeviceTable';
import { RoleGate } from '../components/RoleGate';
import { formatProductLabel } from '../constants/product-names';
import { getRole } from '../auth/storage';

type EndUser = {
  id: string;
  tuyaUid: string;
  username?: string | null;
  nickName?: string | null;
  mobile?: string | null;
  email?: string | null;
  countryCode?: string | null;
  timeZoneId?: string | null;
  tempUnit?: number | null;
  avatar?: string | null;
  cloudCreatedAt?: string | null;
  cloudUpdatedAt?: string | null;
  remark?: string | null;
  raw?: Record<string, unknown> | null;
  syncedAt?: string | null;
};

type UserHome = {
  homeId: string;
  name: string;
  role?: string;
  lon?: number;
  lat?: number;
  geoName?: string;
};

type CloudDevice = {
  deviceId: string;
  name?: string;
  productId?: string;
  productName?: string;
  online?: boolean;
  from: 'home' | 'sharing' | 'unknown';
  inConsole: boolean;
  allowedProduct: boolean;
  status?: Array<{ code: string; value: unknown }>;
};

type CloudSnapshot = {
  user: EndUser;
  homes: UserHome[];
  cloudDevices: CloudDevice[];
  warnings: string[];
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
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
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

  async function reconcileUsers() {
    setSyncMsg(null);
    setError(null);
    try {
      const res = await api<{ usersSynced: number; pages: number; total?: number }>(
        '/api/sync/reconcile-users',
        { method: 'POST' },
      );
      setSyncMsg(
        `用户同步完成：写入/更新 ${res.usersSynced}` +
          (res.total != null ? `（云端合计 ${res.total}）` : '') +
          `，${res.pages} 页`,
      );
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
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
        <RoleGate allow={['admin']}>
          <button type="button" className="btn" onClick={() => void reconcileUsers()}>
            同步用户
          </button>
        </RoleGate>
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
        {syncMsg && <p className="muted">{syncMsg}</p>}
        <p className="hint" style={{ margin: '0 0 0.5rem' }}>
          「同步用户」按 App schema 全量拉取云端账号；用户名/手机依赖云端权限，空可用备注补充
        </p>
        {data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>tuyaUid</th>
                  <th>用户名</th>
                  <th>昵称</th>
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
                    <td title={cloudHint(u.nickName)}>{cloudOrDash(u.nickName)}</td>
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
  const [homes, setHomes] = useState<UserHome[]>([]);
  const [cloudDevices, setCloudDevices] = useState<CloudDevice[]>([]);
  const [localDevices, setLocalDevices] = useState<DeviceRow[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [fromFilter, setFromFilter] = useState<'all' | 'home' | 'sharing'>('all');
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draftRemark, setDraftRemark] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const role = getRole();
  const canEdit = role === 'operator' || role === 'admin';

  async function loadLocal() {
    if (!tuyaUid) return;
    setError(null);
    try {
      const [profile, deviceList] = await Promise.all([
        api<EndUser>(`/api/end-users/${encodeURIComponent(tuyaUid)}`),
        api<DeviceRow[]>(`/api/end-users/${encodeURIComponent(tuyaUid)}/devices`),
      ]);
      setUser(profile);
      setDraftRemark(profile.remark ?? '');
      setLocalDevices(deviceList);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadCloud() {
    if (!tuyaUid) return;
    setCloudLoading(true);
    try {
      const snap = await api<CloudSnapshot>(
        `/api/end-users/${encodeURIComponent(tuyaUid)}/cloud-snapshot`,
      );
      setUser(snap.user);
      setDraftRemark(snap.user.remark ?? '');
      setHomes(snap.homes);
      setCloudDevices(snap.cloudDevices);
      if (snap.warnings?.length) {
        setMsg(snap.warnings.join('；'));
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCloudLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await loadLocal();
      await loadCloud();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuyaUid]);

  async function refreshAll() {
    setMsg(null);
    setError(null);
    await loadCloud();
    await loadLocal();
    setMsg((m) => m ?? '已刷新云端快照');
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

  async function syncDeviceIntoConsole(deviceId: string) {
    setSyncingId(deviceId);
    setError(null);
    try {
      await api('/api/sync/reconcile-device', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
      setMsg(`已同步入库 ${deviceId}`);
      await loadCloud();
      await loadLocal();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncingId(null);
    }
  }

  const userProperties = Array.isArray(user?.raw?.user_properties)
    ? (user!.raw!.user_properties as Array<{ code?: string; value?: string }>)
    : [];

  const filteredDevices = cloudDevices.filter((d) => {
    if (!showAllProducts && !d.allowedProduct) return false;
    if (fromFilter !== 'all' && d.from !== fromFilter) return false;
    return true;
  });

  function tempUnitLabel(v?: number | null): string {
    if (v === 1) return '摄氏 (°C)';
    if (v === 2) return '华氏 (°F)';
    return cloudOrDash(v != null ? String(v) : null);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>用户详情</h1>
        <div className="row gap">
          <button
            type="button"
            className="btn secondary"
            disabled={cloudLoading}
            onClick={() => void refreshAll()}
          >
            {cloudLoading ? '刷新中…' : '刷新云端'}
          </button>
          <Link to="/users">← 返回用户</Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="muted">{msg}</p>}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>资料</h2>
        {user ? (
          <>
            <div className="row gap" style={{ alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  width={56}
                  height={56}
                  style={{ borderRadius: 8, objectFit: 'cover', background: '#eee' }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: '#e8e8e8',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#888',
                    fontSize: '0.75rem',
                  }}
                >
                  无头像
                </div>
              )}
              <dl className="kv" style={{ flex: 1, margin: 0 }}>
                <dt>tuyaUid</dt>
                <dd className="mono">{user.tuyaUid}</dd>
                <dt>用户名</dt>
                <dd title={cloudHint(user.username)}>{cloudOrDash(user.username)}</dd>
                <dt>昵称</dt>
                <dd title={cloudHint(user.nickName)}>{cloudOrDash(user.nickName)}</dd>
                <dt>手机</dt>
                <dd title={cloudHint(user.mobile)}>{cloudOrDash(user.mobile)}</dd>
                <dt>邮箱</dt>
                <dd title={cloudHint(user.email)}>{cloudOrDash(user.email)}</dd>
                <dt>国家码</dt>
                <dd>{cloudOrDash(user.countryCode)}</dd>
                <dt>时区</dt>
                <dd>{cloudOrDash(user.timeZoneId)}</dd>
                <dt>温度单位</dt>
                <dd>{tempUnitLabel(user.tempUnit)}</dd>
                <dt>云端创建</dt>
                <dd>
                  {user.cloudCreatedAt
                    ? new Date(user.cloudCreatedAt).toLocaleString()
                    : '—'}
                </dd>
                <dt>云端更新</dt>
                <dd>
                  {user.cloudUpdatedAt
                    ? new Date(user.cloudUpdatedAt).toLocaleString()
                    : '—'}
                </dd>
                <dt>本地同步</dt>
                <dd>{user.syncedAt ? new Date(user.syncedAt).toLocaleString() : '—'}</dd>
              </dl>
            </div>

            <details style={{ marginTop: '0.5rem' }}>
              <summary className="muted">扩展属性（user_properties）</summary>
              {userProperties.length === 0 ? (
                <p className="muted">无</p>
              ) : (
                <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>code</th>
                        <th>value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userProperties.map((p, i) => (
                        <tr key={`${p.code ?? 'p'}-${i}`}>
                          <td className="mono">{p.code ?? '—'}</td>
                          <td className="mono">{p.value ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>

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
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>家庭</h2>
        {homes.length === 0 ? (
          <p className="muted">{cloudLoading ? '加载中…' : '暂无家庭数据'}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>homeId</th>
                  <th>名称</th>
                  <th>角色</th>
                  <th>地址</th>
                  <th>坐标</th>
                </tr>
              </thead>
              <tbody>
                {homes.map((h) => (
                  <tr key={h.homeId}>
                    <td className="mono">{h.homeId}</td>
                    <td>{h.name}</td>
                    <td>{h.role ?? '—'}</td>
                    <td>{h.geoName ?? '—'}</td>
                    <td className="mono">
                      {h.lat != null && h.lon != null ? `${h.lat}, ${h.lon}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>云端设备</h2>
          <div className="row gap" style={{ alignItems: 'center' }}>
            <label className="muted" style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={showAllProducts}
                onChange={(e) => setShowAllProducts(e.target.checked)}
              />
              显示全部云端设备
            </label>
            <select
              value={fromFilter}
              onChange={(e) => setFromFilter(e.target.value as 'all' | 'home' | 'sharing')}
            >
              <option value="all">来源：全部</option>
              <option value="home">家庭</option>
              <option value="sharing">分享</option>
            </select>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          默认仅显示本台产品白名单内设备；「已入库」表示控制台 Device 表已有记录。不自动改绑定表。
        </p>
        {filteredDevices.length === 0 ? (
          <p className="muted">{cloudLoading ? '加载中…' : '暂无设备'}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>deviceId</th>
                  <th>名称</th>
                  <th>产品</th>
                  <th>在线</th>
                  <th>来源</th>
                  <th>入库</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((d) => (
                  <tr key={`${d.deviceId}-${d.from}`}>
                    <td className="mono">
                      {d.inConsole ? (
                        <Link to={`/devices/${encodeURIComponent(d.deviceId)}`}>{d.deviceId}</Link>
                      ) : (
                        d.deviceId
                      )}
                    </td>
                    <td>{d.name ?? '—'}</td>
                    <td title={d.productId}>
                      {d.productId ? formatProductLabel(d.productId) : d.productName ?? '—'}
                      {!d.allowedProduct && (
                        <span className="muted" style={{ marginLeft: 4 }}>
                          （非本台）
                        </span>
                      )}
                    </td>
                    <td>
                      {d.online === true ? (
                        <span className="status-online">online</span>
                      ) : d.online === false ? (
                        <span className="status-offline">offline</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{d.from}</td>
                    <td>{d.inConsole ? '是' : '否'}</td>
                    <td>
                      <div className="command-controls">
                        {d.status && d.status.length > 0 && (
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() =>
                              setExpandedStatus((id) => (id === d.deviceId ? null : d.deviceId))
                            }
                          >
                            {expandedStatus === d.deviceId ? '收起状态' : '状态'}
                          </button>
                        )}
                        {!d.inConsole && d.allowedProduct && canEdit && (
                          <button
                            type="button"
                            className="btn"
                            disabled={syncingId === d.deviceId}
                            onClick={() => void syncDeviceIntoConsole(d.deviceId)}
                          >
                            {syncingId === d.deviceId ? '同步中…' : '同步入库'}
                          </button>
                        )}
                      </div>
                      {expandedStatus === d.deviceId && d.status && (
                        <pre
                          className="mono"
                          style={{
                            marginTop: '0.35rem',
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-wrap',
                            maxWidth: '28rem',
                          }}
                        >
                          {JSON.stringify(d.status, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>本地绑定（参考）</h2>
        <p className="hint">来自设备同步写入的 DeviceBinding，非云端用户设备权威来源。</p>
        <DeviceTable items={localDevices} />
      </div>
    </div>
  );
}
