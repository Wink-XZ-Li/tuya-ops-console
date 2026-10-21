import { Injectable, Logger } from '@nestjs/common';
import { TuyaContext } from '@tuya/tuya-connector-nodejs';

export interface TuyaDeviceSummary {
  deviceId: string;
  productId: string;
  name: string;
  online?: boolean;
  lat?: string;
  lon?: string;
  /** Owner uid from the cloud device record, when the list payload includes it. */
  uid?: string;
}

export interface TuyaDeviceDetail extends TuyaDeviceSummary {
  uuid?: string;
  category?: string;
}

export interface TuyaUserProfile {
  tuyaUid: string;
  username?: string;
  nickName?: string;
  mobile?: string;
  email?: string;
  countryCode?: string;
  timeZoneId?: string;
  tempUnit?: number;
  avatar?: string;
  cloudCreatedAt?: Date;
  cloudUpdatedAt?: Date;
  userProperties?: Array<{ code: string; value: string }>;
  raw?: Record<string, unknown>;
}

export interface TuyaUserHome {
  homeId: string;
  name: string;
  role?: string;
  lon?: number;
  lat?: number;
  geoName?: string;
  raw?: Record<string, unknown>;
}

export type TuyaUserDeviceFrom = 'home' | 'sharing' | 'unknown';

/** Sanitized user-owned device (no local_key). */
export interface TuyaUserDevice {
  deviceId: string;
  name?: string;
  productId?: string;
  productName?: string;
  category?: string;
  online?: boolean;
  uuid?: string;
  ownerId?: string;
  icon?: string;
  from: TuyaUserDeviceFrom;
  status?: Array<{ code: string; value: unknown }>;
  activeTime?: number;
  createTime?: number;
  updateTime?: number;
  raw?: Record<string, unknown>;
}

export interface StandardFunction {
  code: string;
  name?: string;
  type?: string;
  values?: unknown;
  /** rw | wr | ro — when missing, treat as writable (standard instruction set). */
  mode?: string;
  /** DP id from the thing model (abilityId). */
  dpId?: number;
}

export const TUYA_CLIENT = Symbol('TUYA_CLIENT');

export interface ListAppUsersPage {
  list: TuyaUserProfile[];
  hasMore: boolean;
  total?: number;
}

/** App device activation / active series (数据星象仪). */
export interface TuyaDeviceStatPoint {
  dt: string;
  activationNum: number;
  activationTotalNum: number;
  activeNum: number;
}

export interface TuyaRegisterStatPoint {
  dt: string;
  todayRegisterNum: number;
  totalRegisterNum: number;
}

export interface TuyaControlStatPoint {
  dt: string;
  controlNum: number;
  controlUserNum: number;
}

export type TuyaLocationDateType = 'day' | 'week' | 'weeks' | 'month';
export type TuyaLocationRegionType = 'country' | 'province' | 'city';

export interface TuyaLocationActivePoint {
  name: string;
  value: number;
  percentage: string;
}

/** GET /v1.0/devices/datas-survey — device fault / active overview. */
export interface TuyaDevicesDatasSurvey {
  deviceTotal: number;
  deviceOnline: number;
  deviceOffline: number;
  deviceActive: number;
  deviceFault: number;
  raw?: Record<string, unknown>;
}

/** GET /v1.0/devices/live-datas-survey — near-real-time device survey. */
export interface TuyaDevicesLiveDatasSurvey {
  deviceOnline: number;
  deviceOffline: number;
  deviceActive: number;
  deviceFault: number;
  raw?: Record<string, unknown>;
}

export interface TuyaClient {
  getDevice(deviceId: string): Promise<TuyaDeviceDetail>;
  getDeviceStatus(deviceId: string): Promise<Array<{ code: string; value: unknown }>>;
  getStandardFunctions(deviceId: string): Promise<StandardFunction[]>;
  /** Full thing-model properties, including read-only DPs such as fault. */
  getThingProperties(deviceId: string): Promise<StandardFunction[]>;
  sendStandardCommand(
    deviceId: string,
    commands: Array<{ code: string; value: unknown }>,
  ): Promise<unknown>;
  /** Cloud project devices, all products. */
  listDevices(pageOrCursor?: {
    lastId?: string;
    pageSize?: number;
  }): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }>;
  listDevicesByProduct(
    productId: string,
    pageOrCursor?: number | { lastId?: string; pageSize?: number },
  ): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }>;
  getDeviceUsers(deviceId: string): Promise<string[]>;
  /** Prefer this when syncing — may include nick/mobile from device-user APIs. */
  getDeviceUserProfiles(deviceId: string): Promise<TuyaUserProfile[]>;
  /** GET /v2.0/cloud/thing/{id}/{wifi|zigbee}/signal. Null when the cloud has no recent sample. */
  getDeviceSignal(deviceId: string): Promise<string | null>;
  getUserProfile(tuyaUid: string): Promise<TuyaUserProfile | null>;
  /** App users under schema — GET /v1.0/apps/{schema}/users */
  listAppUsers(params: {
    schema: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<ListAppUsersPage>;
  /** GET /v1.0/users/{uid}/homes */
  listUserHomes(tuyaUid: string): Promise<TuyaUserHome[]>;
  /** GET /v1.0/users/{uid}/devices — local_key stripped */
  listUserDevices(
    tuyaUid: string,
    opts?: { from?: 'home' | 'sharing' },
  ): Promise<TuyaUserDevice[]>;
  /** GET /v1.0/iot-datacenter/app/device/stat */
  getAppDeviceStat(params: {
    startDay: string;
    endDay: string;
    productId?: string;
  }): Promise<TuyaDeviceStatPoint[]>;
  /** GET /v1.0/iot-datacenter/app/device/control */
  getAppDeviceControl(params: {
    startDay: string;
    endDay: string;
    productId?: string;
  }): Promise<TuyaControlStatPoint[]>;
  /** GET /v1.0/iot-datacenter/app/user/register/stat */
  getAppUserRegisterStat(params: {
    startDay: string;
    endDay: string;
  }): Promise<TuyaRegisterStatPoint[]>;
  /** GET /v1.1/devices/locations-active-datas */
  getLocationsActiveDatas(params: {
    dateType: TuyaLocationDateType;
    type?: TuyaLocationRegionType;
    limit?: number;
    productId?: string;
  }): Promise<TuyaLocationActivePoint[]>;
  /** GET /v1.0/devices/datas-survey */
  getDevicesDatasSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesDatasSurvey>;
  /** Alias of getDevicesDatasSurvey */
  getDevicesSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesDatasSurvey>;
  /** GET /v1.0/devices/live-datas-survey */
  getDevicesLiveDatasSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesLiveDatasSurvey>;
  /** GET /v1.0/iot-03/geocode-cities/latitude-longitude */
  reverseGeocode(params: {
    latitude: string;
    longitude: string;
  }): Promise<TuyaGeocodeResult>;
  /** GET /v1.0/iot-03/devices/{device_id}/report-logs */
  getDeviceReportLogs(params: {
    deviceId: string;
    codes: string;
    startTime: number;
    endTime: number;
    size?: number;
    lastRowKey?: string;
  }): Promise<TuyaDeviceReportLogsPage>;
  /** GET /v1.0/iot-03/devices/{device_id}/upgrade-infos */
  getDeviceUpgradeInfos(deviceId: string): Promise<TuyaFirmwareUpgradeInfo[]>;
}

export interface TuyaGeocodeResult {
  longitude: string;
  latitude: string;
  address: string;
}

export interface TuyaDeviceReportLog {
  code: string;
  value: unknown;
  eventTime: number;
}

export interface TuyaDeviceReportLogsPage {
  deviceId: string;
  hasMore: boolean;
  total?: number;
  lastRowKey?: string;
  list: TuyaDeviceReportLog[];
}

export interface TuyaFirmwareUpgradeInfo {
  type?: string;
  currentVersion?: string;
  version?: string;
  upgradeStatus?: number | string;
  desc?: string;
  raw?: Record<string, unknown>;
}

/** Product allowlist is disabled: any non-empty product id can be synced. */
export function isAllowedProduct(productId: string, _allowed?: Set<string>): boolean {
  return productId.trim().length > 0;
}

export const DEFAULT_PRODUCT_IDS = [
  'uhmj5b0ba31zpme6',
  'qxjzruuqz40bty7e',
  'nohrp3vbmef7vxvx',
  '7sylzgrdnnq2w5mo',
  'wquesyz0b2h8mxsu', // 斯德哥尔摩-400G
  'ckjfqtnqqystvfaa', // 国内伊莱克斯燃气壁挂炉T16-VT1系列
  '90wi2aimyqstn9qc', // 国内西屋燃气壁挂炉T6-WX2系列
];

export function parseProductIds(raw = process.env.TUYA_PRODUCT_IDS ?? ''): Set<string> {
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return new Set(ids.length ? ids : DEFAULT_PRODUCT_IDS);
}

@Injectable()
export class TuyaLiveClient implements TuyaClient {
  private readonly logger = new Logger(TuyaLiveClient.name);
  private readonly context: TuyaContext;

  constructor(context?: TuyaContext) {
    this.context =
      context ??
      new TuyaContext({
        baseUrl: process.env.TUYA_BASE_URL ?? 'https://openapi.tuyacn.com',
        accessKey: process.env.TUYA_ACCESS_ID ?? '',
        secretKey: process.env.TUYA_ACCESS_SECRET ?? '',
      });
  }

  async getDevice(deviceId: string): Promise<TuyaDeviceDetail> {
    const res = await this.context.request<Record<string, unknown>>({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}`,
    });
    if (!res.success) {
      const code = (res as { code?: number }).code;
      const msg = (res as { msg?: string }).msg ?? 'unknown';
      if (code === 28841002) {
        throw new Error(
          `涂鸦 IoT Core 未开通或试用已到期 [${code}]。请到云开发 → 云服务 → IoT Core 延长试用后再同步单设备。`,
        );
      }
      throw new Error(`Tuya getDevice failed for ${deviceId}: [${code}] ${msg}`);
    }
    const result = res.result ?? {};
    const productId = String(result.product_id ?? result.productId ?? '');
    return {
      deviceId: String(result.id ?? deviceId),
      productId,
      name: String(result.custom_name ?? result.customName ?? result.name ?? ''),
      online: Boolean(result.is_online ?? result.isOnline ?? result.online),
      uuid: result.uuid ? String(result.uuid) : undefined,
      category: result.category ? String(result.category) : undefined,
      lat: result.lat != null && String(result.lat) !== '' ? String(result.lat) : undefined,
      lon: result.lon != null && String(result.lon) !== '' ? String(result.lon) : undefined,
      uid: result.uid != null && String(result.uid) !== '' ? String(result.uid) : undefined,
    };
  }

  async getDeviceStatus(deviceId: string): Promise<Array<{ code: string; value: unknown }>> {
    const [reported, shadow] = await Promise.all([
      this.fetchReportedStatus(deviceId),
      this.fetchShadowStatus(deviceId),
    ]);
    if (!reported.ok && shadow.length === 0) {
      throw new Error(reported.error ?? `Tuya getDeviceStatus failed for ${deviceId}`);
    }
    const byCode = new Map<string, { code: string; value: unknown }>();
    for (const item of shadow) {
      if (item.code) byCode.set(item.code, item);
    }
    for (const item of reported.pairs) {
      if (item.code) byCode.set(item.code, item);
    }
    return [...byCode.values()];
  }

  private async fetchReportedStatus(deviceId: string): Promise<{
    ok: boolean;
    error?: string;
    pairs: Array<{ code: string; value: unknown }>;
  }> {
    const res = await this.context.request<Array<{ code: string; value: unknown }>>({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/status`,
    });
    if (!res.success) {
      const code = (res as { code?: number }).code;
      const msg = (res as { msg?: string }).msg ?? 'unknown';
      return {
        ok: false,
        error: `Tuya getDeviceStatus failed for ${deviceId}: [${code}] ${msg}`,
        pairs: [],
      };
    }
    return { ok: true, pairs: res.result ?? [] };
  }

  private async fetchShadowStatus(
    deviceId: string,
  ): Promise<Array<{ code: string; value: unknown }>> {
    try {
      const res = await this.context.request<{ properties?: Array<Record<string, unknown>> }>({
        method: 'GET',
        path: `/v2.0/cloud/thing/${deviceId}/shadow/properties`,
      });
      if (!res.success) return [];
      return (res.result?.properties ?? [])
        .map((item) => ({
          code: String(item.code ?? ''),
          value: item.value,
        }))
        .filter((item) => item.code);
    } catch {
      return [];
    }
  }

  async getStandardFunctions(deviceId: string): Promise<StandardFunction[]> {
    const res = await this.context.request<{ functions?: StandardFunction[] }>({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/functions`,
    });
    if (!res.success) {
      const code = (res as { code?: number }).code;
      const msg = (res as { msg?: string }).msg ?? 'unknown';
      throw new Error(`Tuya getStandardFunctions failed for ${deviceId}: [${code}] ${msg}`);
    }
    return res.result?.functions ?? [];
  }

  async getThingProperties(deviceId: string): Promise<StandardFunction[]> {
    try {
      const res = await this.context.request<{ model?: string }>({
        method: 'GET',
        path: `/v2.0/cloud/thing/${deviceId}/model`,
      });
      if (!res.success || !res.result?.model) return [];
      return propertiesFromThingModel(res.result.model);
    } catch {
      return [];
    }
  }

  async sendStandardCommand(
    deviceId: string,
    commands: Array<{ code: string; value: unknown }>,
  ): Promise<unknown> {
    const res = await this.context.request({
      method: 'POST',
      path: `/v1.0/devices/${deviceId}/commands`,
      body: { commands },
    });
    if (!res.success) {
      const code = (res as { code?: number }).code;
      const msg = (res as { msg?: string }).msg ?? 'unknown';
      throw new Error(`Tuya sendStandardCommand failed for ${deviceId}: [${code}] ${msg}`);
    }
    return res.result;
  }

  async listDevices(
    pageOrCursor: { lastId?: string; pageSize?: number } = {},
  ): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }> {
    return this.queryCloudDevices(pageOrCursor);
  }

  async listDevicesByProduct(
    productId: string,
    pageOrCursor: number | { lastId?: string; pageSize?: number } = 1,
  ): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }> {
    if (typeof pageOrCursor === 'number') {
      return this.queryCloudDevices({ productId, page: pageOrCursor });
    }
    return this.queryCloudDevices({ productId, ...pageOrCursor });
  }

  private async queryCloudDevices(params: {
    productId?: string;
    lastId?: string;
    pageSize?: number;
    page?: number;
  }): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }> {
    // Prefer Cloud Development device list (IoT Core). Cursor via last_id.
    // Numeric `page` kept for mock/tests: page>1 returns empty for live (callers should use lastId).
    if (params.page != null && params.page > 1) {
      return { list: [], total: 0 };
    }

    const query: Record<string, string | number> = {
      page_size: params.pageSize ?? 20,
    };
    if (params.productId) query.product_ids = params.productId;
    if (params.lastId) query.last_id = params.lastId;
    const productId = params.productId ?? '';

    const res = await this.context.request<Array<Record<string, unknown>> | {
      list?: Array<Record<string, unknown>>;
      devices?: Array<Record<string, unknown>>;
      total?: number;
    }>({
      method: 'GET',
      path: '/v2.0/cloud/thing/device',
      query,
    });

    if (!res.success) {
      const code = (res as { code?: number }).code;
      const msg = (res as { msg?: string }).msg ?? 'unknown';
      this.logger.warn(`listDevices failed${productId ? ` for ${productId}` : ''}: code=${code} msg=${msg}`);
      if (code === 28841002) {
        throw new Error(
          `涂鸦 IoT Core 未开通或试用已到期 [${code}]。请到云开发 → 云服务 → IoT Core 申请延长试用后再点「触发同步」。`,
        );
      }
      throw new Error(`涂鸦 OpenAPI 失败${productId ? ` (${productId})` : ''}: [${code}] ${msg}`);
    }

    const raw = res.result;
    const devices = Array.isArray(raw)
      ? raw
      : (((raw as { devices?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> })
          ?.devices ??
          (raw as { list?: Array<Record<string, unknown>> })?.list ??
          []) as Array<Record<string, unknown>>);

    const list = devices
      .map((d) => ({
        deviceId: String(d.id ?? d.device_id ?? ''),
        productId: String(d.product_id ?? d.productId ?? productId),
        name: String(d.custom_name ?? d.customName ?? d.name ?? ''),
        online:
          d.is_online != null
            ? Boolean(d.is_online)
            : d.isOnline != null
              ? Boolean(d.isOnline)
              : d.online != null
                ? Boolean(d.online)
                : undefined,
        lat: d.lat != null && String(d.lat) !== '' ? String(d.lat) : undefined,
        lon: d.lon != null && String(d.lon) !== '' ? String(d.lon) : undefined,
        uid: d.uid != null && String(d.uid) !== '' ? String(d.uid) : undefined,
      }))
      .filter((d) => d.deviceId);

    const nextLastId = list.length > 0 ? list[list.length - 1].deviceId : undefined;
    const total =
      !Array.isArray(raw) && raw && typeof (raw as { total?: number }).total === 'number'
        ? Number((raw as { total: number }).total)
        : list.length;

    return { list, total, nextLastId };
  }

  async getDeviceUsers(deviceId: string): Promise<string[]> {
    const profiles = await this.getDeviceUserProfiles(deviceId);
    return profiles.map((p) => p.tuyaUid);
  }

  async getDeviceUserProfiles(deviceId: string): Promise<TuyaUserProfile[]> {
    const paths = [
      `/v1.0/devices/${deviceId}/users`,
      `/v1.0/iot-03/devices/${deviceId}/users`,
      `/v2.0/cloud/thing/${deviceId}/user`,
    ];
    for (const path of paths) {
      try {
        const res = await this.context.request<Record<string, unknown>>({
          method: 'GET',
          path,
        });
        if (!res.success || !res.result) continue;
        const parsed = parseDeviceUserResult(res.result);
        if (parsed.length > 0) return parsed;
      } catch (err) {
        this.logger.debug(`getDeviceUserProfiles ${path} failed for ${deviceId}: ${String(err)}`);
      }
    }
    this.logger.warn(`getDeviceUserProfiles empty for ${deviceId}`);
    return [];
  }

  async getDeviceSignal(deviceId: string): Promise<string | null> {
    for (const deviceType of ['wifi', 'zigbee']) {
      try {
        const res = await this.context.request<Record<string, unknown>>({
          method: 'GET',
          path: `/v2.0/cloud/thing/${deviceId}/${deviceType}/signal`,
        });
        if (!res.success || !res.result) continue;
        const text = formatDeviceSignal(res.result);
        if (text) return text;
      } catch (err) {
        this.logger.debug(
          `getDeviceSignal ${deviceType} failed for ${deviceId}: ${String(err)}`,
        );
      }
    }
    return null;
  }

  async getUserProfile(tuyaUid: string): Promise<TuyaUserProfile | null> {
    const paths = [
      `/v1.0/users/${tuyaUid}/infos`,
      `/v1.0/users/${tuyaUid}`,
      `/v1.0/iot-03/users/${tuyaUid}`,
      `/v2.0/cloud/device/member/${tuyaUid}`,
    ];
    for (const path of paths) {
      try {
        const res = await this.context.request<Record<string, unknown>>({
          method: 'GET',
          path,
        });
        if (!res.success || !res.result) {
          continue;
        }
        const result = res.result;
        const profile = pickUserFields(tuyaUid, result);
        if (
          profile.username ||
          profile.nickName ||
          profile.mobile ||
          profile.email ||
          profile.avatar ||
          profile.raw
        ) {
          return profile;
        }
      } catch (err) {
        this.logger.debug(`getUserProfile ${path} failed for ${tuyaUid}: ${String(err)}`);
      }
    }
    return null;
  }

  async listAppUsers(params: {
    schema: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<ListAppUsersPage> {
    const schema = params.schema.trim();
    if (!schema) {
      throw new Error('listAppUsers requires schema (TUYA_APP_SCHEMA)');
    }
    const pageNo = params.pageNo ?? 1;
    const pageSize = params.pageSize ?? 100;
    const query: Record<string, string | number> = {
      page_no: pageNo,
      page_size: pageSize,
    };

    // Prefer v1.0 (full list by page). Fall back to v2.0 30-day window if needed.
    const paths = [`/v1.0/apps/${schema}/users`, `/v2.0/apps/${schema}/users`];
    let lastError = 'unknown';

    for (const path of paths) {
      const pathQuery =
        path.startsWith('/v2.0/')
          ? {
              ...query,
              start_time: Math.floor(Date.now() / 1000) - 30 * 24 * 3600,
              end_time: Math.floor(Date.now() / 1000),
            }
          : query;

      const res = await this.context.request<{
        list?: Array<Record<string, unknown>>;
        has_more?: boolean;
        hasMore?: boolean;
        total?: number;
      }>({
        method: 'GET',
        path,
        query: pathQuery,
      });

      if (!res.success) {
        const code = (res as { code?: number }).code;
        const msg = (res as { msg?: string }).msg ?? 'unknown';
        lastError = `[${code}] ${msg}`;
        // 1108 = path not available on this project; try next.
        if (code === 1108) continue;
        throw new Error(`Tuya listAppUsers failed: ${lastError}`);
      }

      const raw = res.result ?? {};
      const rows = Array.isArray(raw.list) ? raw.list : [];
      const list: TuyaUserProfile[] = [];
      for (const row of rows) {
        const uid = String(row.uid ?? row.tuyaUid ?? row.user_id ?? '');
        if (!uid) continue;
        list.push(pickUserFields(uid, row));
      }

      return {
        list,
        hasMore: Boolean(raw.has_more ?? raw.hasMore),
        total: typeof raw.total === 'number' ? raw.total : undefined,
      };
    }

    throw new Error(`Tuya listAppUsers failed: ${lastError}`);
  }

  async listUserHomes(tuyaUid: string): Promise<TuyaUserHome[]> {
    const res = await this.context.request<Array<Record<string, unknown>>>({
      method: 'GET',
      path: `/v1.0/users/${tuyaUid}/homes`,
    });
    if (!res.success) {
      const code = (res as { code?: number }).code;
      const msg = (res as { msg?: string }).msg ?? 'unknown';
      throw new Error(`Tuya listUserHomes failed: [${code}] ${msg}`);
    }
    const rows = Array.isArray(res.result) ? res.result : [];
    return rows.map((row) => {
      const homeId = String(row.home_id ?? row.homeId ?? row.id ?? '');
      return {
        homeId,
        name: String(row.name ?? '') || homeId || '未命名家庭',
        role: row.role != null ? String(row.role) : undefined,
        lon: row.lon != null ? Number(row.lon) : undefined,
        lat: row.lat != null ? Number(row.lat) : undefined,
        geoName: row.geo_name != null ? String(row.geo_name) : row.geoName != null ? String(row.geoName) : undefined,
        raw: row,
      };
    }).filter((h) => h.homeId);
  }

  async listUserDevices(
    tuyaUid: string,
    opts?: { from?: 'home' | 'sharing' },
  ): Promise<TuyaUserDevice[]> {
    const fromValues: Array<'home' | 'sharing' | undefined> = opts?.from
      ? [opts.from]
      : [undefined, 'home', 'sharing'];

    const seen = new Set<string>();
    const out: TuyaUserDevice[] = [];

    for (const from of fromValues) {
      const query: Record<string, string | number> = {};
      if (from) query.from = from === 'sharing' ? 'sharing' : 'home';
      // Some docs use share vs sharing — try both if needed below.

      let res = await this.context.request<Array<Record<string, unknown>>>({
        method: 'GET',
        path: `/v1.0/users/${tuyaUid}/devices`,
        query: Object.keys(query).length ? query : undefined,
      });

      if (!res.success && from === 'sharing') {
        res = await this.context.request<Array<Record<string, unknown>>>({
          method: 'GET',
          path: `/v1.0/users/${tuyaUid}/devices`,
          query: { from: 'share' },
        });
      }

      if (!res.success) {
        const code = (res as { code?: number }).code;
        const msg = (res as { msg?: string }).msg ?? 'unknown';
        this.logger.debug(`listUserDevices from=${from ?? 'all'} failed: [${code}] ${msg}`);
        if (from == null && fromValues.length === 1) {
          throw new Error(`Tuya listUserDevices failed: [${code}] ${msg}`);
        }
        continue;
      }

      const rows = Array.isArray(res.result) ? res.result : [];
      for (const row of rows) {
        const device = sanitizeUserDevice(row, from ?? 'unknown');
        if (!device.deviceId || seen.has(device.deviceId)) continue;
        seen.add(device.deviceId);
        out.push(device);
      }

      // Unscoped call already returned everything — no need to also fetch home/sharing.
      if (from == null && rows.length > 0) break;
    }

    return out;
  }

  async getAppDeviceStat(params: {
    startDay: string;
    endDay: string;
    productId?: string;
  }): Promise<TuyaDeviceStatPoint[]> {
    const body: Record<string, string> = {
      startDay: params.startDay,
      endDay: params.endDay,
    };
    if (params.productId) body.productId = params.productId;
    const res = await this.context.request<Array<Record<string, unknown>>>({
      method: 'GET',
      path: '/v1.0/iot-datacenter/app/device/stat',
      query: { params: JSON.stringify(body) },
    });
    if (!res.success) {
      throw new Error(
        `Tuya getAppDeviceStat failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    return (res.result ?? []).map((row) => ({
      dt: normalizeDay(row.dt),
      activationNum: Number(row.activationNum ?? 0),
      activationTotalNum: Number(row.activationTotalNum ?? 0),
      activeNum: Number(row.activeNum ?? 0),
    }));
  }

  async getAppDeviceControl(params: {
    startDay: string;
    endDay: string;
    productId?: string;
  }): Promise<TuyaControlStatPoint[]> {
    const body: Record<string, string> = {
      startDay: params.startDay,
      endDay: params.endDay,
    };
    if (params.productId) body.productId = params.productId;
    const res = await this.context.request<Array<Record<string, unknown>>>({
      method: 'GET',
      path: '/v1.0/iot-datacenter/app/device/control',
      query: { params: JSON.stringify(body) },
    });
    if (!res.success) {
      throw new Error(
        `Tuya getAppDeviceControl failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    return (res.result ?? []).map((row) => ({
      dt: normalizeDay(row.dt),
      controlNum: Number(row.controlNum ?? row.control_num ?? 0),
      controlUserNum: Number(row.controlUserNum ?? row.control_user_num ?? 0),
    }));
  }

  async getAppUserRegisterStat(params: {
    startDay: string;
    endDay: string;
  }): Promise<TuyaRegisterStatPoint[]> {
    const res = await this.context.request<Array<Record<string, unknown>>>({
      method: 'GET',
      path: '/v1.0/iot-datacenter/app/user/register/stat',
      query: {
        params: JSON.stringify({
          startDay: params.startDay,
          endDay: params.endDay,
        }),
      },
    });
    if (!res.success) {
      throw new Error(
        `Tuya getAppUserRegisterStat failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    return (res.result ?? []).map((row) => ({
      dt: normalizeDay(row.dt),
      todayRegisterNum: Number(row.todayRegisterNum ?? 0),
      totalRegisterNum: Number(row.totalRegisterNum ?? 0),
    }));
  }

  async getLocationsActiveDatas(params: {
    dateType: TuyaLocationDateType;
    type?: TuyaLocationRegionType;
    limit?: number;
    productId?: string;
  }): Promise<TuyaLocationActivePoint[]> {
    const query: Record<string, string | number> = {
      date_type: params.dateType,
      type: params.type ?? 'province',
      limit: params.limit ?? 20,
    };
    if (params.productId) query.productId = params.productId;

    const res = await this.context.request<Array<Record<string, unknown>>>({
      method: 'GET',
      path: '/v1.1/devices/locations-active-datas',
      query,
    });
    if (!res.success) {
      throw new Error(
        `Tuya getLocationsActiveDatas failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    return (res.result ?? []).map((row) => ({
      name: String(row.name ?? ''),
      value: Number(row.value ?? 0),
      percentage: String(row.percentage ?? ''),
    }));
  }

  async getDevicesDatasSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesDatasSurvey> {
    const query: Record<string, string> = {};
    if (params?.productId) query.product_id = params.productId;
    const res = await this.context.request<Record<string, unknown>>({
      method: 'GET',
      path: '/v1.0/devices/datas-survey',
      query: Object.keys(query).length ? query : undefined,
    });
    if (!res.success) {
      throw new Error(
        `Tuya getDevicesDatasSurvey failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    return parseDevicesDatasSurvey(res.result ?? {});
  }

  async getDevicesSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesDatasSurvey> {
    return this.getDevicesDatasSurvey(params);
  }

  async getDevicesLiveDatasSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesLiveDatasSurvey> {
    const query: Record<string, string> = {};
    if (params?.productId) query.product_id = params.productId;
    const res = await this.context.request<Record<string, unknown>>({
      method: 'GET',
      path: '/v1.0/devices/live-datas-survey',
      query: Object.keys(query).length ? query : undefined,
    });
    if (!res.success) {
      throw new Error(
        `Tuya getDevicesLiveDatasSurvey failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    const row = res.result ?? {};
    return {
      deviceOnline: numField(row, ['device_online', 'deviceOnline', 'online_num', 'onlineNum']),
      deviceOffline: numField(row, ['device_offline', 'deviceOffline', 'offline_num', 'offlineNum']),
      deviceActive: numField(row, ['device_active', 'deviceActive', 'active_num', 'activeNum']),
      deviceFault: numField(row, ['device_fault', 'deviceFault', 'fault_num', 'faultNum']),
      raw: row,
    };
  }

  async reverseGeocode(params: {
    latitude: string;
    longitude: string;
  }): Promise<TuyaGeocodeResult> {
    const res = await this.context.request<Record<string, unknown>>({
      method: 'GET',
      path: '/v1.0/iot-03/geocode-cities/latitude-longitude',
      query: {
        latitude: params.latitude,
        longitude: params.longitude,
      },
    });
    if (!res.success) {
      throw new Error(
        `Tuya reverseGeocode failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    const row = res.result ?? {};
    return {
      longitude: String(row.longitude ?? params.longitude),
      latitude: String(row.latitude ?? params.latitude),
      address: String(row.address ?? ''),
    };
  }

  async getDeviceReportLogs(params: {
    deviceId: string;
    codes: string;
    startTime: number;
    endTime: number;
    size?: number;
    lastRowKey?: string;
  }): Promise<TuyaDeviceReportLogsPage> {
    // iot-03 report-logs is not authorized on this cloud project (28841105).
    // Device logs type=7 is the data-point report stream and is authorized.
    const query: Record<string, string> = {
      type: '7',
      start_time: String(params.startTime),
      end_time: String(params.endTime),
      size: String(Math.min(params.size ?? 20, 100)),
    };
    if (params.lastRowKey) query.start_row_key = params.lastRowKey;
    const res = await this.context.request<Record<string, unknown>>({
      method: 'GET',
      path: `/v1.0/devices/${params.deviceId}/logs`,
      query,
    });
    if (!res.success) {
      throw new Error(
        `Tuya getDeviceReportLogs failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    const row = res.result ?? {};
    const wanted = new Set(
      params.codes
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    );
    const rawList = (row.logs ?? row.list ?? []) as Array<Record<string, unknown>>;
    const list = rawList
      .map((item) => ({
        code: String(item.code ?? ''),
        value: parseReportValue(item.value),
        eventTime: Number(item.event_time ?? item.eventTime ?? 0),
      }))
      .filter((item) => item.code && (wanted.size === 0 || wanted.has(item.code)));
    return {
      deviceId: String(row.device_id ?? row.deviceId ?? params.deviceId),
      hasMore: Boolean(row.has_next ?? row.hasNext ?? row.has_more ?? row.hasMore),
      total: list.length,
      lastRowKey:
        row.next_row_key != null
          ? String(row.next_row_key)
          : row.last_row_key != null
            ? String(row.last_row_key)
            : undefined,
      list,
    };
  }

  async getDeviceUpgradeInfos(deviceId: string): Promise<TuyaFirmwareUpgradeInfo[]> {
    const res = await this.context.request<unknown>({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/upgrade-infos`,
    });
    if (!res.success) {
      throw new Error(
        `Tuya getDeviceUpgradeInfos failed: [${(res as { code?: number }).code}] ${(res as { msg?: string }).msg}`,
      );
    }
    const raw = res.result;
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { list?: unknown }).list)
        ? ((raw as { list: unknown[] }).list as unknown[])
        : [];
    return list.map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        type:
          row.module_type != null
            ? String(row.module_type)
            : row.type != null
              ? String(row.type)
              : undefined,
        currentVersion:
          row.current_version != null
            ? String(row.current_version)
            : row.currentVersion != null
              ? String(row.currentVersion)
              : undefined,
        version: row.version != null ? String(row.version) : undefined,
        upgradeStatus: (row.upgrade_status ?? row.upgradeStatus) as number | string | undefined,
        desc:
          row.module_desc != null
            ? String(row.module_desc)
            : row.desc != null
              ? String(row.desc)
              : undefined,
        raw: row,
      };
    });
  }
}

type ThingTypeSpec = {
  type?: string;
  range?: string[];
  label?: string[];
  maxlen?: number;
  max?: number;
  min?: number;
  scale?: number;
  step?: number;
  unit?: string;
};

export function propertiesFromThingModel(modelJson: string): StandardFunction[] {
  let parsed: { services?: Array<{ properties?: Array<Record<string, unknown>> }> };
  try {
    parsed = JSON.parse(modelJson) as typeof parsed;
  } catch {
    return [];
  }
  const out: StandardFunction[] = [];
  for (const service of parsed.services ?? []) {
    for (const prop of service.properties ?? []) {
      const code = String(prop.code ?? '');
      if (!code) continue;
      const spec = (prop.typeSpec ?? {}) as ThingTypeSpec;
      const mapped = mapThingType(spec);
      const abilityId = Number(prop.abilityId);
      out.push({
        code,
        name: prop.name != null ? String(prop.name) : undefined,
        mode: prop.accessMode != null ? String(prop.accessMode) : undefined,
        type: mapped.type,
        values: mapped.values,
        dpId: Number.isFinite(abilityId) ? abilityId : undefined,
      });
    }
  }
  return out;
}

function mapThingType(spec: ThingTypeSpec): { type: string; values: Record<string, unknown> } {
  const type = spec.type ?? 'string';
  if (type === 'bool') return { type: 'boolean', values: { type: 'bool' } };
  if (type === 'enum') return { type: 'enum', values: { range: spec.range ?? [], type: 'enum' } };
  if (type === 'value') {
    return {
      type: 'integer',
      values: {
        type: 'value',
        max: spec.max,
        min: spec.min,
        scale: spec.scale,
        step: spec.step,
        unit: spec.unit,
      },
    };
  }
  if (type === 'bitmap') {
    return {
      type: 'bitmap',
      values: { type: 'bitmap', label: spec.label ?? [], maxlen: spec.maxlen },
    };
  }
  return { type, values: { ...spec, type } };
}

function parseReportValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return value;
}

function numField(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') {
      const n = Number(row[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function parseDevicesDatasSurvey(row: Record<string, unknown>): TuyaDevicesDatasSurvey {
  return {
    deviceTotal: numField(row, [
      'device_num',
      'deviceNum',
      'device_total',
      'deviceTotal',
      'total',
    ]),
    deviceOnline: numField(row, ['device_online', 'deviceOnline', 'online_num', 'onlineNum']),
    deviceOffline: numField(row, ['device_offline', 'deviceOffline', 'offline_num', 'offlineNum']),
    deviceActive: numField(row, ['device_active', 'deviceActive', 'active_num', 'activeNum']),
    deviceFault: numField(row, ['device_fault', 'deviceFault', 'fault_num', 'faultNum']),
    raw: row,
  };
}

function normalizeDay(value: unknown): string {
  if (value == null) return '';
  const s = String(value).replace(/-/g, '');
  return s.length >= 8 ? s.slice(0, 8) : s;
}

function epochToDate(value: unknown): Date | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Tuya often returns seconds.
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function sanitizeUserDevice(
  row: Record<string, unknown>,
  from: TuyaUserDeviceFrom,
): TuyaUserDevice {
  const {
    local_key: _lk1,
    localKey: _lk2,
    ...rest
  } = row;
  void _lk1;
  void _lk2;

  const statusRaw = rest.status;
  const status = Array.isArray(statusRaw)
    ? statusRaw
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({ code: String(s.code ?? ''), value: s.value }))
        .filter((s) => s.code)
    : undefined;

  return {
    deviceId: String(rest.id ?? rest.device_id ?? rest.deviceId ?? ''),
    name: rest.name != null ? String(rest.name) : undefined,
    productId: rest.product_id != null ? String(rest.product_id) : rest.productId != null ? String(rest.productId) : undefined,
    productName:
      rest.product_name != null
        ? String(rest.product_name)
        : rest.productName != null
          ? String(rest.productName)
          : undefined,
    category: rest.category != null ? String(rest.category) : undefined,
    online:
      rest.online != null
        ? Boolean(rest.online)
        : rest.is_online != null
          ? Boolean(rest.is_online)
          : undefined,
    uuid: rest.uuid != null ? String(rest.uuid) : undefined,
    ownerId: rest.owner_id != null ? String(rest.owner_id) : rest.ownerId != null ? String(rest.ownerId) : undefined,
    icon: rest.icon != null ? String(rest.icon) : undefined,
    from,
    status,
    activeTime: rest.active_time != null ? Number(rest.active_time) : undefined,
    createTime: rest.create_time != null ? Number(rest.create_time) : undefined,
    updateTime: rest.update_time != null ? Number(rest.update_time) : undefined,
    raw: rest as Record<string, unknown>,
  };
}

function pickUserFields(tuyaUid: string, result: Record<string, unknown>): TuyaUserProfile {
  const propsRaw = result.user_properties ?? result.userProperties;
  const userProperties = Array.isArray(propsRaw)
    ? propsRaw
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({
          code: String(p.code ?? ''),
          value: String(p.value ?? ''),
        }))
        .filter((p) => p.code)
    : undefined;

  const tempUnitRaw = result.temp_unit ?? result.tempUnit;
  const tempUnit =
    tempUnitRaw != null && tempUnitRaw !== '' && Number.isFinite(Number(tempUnitRaw))
      ? Number(tempUnitRaw)
      : undefined;

  return {
    tuyaUid,
    username:
      String(
        result.user_name ??
          result.username ??
          result.name ??
          '',
      ) || undefined,
    nickName:
      String(result.nick_name ?? result.nickname ?? result.nickName ?? '') || undefined,
    mobile: String(result.mobile ?? result.phone ?? result.mobile_name ?? '') || undefined,
    email: String(result.email ?? '') || undefined,
    countryCode:
      String(result.country_code ?? result.countryCode ?? '') || undefined,
    timeZoneId:
      String(result.time_zone_id ?? result.timeZoneId ?? '') || undefined,
    tempUnit,
    avatar: String(result.avatar ?? '') || undefined,
    cloudCreatedAt: epochToDate(result.create_time ?? result.createTime),
    cloudUpdatedAt: epochToDate(result.update_time ?? result.updateTime),
    userProperties,
    raw: result,
  };
}

function formatDeviceSignal(result: Record<string, unknown>): string | null {
  const signal = result.signal != null && String(result.signal) !== '' ? String(result.signal) : '';
  const level =
    result.signalLevel != null && String(result.signalLevel) !== ''
      ? String(result.signalLevel)
      : result.signal_level != null && String(result.signal_level) !== ''
        ? String(result.signal_level)
        : '';
  if (!signal && !level) return null;
  const dbm = signal ? (signal.includes('dBm') ? signal : `${signal} dBm`) : '';
  return [dbm, level].filter(Boolean).join(' · ');
}

function parseDeviceUserResult(result: unknown): TuyaUserProfile[] {
  if (Array.isArray(result)) {
    return parseDeviceUserResult({ list: result });
  }
  if (!result || typeof result !== 'object') return [];
  const root = result as Record<string, unknown>;

  if (Array.isArray(root.uid_list) && !root.users && !root.list) {
    return root.uid_list
      .filter((u): u is string => typeof u === 'string' && !!u)
      .map((uid) => ({ tuyaUid: uid }));
  }

  const listCandidates: unknown[] = [];
  if (Array.isArray(root.users)) listCandidates.push(...root.users);
  if (Array.isArray(root.list)) listCandidates.push(...root.list);

  const out: TuyaUserProfile[] = [];
  for (const item of listCandidates) {
    if (typeof item === 'string' && item) {
      out.push({ tuyaUid: item });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const uid = String(row.uid ?? row.tuyaUid ?? row.user_id ?? row.owner_id ?? '');
    if (!uid) continue;
    out.push(pickUserFields(uid, row));
  }
  if (out.length === 0 && Array.isArray(root.uid_list)) {
    return root.uid_list
      .filter((u): u is string => typeof u === 'string' && !!u)
      .map((uid) => ({ tuyaUid: uid }));
  }
  return out;
}
