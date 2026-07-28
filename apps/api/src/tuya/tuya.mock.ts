import { Injectable, Logger } from '@nestjs/common';
import {
  isAllowedProduct,
  parseProductIds,
  StandardFunction,
  TuyaClient,
  TuyaDeviceDetail,
  TuyaDeviceSummary,
  TuyaUserProfile,
} from './tuya.client';

export { isAllowedProduct };

export const MOCK_DEVICES: TuyaDeviceSummary[] = [
  { deviceId: 'demo-001', productId: 'uhmj5b0ba31zpme6', name: 'Demo线控器A', online: true },
  { deviceId: 'demo-002', productId: 'uhmj5b0ba31zpme6', name: 'Demo线控器A-2', online: false },
  { deviceId: 'demo-003', productId: 'qxjzruuqz40bty7e', name: 'Demo设备B', online: true },
  { deviceId: 'demo-004', productId: 'qxjzruuqz40bty7e', name: 'Demo设备B-2', online: true },
  { deviceId: 'demo-005', productId: 'qxjzruuqz40bty7e', name: 'Demo设备B-3', online: false },
  { deviceId: 'demo-006', productId: 'nohrp3vbmef7vxvx', name: 'Demo设备C', online: true },
  { deviceId: 'demo-007', productId: 'nohrp3vbmef7vxvx', name: 'Demo设备C-2', online: false },
];

const MOCK_STATUS: Record<string, Array<{ code: string; value: unknown }>> = {
  'demo-001': [{ code: 'switch', value: true }],
  'demo-002': [{ code: 'switch', value: false }],
  'demo-003': [{ code: 'temp_set', value: 24 }],
  'demo-004': [{ code: 'temp_set', value: 22 }],
  'demo-005': [{ code: 'mode', value: 'auto' }],
  'demo-006': [{ code: 'switch', value: true }],
  'demo-007': [{ code: 'switch', value: false }],
};

const MOCK_FUNCTIONS: StandardFunction[] = [
  { code: 'switch', name: '开关', type: 'Boolean' },
  { code: 'temp_set', name: '温度设置', type: 'Integer' },
  { code: 'mode', name: '模式', type: 'Enum' },
];

const MOCK_DEVICE_USERS: Record<string, string[]> = {
  'demo-001': ['uid-demo-001', 'uid-demo-002'],
  'demo-003': ['uid-demo-001'],
  'demo-006': ['uid-demo-003'],
};

@Injectable()
export class TuyaMockClient implements TuyaClient {
  private readonly logger = new Logger(TuyaMockClient.name);
  private readonly allowedProducts: Set<string>;

  constructor(allowedProducts: Set<string> = parseProductIds()) {
    this.allowedProducts = allowedProducts;
  }

  async getDevice(deviceId: string): Promise<TuyaDeviceDetail> {
    const device = MOCK_DEVICES.find((d) => d.deviceId === deviceId);
    if (!device || !isAllowedProduct(device.productId, this.allowedProducts)) {
      throw new Error(`Device ${deviceId} not found`);
    }
    return { ...device };
  }

  async getDeviceStatus(deviceId: string): Promise<Array<{ code: string; value: unknown }>> {
    return MOCK_STATUS[deviceId] ?? [{ code: 'switch', value: false }];
  }

  async getStandardFunctions(_deviceId: string): Promise<StandardFunction[]> {
    return MOCK_FUNCTIONS;
  }

  async sendStandardCommand(
    deviceId: string,
    commands: Array<{ code: string; value: unknown }>,
  ): Promise<unknown> {
    this.logger.log(`[mock] sendStandardCommand ${deviceId}: ${JSON.stringify(commands)}`);
    return { success: true, mock: true };
  }

  async listDevicesByProduct(
    productId: string,
    pageOrCursor: number | { lastId?: string; pageSize?: number } = 1,
  ): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }> {
    if (!isAllowedProduct(productId, this.allowedProducts)) {
      return { list: [], total: 0 };
    }
    const filtered = MOCK_DEVICES.filter((d) => d.productId === productId);
    const pageSize =
      typeof pageOrCursor === 'object' ? (pageOrCursor.pageSize ?? 20) : 20;
    const page = typeof pageOrCursor === 'number' ? pageOrCursor : 1;
    const lastId = typeof pageOrCursor === 'object' ? pageOrCursor.lastId : undefined;
    let start = (page - 1) * pageSize;
    if (lastId) {
      const idx = filtered.findIndex((d) => d.deviceId === lastId);
      start = idx >= 0 ? idx + 1 : filtered.length;
    }
    const list = filtered.slice(start, start + pageSize);
    const nextLastId = list.length > 0 ? list[list.length - 1].deviceId : undefined;
    return { list, total: filtered.length, nextLastId };
  }

  async getDeviceUsers(deviceId: string): Promise<string[]> {
    return MOCK_DEVICE_USERS[deviceId] ?? [];
  }

  async getUserProfile(tuyaUid: string): Promise<TuyaUserProfile | null> {
    return {
      tuyaUid,
      username: `user-${tuyaUid.slice(-4)}`,
      mobile: tuyaUid.includes('001') ? '13800000001' : undefined,
      email: undefined,
      raw: { mock: true },
    };
  }
}
