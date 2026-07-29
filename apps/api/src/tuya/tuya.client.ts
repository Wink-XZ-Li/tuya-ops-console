import { Injectable, Logger } from '@nestjs/common';
import { TuyaContext } from '@tuya/tuya-connector-nodejs';

export interface TuyaDeviceSummary {
  deviceId: string;
  productId: string;
  name: string;
  online?: boolean;
  lat?: string;
  lon?: string;
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
}

export const TUYA_CLIENT = Symbol('TUYA_CLIENT');

export interface ListAppUsersPage {
  list: TuyaUserProfile[];
  hasMore: boolean;
  total?: number;
}

export interface TuyaClient {
  getDevice(deviceId: string): Promise<TuyaDeviceDetail>;
  getDeviceStatus(deviceId: string): Promise<Array<{ code: string; value: unknown }>>;
  getStandardFunctions(deviceId: string): Promise<StandardFunction[]>;
  sendStandardCommand(
    deviceId: string,
    commands: Array<{ code: string; value: unknown }>,
  ): Promise<unknown>;
  listDevicesByProduct(
    productId: string,
    pageOrCursor?: number | { lastId?: string; pageSize?: number },
  ): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }>;
  getDeviceUsers(deviceId: string): Promise<string[]>;
  /** Prefer this when syncing — may include nick/mobile from device-user APIs. */
  getDeviceUserProfiles(deviceId: string): Promise<TuyaUserProfile[]>;
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
}

export function isAllowedProduct(productId: string, allowed: Set<string>): boolean {
  return allowed.has(productId);
}

export const DEFAULT_PRODUCT_IDS = [
  'uhmj5b0ba31zpme6',
  'qxjzruuqz40bty7e',
  'nohrp3vbmef7vxvx',
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
  private readonly allowedProducts: Set<string>;
  private readonly context: TuyaContext;

  constructor(
    context?: TuyaContext,
    allowedProducts: Set<string> = parseProductIds(),
  ) {
    this.allowedProducts = allowedProducts;
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
    if (!isAllowedProduct(productId, this.allowedProducts)) {
      throw new Error(`Product ${productId} is not allowed`);
    }
    return {
      deviceId: String(result.id ?? deviceId),
      productId,
      name: String(result.custom_name ?? result.customName ?? result.name ?? ''),
      online: Boolean(result.is_online ?? result.isOnline ?? result.online),
      uuid: result.uuid ? String(result.uuid) : undefined,
      category: result.category ? String(result.category) : undefined,
      lat: result.lat != null && String(result.lat) !== '' ? String(result.lat) : undefined,
      lon: result.lon != null && String(result.lon) !== '' ? String(result.lon) : undefined,
    };
  }

  async getDeviceStatus(deviceId: string): Promise<Array<{ code: string; value: unknown }>> {
    const res = await this.context.request<Array<{ code: string; value: unknown }>>({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/status`,
    });
    if (!res.success) {
      throw new Error(`Tuya getDeviceStatus failed for ${deviceId}`);
    }
    return res.result ?? [];
  }

  async getStandardFunctions(deviceId: string): Promise<StandardFunction[]> {
    const res = await this.context.request<{ functions?: StandardFunction[] }>({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/functions`,
    });
    if (!res.success) {
      throw new Error(`Tuya getStandardFunctions failed for ${deviceId}`);
    }
    return res.result?.functions ?? [];
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
      throw new Error(`Tuya sendStandardCommand failed for ${deviceId}`);
    }
    return res.result;
  }

  async listDevicesByProduct(
    productId: string,
    pageOrCursor: number | { lastId?: string; pageSize?: number } = 1,
  ): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }> {
    if (!isAllowedProduct(productId, this.allowedProducts)) {
      return { list: [], total: 0 };
    }

    // Prefer Cloud Development device list (IoT Core). Cursor via last_id.
    // Numeric `page` kept for mock/tests: page>1 returns empty for live (callers should use lastId).
    const pageSize =
      typeof pageOrCursor === 'object' ? (pageOrCursor.pageSize ?? 20) : 20;
    const lastId = typeof pageOrCursor === 'object' ? pageOrCursor.lastId : undefined;
    if (typeof pageOrCursor === 'number' && pageOrCursor > 1) {
      return { list: [], total: 0 };
    }

    const query: Record<string, string | number> = {
      product_ids: productId,
      page_size: pageSize,
    };
    if (lastId) {
      query.last_id = lastId;
    }

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
      this.logger.warn(`listDevicesByProduct failed for ${productId}: code=${code} msg=${msg}`);
      if (code === 28841002) {
        throw new Error(
          `涂鸦 IoT Core 未开通或试用已到期 [${code}]。消息队列仍可独立工作；请到云开发 → 云服务 → IoT Core 申请延长试用后，再点「触发同步」。也可先把真实 productId 加入 TUYA_PRODUCT_IDS，靠 bridge 事件入库。`,
        );
      }
      throw new Error(`涂鸦 OpenAPI 失败 (${productId}): [${code}] ${msg}`);
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
      }))
      .filter((d) => d.deviceId && isAllowedProduct(d.productId, this.allowedProducts));

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
