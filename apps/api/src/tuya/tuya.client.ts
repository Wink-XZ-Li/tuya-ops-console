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
  mobile?: string;
  email?: string;
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
  getUserProfile(tuyaUid: string): Promise<TuyaUserProfile | null>;
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
    const res = await this.context.request<{ uid_list?: string[] }>({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/users`,
    });
    if (!res.success) {
      this.logger.warn(`getDeviceUsers failed for ${deviceId}`);
      return [];
    }
    return res.result?.uid_list ?? [];
  }

  async getUserProfile(tuyaUid: string): Promise<TuyaUserProfile | null> {
    const paths = [`/v1.0/users/${tuyaUid}`, `/v1.0/users/${tuyaUid}/infos`];
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
        return {
          tuyaUid,
          username: String(
            result.nick_name ?? result.nickname ?? result.username ?? result.name ?? '',
          ) || undefined,
          mobile: String(result.mobile ?? result.phone ?? '') || undefined,
          email: String(result.email ?? '') || undefined,
          raw: result,
        };
      } catch (err) {
        this.logger.debug(`getUserProfile ${path} failed for ${tuyaUid}: ${String(err)}`);
      }
    }
    return null;
  }
}
