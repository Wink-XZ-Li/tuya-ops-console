import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api/client';
import { DeviceFunction } from '../components/CommandPanel';
import { DpTrendPanel } from '../components/DpTrendPanel';
import { FaultHistoryPanel } from '../components/FaultHistoryPanel';
import { MultiSelect } from '../components/MultiSelect';
import { StatusPanel } from '../components/StatusPanel';
import { ConnectivityPanel } from '../components/ConnectivityPanel';
import { UsagePanel } from '../components/UsagePanel';
import { getRole } from '../auth/storage';
import {
  DEVICE_EVENT_BIZ_CODES,
  formatBizCodeLabel,
} from '../constants/device-event-biz-codes';
import { getProductDps } from '../constants/product-dp-schemas';
import { formatFaultInfoDisplay } from '../constants/product-fault-schemas';
import { formatProductLabel } from '../constants/product-names';
import {
  eventPropertyLines,
  PropertyCatalogItem,
} from '../utils/format-event-properties';

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

type CloudLogRow = { code: string; value: unknown; eventTime: number };

type CloudLogPage = {
  list: CloudLogRow[];
  hasMore: boolean;
  lastRowKey?: string;
  startTime: number;
  endTime: number;
};

const EVENT_PAGE_SIZE = 50;
const CLOUD_HOURS = 168;
const CLOUD_PAGE_SIZE = 50;

export function DeviceDetailPage() {
  const { deviceId = '' } = useParams();
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [functions, setFunctions] = useState<DeviceFunction[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventPage, setEventPage] = useState(1);
  const [eventPageDraft, setEventPageDraft] = useState('1');
  const [eventsLimited, setEventsLimited] = useState(false);
  const [bizCodes, setBizCodes] = useState<string[]>([]);
  const [dpIds, setDpIds] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [prettyPayload, setPrettyPayload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastStatusAt, setLastStatusAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
  const [cloudLogs, setCloudLogs] = useState<CloudLogRow[]>([]);
  const [cloudHasMore, setCloudHasMore] = useState(false);
  const [cloudNextKey, setCloudNextKey] = useState<string | undefined>();
  const [cloudCursor, setCloudCursor] = useState<string | undefined>();
  const [cloudHistory, setCloudHistory] = useState<Array<string | undefined>>([]);
  const [cloudWindowEnd, setCloudWindowEnd] = useState<number | undefined>();
  const [cloudRange, setCloudRange] = useState<{ start: number; end: number } | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [firmware, setFirmware] = useState<
    Array<{
      type?: string;
      currentVersion?: string;
      version?: string;
      upgradeStatus?: number | string;
      desc?: string;
    }>
  >([]);
  const [enrichError, setEnrichError] = useState<string | null>(null);
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

  const propertyCatalog = useMemo(() => {
    const byCode = new Map<string, PropertyCatalogItem>();
    for (const dp of productDps) {
      byCode.set(dp.code, {
        code: dp.code,
        id: dp.id,
        name: dp.name,
        type: dp.type,
        values: dp.values,
      });
    }
    for (const fn of functions) {
      const existing = byCode.get(fn.code);
      const values =
        existing?.values ??
        (fn.values && typeof fn.values === 'object' && !Array.isArray(fn.values)
          ? (fn.values as Record<string, unknown>)
          : null);
      byCode.set(fn.code, {
        code: fn.code,
        id: existing?.id,
        name: existing?.name || fn.name,
        alias: fn.alias,
        type: existing?.type || fn.type,
        values,
      });
    }
    return [...byCode.values()];
  }, [functions, productDps]);

  const bizCodeOptions = useMemo(
    () =>
      DEVICE_EVENT_BIZ_CODES.map((item) => ({
        value: item.code,
        label: item.code,
        meta: item.label,
      })),
    [],
  );

  const dpOptions = useMemo(
    () =>
      productDps.map((dp) => ({
        value: dp.code,
        label: `${dp.id} · ${dp.code}`,
        meta: dp.name,
      })),
    [productDps],
  );

  const loadEvents = useCallback(
    async (
      id: string,
      filter?: { bizCodes?: string[]; dpIds?: string[]; from?: string; to?: string; page?: number },
    ) => {
      const codes = filter?.bizCodes ?? [];
      const selectedDpIds = filter?.dpIds ?? [];
      const page = filter?.page ?? 1;
      const res = await api<{ items: EventRow[]; total: number; limited?: boolean }>(
        `/api/devices/${encodeURIComponent(id)}/events${qs({
          bizCodes: codes.length ? codes.join(',') : undefined,
          dpId:
            codes.includes('devicePropertyMessage') && selectedDpIds.length
              ? selectedDpIds.join(',')
              : undefined,
          from: filter?.from || undefined,
          to: filter?.to || undefined,
          page,
          pageSize: EVENT_PAGE_SIZE,
        })}`,
      );
      setEvents(res.items);
      setEventsTotal(res.total);
      setEventPage(page);
      setEventsLimited(Boolean(res.limited));
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

  const loadCloudLogs = useCallback(async (id: string, opts?: { cursor?: string; end?: number }) => {
    setCloudLoading(true);
    try {
      const res = await api<CloudLogPage>(
        `/api/devices/${encodeURIComponent(id)}/cloud-logs${qs({
          hours: CLOUD_HOURS,
          size: CLOUD_PAGE_SIZE,
          lastRowKey: opts?.cursor,
          endTime: opts?.end,
        })}`,
      );
      setCloudLogs(res.list ?? []);
      setCloudHasMore(Boolean(res.hasMore && res.lastRowKey));
      setCloudNextKey(res.lastRowKey);
      setCloudCursor(opts?.cursor);
      setCloudWindowEnd(opts?.end);
      setCloudRange({ start: res.startTime, end: res.endTime });
      setCloudError(null);
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : String(e));
    } finally {
      setCloudLoading(false);
    }
  }, []);

  const loadEnrichment = useCallback(async (id: string) => {
    try {
      const fw = await api<{
        upgrades: Array<{
          type?: string;
          currentVersion?: string;
          version?: string;
          upgradeStatus?: number | string;
          desc?: string;
        }>;
      }>(`/api/devices/${encodeURIComponent(id)}/firmware`);
      setFirmware(fw.upgrades ?? []);
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : String(e));
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
        setCloudHistory([]);
        await loadEvents(id, { bizCodes, dpIds, from, to, page: 1 });
        void loadCloudLogs(id);
        void loadEnrichment(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bizCodes, dpIds, from, loadCloudLogs, loadEnrichment, loadEvents, refreshStatus, to],
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

  useEffect(() => {
    setEventPageDraft(String(eventPage));
  }, [eventPage]);

  function onFilterEvents(e: FormEvent) {
    e.preventDefault();
    if (!deviceId) return;
    void loadEvents(deviceId, { bizCodes, dpIds, from, to, page: 1 });
  }

  function changeEventPage(page: number) {
    if (!deviceId) return;
    void loadEvents(deviceId, { bizCodes, dpIds, from, to, page });
  }

  function jumpEventPage() {
    const parsed = Number(eventPageDraft);
    if (!Number.isInteger(parsed)) {
      setEventPageDraft(String(eventPage));
      return;
    }
    const page = Math.min(eventPageCount, Math.max(1, parsed));
    setEventPageDraft(String(page));
    if (page !== eventPage) changeEventPage(page);
  }

  function goCloudNext() {
    if (!deviceId || !cloudHasMore || !cloudNextKey) return;
    setCloudHistory((history) => [...history, cloudCursor]);
    void loadCloudLogs(deviceId, { cursor: cloudNextKey, end: cloudWindowEnd });
  }

  function goCloudPrev() {
    if (!deviceId || cloudHistory.length === 0) return;
    const prev = cloudHistory[cloudHistory.length - 1];
    setCloudHistory((history) => history.slice(0, -1));
    void loadCloudLogs(deviceId, { cursor: prev, end: cloudWindowEnd });
  }

  function goCloudEarlier() {
    if (!deviceId) return;
    const end = cloudRange?.start ?? Date.now() - CLOUD_HOURS * 3600_000;
    setCloudHistory([]);
    void loadCloudLogs(deviceId, { end });
  }

  function goCloudLatest() {
    if (!deviceId) return;
    setCloudHistory([]);
    void loadCloudLogs(deviceId);
  }

  const eventPageCount = Math.max(1, Math.ceil(eventsTotal / EVENT_PAGE_SIZE));
  const cloudHint = cloudRange
    ? `${new Date(cloudRange.start).toLocaleString()} – ${new Date(cloudRange.end).toLocaleString()} · 本页 ${cloudLogs.length} 条`
    : '近 7 天 · 数据上报';

  const faultText =
    device?.faultStatus === 'fault' ? '故障' : device?.faultStatus === 'normal' ? '正常' : '未知';

  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}
      {device && (
        <>
          <header className="card device-head">
            <div>
              <p className="device-kicker">设备详情</p>
              <h1>{device.name || device.deviceId}</h1>
              <p className="device-product">{formatProductLabel(device.productId)}</p>
            </div>
            <div className="device-head-side">
              <span
                className={`pill ${device.onlineStatus === 'online' ? 'ok' : device.onlineStatus === 'offline' ? 'bad' : ''}`}
              >
                {device.onlineStatus}
              </span>
              <span className={`pill ${device.faultStatus === 'fault' ? 'bad' : device.faultStatus === 'normal' ? 'ok' : ''}`}>
                {faultText}
              </span>
              <span className={`pill ${device.openAlertCount > 0 ? 'warn' : ''}`}>
                告警 {device.openAlertCount}
              </span>
              <Link className="btn ghost" to="/devices">
                返回列表
              </Link>
            </div>
          </header>

          <section className="card device-facts">
            <div>
              <span className="fact-label">设备 ID</span>
              <span className="mono">{device.deviceId}</span>
            </div>
            <div>
              <span className="fact-label">信号强度</span>
              <span>{device.signalStrength ?? '—'}</span>
            </div>
            <div>
              <span className="fact-label">故障信息</span>
              <span className="mono">
                {device.faultInfo
                  ? formatFaultInfoDisplay(device.productId, device.faultInfo)
                  : '—'}
              </span>
            </div>
            <div>
              <span className="fact-label">绑定用户</span>
              {device.bindings.length === 0 ? (
                <span className="muted">无绑定</span>
              ) : (
                <span>
                  {device.bindings.map((b) => (
                    <span key={b.tuyaUid} className="binding-chip">
                      <Link to={`/users/${encodeURIComponent(b.tuyaUid)}`}>
                        {b.username || b.tuyaUid}
                      </Link>
                      {b.mobile ? ` · ${b.mobile}` : ''}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div className="fact-wide">
              <span className="fact-label">所在城市</span>
              <span>{device.locationText ?? '—'}</span>
            </div>
          </section>

          <section className="card" aria-label="状态集">
            <div className="section-bar">
              <h2>
                状态集
                <span className="hint">
                  {autoRefresh ? '每 5 秒自动刷新' : '已暂停自动刷新'}
                  {lastStatusAt ? ` · ${lastStatusAt.toLocaleTimeString()}` : ''}
                </span>
              </h2>
              <div className="row gap">
                {statusOpen && (
                  <>
                    <label className="muted check-label">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                      />
                      自动刷新
                    </label>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => deviceId && void refreshStatus(deviceId)}
                    >
                      立即刷新
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn"
                  aria-expanded={statusOpen}
                  onClick={() => setStatusOpen((open) => !open)}
                >
                  {statusOpen ? '收起状态集' : '展开状态集'}
                </button>
              </div>
            </div>
            {statusOpen && (
              <>
                {readonly && <p className="muted">只读角色不可下发指令</p>}
                <StatusPanel
                  key={device.deviceId}
                  deviceId={device.deviceId}
                  functions={functions}
                  statusJson={(device.statusJson as Record<string, unknown>) ?? {}}
                  disabled={readonly}
                  onSent={() => void refreshStatus(device.deviceId)}
                />
              </>
            )}
          </section>

          <FaultHistoryPanel deviceId={device.deviceId} />
          <DpTrendPanel deviceId={device.deviceId} productId={device.productId} />
          <UsagePanel deviceId={device.deviceId} productId={device.productId} />
          <ConnectivityPanel deviceId={device.deviceId} />

          <div className="device-split">
            <section className="card">
              <div className="section-bar">
                <h2>固件</h2>
                <button
                  type="button"
                  className="btn"
                  onClick={() => deviceId && void loadEnrichment(deviceId)}
                >
                  刷新
                </button>
              </div>
              {enrichError && <p className="warn">{enrichError}</p>}
              {firmware.length === 0 ? (
                <p className="hint">暂无固件信息</p>
              ) : (
                <ul className="fw-list">
                  {firmware.map((row, idx) => (
                    <li key={`${row.desc}-${row.currentVersion}-${idx}`}>
                      <span className="fw-desc">{row.desc ?? '模块'}</span>
                      <span className="mono fw-ver">{row.currentVersion ?? '—'}</span>
                      {row.version ? (
                        <span className="muted">目标 {row.version}</span>
                      ) : (
                        <span className="muted">无待升级版本</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <h2>
                云端上报日志
                <span className="hint">{cloudHint}</span>
              </h2>
              {cloudError && <p className="warn">{cloudError}</p>}
              {cloudLogs.length === 0 ? (
                <p className="hint">{cloudLoading ? '加载中' : '这个时间窗里没有上报'}</p>
              ) : (
                <div className="table-wrap device-log-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>DP</th>
                        <th>值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cloudLogs.map((row, idx) => (
                        <tr key={`${row.eventTime}-${row.code}-${idx}`} className="no-click">
                          <td className="mono nowrap">
                            {row.eventTime ? new Date(row.eventTime).toLocaleString() : '—'}
                          </td>
                          <td className="mono">{row.code}</td>
                          <td className="mono">{JSON.stringify(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="log-pager">
                <button
                  type="button"
                  className="btn"
                  disabled={cloudHistory.length === 0 || cloudLoading}
                  onClick={goCloudPrev}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!cloudHasMore || cloudLoading}
                  onClick={goCloudNext}
                >
                  下一页
                </button>
                <button type="button" className="btn" disabled={cloudLoading} onClick={goCloudEarlier}>
                  更早 7 天
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={cloudWindowEnd == null || cloudLoading}
                  onClick={goCloudLatest}
                >
                  回到最近
                </button>
              </div>
            </section>
          </div>

          <div className="card" id="device-logs">
            <h2>
              设备日志{' '}
              <span className="hint">
                共 {eventsTotal} 条 · 第 {eventPage}/{eventPageCount} 页 · 本地消息队列
                {eventsLimited ? ' · 功能点筛选只查最近 500 条' : ''}
              </span>
            </h2>
            <div className="row gap" style={{ marginBottom: '0.55rem' }}>
              <label className="muted" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={prettyPayload}
                  onChange={(e) => setPrettyPayload(e.target.checked)}
                />
                payload JSON 换行
              </label>
            </div>
            <form className="filters" onSubmit={onFilterEvents}>
              <MultiSelect
                label="BizCode"
                hint="消息类型"
                options={bizCodeOptions}
                value={bizCodes}
                onChange={setBizCodes}
                placeholder="全部类型"
              />
              {showDpIdFilter && (
                <MultiSelect
                  label="dpId"
                  hint="id / code"
                  options={dpOptions}
                  value={dpIds}
                  onChange={setDpIds}
                  placeholder={productDps.length ? '全部 DP' : '无 schema'}
                  emptyText={
                    productDps.length === 0 ? '当前 productId 暂无本地 schema' : '无匹配项'
                  }
                />
              )}
              <div className="field">
                <label className="field-label">开始时间</label>
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">结束时间</label>
                <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <button className="btn primary" type="submit">
                筛选
              </button>
            </form>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>bizCode</th>
                    <th>属性</th>
                    <th>payload</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        暂无日志
                      </td>
                    </tr>
                  ) : (
                    events.map((ev) => (
                      <tr key={ev.id} className="no-click">
                        <td className="log-time">
                          {new Date(ev.eventTime).toLocaleString()}
                        </td>
                        <td className="log-biz">{formatBizCodeLabel(ev.bizCode)}</td>
                        <td className="log-props-cell">
                          {(() => {
                            const lines = eventPropertyLines(ev.payload, propertyCatalog);
                            if (lines.length === 0) return <span className="muted">—</span>;
                            return (
                              <ul className="log-props">
                                {lines.map((line, index) => (
                                  <li key={`${line.name}-${index}`}>
                                    <span>{line.name}</span>
                                    <span className="num">{line.value}</span>
                                  </li>
                                ))}
                              </ul>
                            );
                          })()}
                        </td>
                        <td>
                          <pre
                            className={`log-payload mono${prettyPayload ? '' : ' log-payload-compact'}`}
                          >
                            {JSON.stringify(ev.payload, null, prettyPayload ? 2 : undefined)}
                          </pre>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="log-pager">
              <button
                type="button"
                className="btn"
                disabled={eventPage <= 1}
                onClick={() => changeEventPage(eventPage - 1)}
              >
                上一页
              </button>
              <label className="log-page-jump">
                页码
                <input
                  type="number"
                  min={1}
                  max={eventPageCount}
                  inputMode="numeric"
                  aria-label="设备日志页码"
                  value={eventPageDraft}
                  onChange={(e) => setEventPageDraft(e.target.value)}
                  onBlur={jumpEventPage}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      jumpEventPage();
                    }
                  }}
                />
                <span>/ {eventPageCount}</span>
              </label>
              <button
                type="button"
                className="btn"
                disabled={eventPage >= eventPageCount}
                onClick={() => changeEventPage(eventPage + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
