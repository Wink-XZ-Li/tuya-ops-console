import { Injectable, Logger } from '@nestjs/common';
import { TuyaContext } from '@tuya/tuya-connector-nodejs';

export interface TuyaDeviceSummary {
  deviceId: string;
  productId: string;
  name: string;
  online?: boolean;
}

export interface TuyaDeviceDetail extends TuyaDeviceSummary {
  uuid?: string;
  category?: string;
}

export interface StandardFunction {
  code: string;
  name?: string;
  type?: string;
  values?: unknown;
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
    page: number,
  ): Promise<{ list: TuyaDeviceSummary[]; total: number }>;
  getDeviceUsers(deviceId: string): Promise<string[]>;
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
      name: String(result.name ?? ''),
      online: Boolean(result.online),
      uuid: result.uuid ? String(result.uuid) : undefined,
      category: result.category ? String(result.category) : undefined,
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
    page: number,
  ): Promise<{ list: TuyaDeviceSummary[]; total: number }> {
    if (!isAllowedProduct(productId, this.allowedProducts)) {
      return { list: [], total: 0 };
    }
    const pageSize = 20;
    const res = await this.context.request<{
      devices?: Array<Record<string, unknown>>;
      total?: number;
    }>({
      method: 'GET',
      path: '/v1.0/iot-03/devices',
      query: {
        product_id: productId,
        page_no: page,
        page_size: pageSize,
      },
    });
    if (!res.success) {
      const code = (res as { code?: number }).code;
      const msg = (res as { msg?: string }).msg ?? 'unknown';
      this.logger.warn(`listDevicesByProduct failed for ${productId}: code=${code} msg=${msg}`);
      throw new Error(`涂鸦 OpenAPI 失败 (${productId}): [${code}] ${msg}`);
    }
    const result = (res.result ?? {}) as Record<string, unknown>;
    const devices = (result.devices ?? result.list ?? []) as Array<Record<string, unknown>>;
    const list = devices
      .map((d) => ({
        deviceId: String(d.id ?? d.device_id ?? ''),
        productId: String(d.product_id ?? d.productId ?? productId),
        name: String(d.name ?? ''),
        online: d.online != null ? Boolean(d.online) : undefined,
      }))
      .filter((d) => d.deviceId && isAllowedProduct(d.productId, this.allowedProducts));
    return { list, total: Number(result.total ?? list.length) };
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
}
