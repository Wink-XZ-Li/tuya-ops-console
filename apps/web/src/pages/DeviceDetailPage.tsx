import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api/client';
import { DeviceFunction } from '../components/CommandPanel';
import { StatusPanel } from '../components/StatusPanel';
import { getRole } from '../auth/storage';
import {
  DEVICE_EVENT_BIZ_CODES,
  formatBizCodeLabel,
} from '../constants/device-event-biz-codes';
import {
  formatProductDpLabel,
  getProductDps,
} from '../constants/product-dp-schemas';

type DeviceDetail = {
  deviceId: string;
  productId: string;
  name?: string | null;
  onlineStatus: string;
  statusJson?: Record<string, unknown>;
  faultStatus?: string;
  faultInfo?: string | null;
  locationText?: string | null;
  signalStrength?: string | null;
  bindings: Array<{
    tuyaUid: string;
    username?: string | null;
    mobile?: string | null;
    remark?: string | null;
  }>;
  openAlertCount: number;
};

type EventRow = {
  id: string;
  bizCode: string;
  payload: unknown;
  eventTime: string;
};

export function DeviceDetailPage() {
  const { deviceId = '' } = useParams();
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [functions, setFunctions] = useState<DeviceFunction[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [bizCodes, setBizCodes] = useState<string[]>([]);
  const [dpIds, setDpIds] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastStatusAt, setLastStatusAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const role = getRole();
  const readonly = role === 'readonly';

  const showDpIdFilter = useMemo(
    () => bizCodes.includes('devicePropertyMessage'),
    [bizCodes],
  );

  const productDps = useMemo(
    () => (device?.productId ? getProductDps(device.productId) : []),
    [device?.productId],
  );

  const loadEvents = useCallback(
    async (
      id: string,
      filter?: { bizCodes?: string[]; dpIds?: string[]; from?: string; to?: string },
    ) => {
      const codes = filter?.bizCodes ?? [];
      const selectedDpIds = filter?.dpIds ?? [];
      const res = await api<{ items: EventRow[]; total: number }>(
        `/api/devices/${encodeURIComponent(id)}/events${qs({
          bizCodes: codes.length ? codes.join(',') : undefined,
          dpId:
            codes.includes('devicePropertyMessage') && selectedDpIds.length
              ? selectedDpIds.join(',')
              : undefined,
          from: filter?.from || undefined,
          to: filter?.to || undefined,
          page: 1,
          pageSize: 50,
        })}`,
      );
      setEvents(res.items);
      setEventsTotal(res.total);
    },
    [],
  );

  const refreshStatus = useCallback(async (id: string) => {
    try {
      const d = await api<DeviceDetail>(
        `/api/devices/${encodeURIComponent(id)}/refresh-status`,
        { method: 'POST' },
      );
      setDevice(d);
      setLastStatusAt(new Date());
      setError(null);
    } catch (e) {
      // Fall back to DB snapshot if OpenAPI refresh fails
      try {
        const d = await api<DeviceDetail>(`/api/devices/${encodeURIComponent(id)}`);
        setDevice(d);
        setLastStatusAt(new Date());
      } catch {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  const load = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await refreshStatus(id);
        const fns = await api<DeviceFunction[]>(
          `/api/devices/${encodeURIComponent(id)}/functions`,
        );
        setFunctions(fns);
        await loadEvents(id, { bizCodes, dpIds, from, to });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bizCodes, dpIds, from, loadEvents, refreshStatus, to],
  );

  useEffect(() => {
    if (!deviceId) return;
    void load(deviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId || !autoRefresh) return;

    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshStatus(deviceId);
    };

    const timer = window.setInterval(tick, 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, deviceId, refreshStatus]);

  useEffect(() => {
    if (!showDpIdFilter) setDpIds([]);
  }, [showDpIdFilter]);

  useEffect(() => {
    setDpIds([]);
  }, [device?.productId]);

  function onFilterEvents(e: FormEvent) {
    e.preventDefault();
    if (!deviceId) return;
    void loadEvents(deviceId, { bizCodes, dpIds, from, to });
  }

  function toggleBizCode(code: string) {
    setBizCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>设备详情</h1>
        <Link to="/devices">← 返回列表</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {device && (
        <>
          <div className="device-detail-top">
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>基本信息</h2>
              <dl className="kv">
                <dt>deviceId</dt>
                <dd>{device.deviceId}</dd>
                <dt>名称</dt>
                <dd>{device.name ?? '—'}</dd>
                <dt>productId</dt>
                <dd>{device.productId}</dd>
                <dt>网络状态</dt>
                <dd>{device.onlineStatus}</dd>
                <dt>信号强度</dt>
                <dd>{device.signalStrength ?? '—'}</dd>
                <dt>故障情况</dt>
                <dd>
                  {device.faultStatus === 'fault'
                    ? '故障'
                    : device.faultStatus === 'normal'
                      ? '正常'
                      : '未知'}
                </dd>
                <dt>故障信息</dt>
                <dd>{device.faultInfo ?? '—'}</dd>
                <dt>所在城市</dt>
                <dd>{device.locationText ?? '—'}</dd>
                <dt>未关闭告警</dt>
                <dd>{device.openAlertCount}</dd>
              </dl>
              <h3 style={{ fontSize: '0.95rem' }}>绑定用户</h3>
              {device.bindings.length === 0 ? (
                <p className="muted">无绑定（可点设备页「触发同步」补齐）</p>
              ) : (
                <ul>
                  {device.bindings.map((b) => (
                    <li key={b.tuyaUid}>
                      <Link to={`/users/${encodeURIComponent(b.tuyaUid)}`}>
                        {b.username || b.tuyaUid}
                      </Link>
                      {b.mobile ? ` · ${b.mobile}` : ''}
                      {b.remark ? ` · 备注: ${b.remark}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
                状态集{' '}
                <span className="hint">
                  {autoRefresh ? '每 5 秒自动刷新' : '已暂停自动刷新'}
                  {lastStatusAt ? ` · ${lastStatusAt.toLocaleTimeString()}` : ''}
                </span>
              </h2>
              <div className="row gap" style={{ marginBottom: '0.75rem' }}>
                <label className="muted" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                  自动刷新属性
                </label>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => deviceId && void refreshStatus(deviceId)}
                >
                  立即刷新
                </button>
              </div>
              {readonly && <p className="muted">只读角色不可下发指令</p>}
              <StatusPanel
                key={device.deviceId}
                deviceId={device.deviceId}
                functions={functions}
                statusJson={(device.statusJson as Record<string, unknown>) ?? {}}
                disabled={readonly}
                onSent={() => void refreshStatus(device.deviceId)}
              />
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
              设备日志 <span className="hint">共 {eventsTotal} 条 · 保留 7 天</span>
            </h2>
            <form className="filters" onSubmit={onFilterEvents}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 280 }}>
                <label className="muted" style={{ fontSize: '0.85rem' }}>
                  BizCode（消息类型）· 可多选
                </label>
                <select
                  multiple
                  size={8}
                  value={bizCodes}
                  onChange={(e) =>
                    setBizCodes(Array.from(e.target.selectedOptions, (o) => o.value))
                  }
                  style={{ minHeight: 140 }}
                >
                  {DEVICE_EVENT_BIZ_CODES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code}（{item.label}）
                    </option>
                  ))}
                </select>
                <div className="row gap">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setBizCodes([])}
                  >
                    清空类型
                  </button>
                  {bizCodes.includes('devicePropertyMessage') ? null : (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => toggleBizCode('devicePropertyMessage')}
                    >
                      快捷：设备上报属性
                    </button>
                  )}
                </div>
              </div>
              {showDpIdFilter && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 260 }}>
                  <label className="muted" style={{ fontSize: '0.85rem' }}>
                    dpId <span className="hint">id / code · 可多选</span>
                  </label>
                  <select
                    multiple
                    size={Math.min(8, Math.max(4, productDps.length || 4))}
                    value={dpIds}
                    onChange={(e) =>
                      setDpIds(Array.from(e.target.selectedOptions, (o) => o.value))
                    }
                    style={{ minHeight: 120 }}
                  >
                    {productDps.map((dp) => (
                      <option key={dp.code} value={dp.code}>
                        {formatProductDpLabel(dp)}
                      </option>
                    ))}
                  </select>
                  <div className="row gap">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setDpIds([])}
                    >
                      清空 DP
                    </button>
                  </div>
                  {productDps.length === 0 && (
                    <span className="hint">当前 productId 暂无本地 schema</span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label className="muted" style={{ fontSize: '0.85rem' }}>
                  开始时间
                </label>
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label className="muted" style={{ fontSize: '0.85rem' }}>
                  结束时间
                </label>
                <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <button className="btn primary" type="submit" style={{ alignSelf: 'end' }}>
                筛选
              </button>
            </form>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>bizCode</th>
                    <th>payload</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        暂无日志
                      </td>
                    </tr>
                  ) : (
                    events.map((ev) => (
                      <tr key={ev.id}>
                        <td>{new Date(ev.eventTime).toLocaleString()}</td>
                        <td>{formatBizCodeLabel(ev.bizCode)}</td>
                        <td>
                          <code style={{ fontSize: '0.75rem' }}>
                            {JSON.stringify(ev.payload).slice(0, 180)}
                            {JSON.stringify(ev.payload).length > 180 ? '…' : ''}
                          </code>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
