import { Injectable, Logger } from '@nestjs/common';
import {
  isAllowedProduct,
  ListAppUsersPage,
  StandardFunction,
  TuyaClient,
  TuyaControlStatPoint,
  TuyaDeviceDetail,
  TuyaDeviceStatPoint,
  TuyaDeviceSummary,
  TuyaDevicesDatasSurvey,
  TuyaDevicesLiveDatasSurvey,
  TuyaDeviceReportLogsPage,
  TuyaFirmwareUpgradeInfo,
  TuyaGeocodeResult,
  TuyaLocationActivePoint,
  TuyaLocationDateType,
  TuyaLocationRegionType,
  TuyaRegisterStatPoint,
  TuyaUserDevice,
  TuyaUserHome,
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

  async getDevice(deviceId: string): Promise<TuyaDeviceDetail> {
    const device = MOCK_DEVICES.find((d) => d.deviceId === deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }
    return { ...device };
  }

  async getDeviceSignal(deviceId: string): Promise<string | null> {
    if (deviceId === 'demo-001') return '-40 dBm · Excellent';
    return null;
  }

  async getDeviceStatus(deviceId: string): Promise<Array<{ code: string; value: unknown }>> {
    return MOCK_STATUS[deviceId] ?? [{ code: 'switch', value: false }];
  }

  async getStandardFunctions(_deviceId: string): Promise<StandardFunction[]> {
    return MOCK_FUNCTIONS;
  }

  async getThingProperties(_deviceId: string): Promise<StandardFunction[]> {
    return [];
  }

  async sendStandardCommand(
    deviceId: string,
    commands: Array<{ code: string; value: unknown }>,
  ): Promise<unknown> {
    this.logger.log(`[mock] sendStandardCommand ${deviceId}: ${JSON.stringify(commands)}`);
    return { success: true, mock: true };
  }

  async listDevices(
    pageOrCursor: { lastId?: string; pageSize?: number } = {},
  ): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }> {
    const pageSize = pageOrCursor.pageSize ?? 20;
    let start = 0;
    if (pageOrCursor.lastId) {
      const idx = MOCK_DEVICES.findIndex((d) => d.deviceId === pageOrCursor.lastId);
      start = idx >= 0 ? idx + 1 : MOCK_DEVICES.length;
    }
    const list = MOCK_DEVICES.slice(start, start + pageSize);
    const nextLastId = list.length > 0 ? list[list.length - 1].deviceId : undefined;
    return { list, total: MOCK_DEVICES.length, nextLastId };
  }

  async listDevicesByProduct(
    productId: string,
    pageOrCursor: number | { lastId?: string; pageSize?: number } = 1,
  ): Promise<{ list: TuyaDeviceSummary[]; total: number; nextLastId?: string }> {
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
    return (await this.getDeviceUserProfiles(deviceId)).map((p) => p.tuyaUid);
  }

  async getDeviceUserProfiles(deviceId: string): Promise<TuyaUserProfile[]> {
    const uids = MOCK_DEVICE_USERS[deviceId] ?? [];
    return Promise.all(uids.map(async (uid) => (await this.getUserProfile(uid))!));
  }

  async getUserProfile(tuyaUid: string): Promise<TuyaUserProfile | null> {
    return {
      tuyaUid,
      username: `user-${tuyaUid.slice(-4)}`,
      nickName: `昵称-${tuyaUid.slice(-4)}`,
      mobile: tuyaUid.includes('001') ? '13800000001' : undefined,
      email: undefined,
      countryCode: '86',
      timeZoneId: 'Asia/Shanghai',
      tempUnit: 1,
      avatar: undefined,
      cloudCreatedAt: new Date('2024-01-01T00:00:00Z'),
      cloudUpdatedAt: new Date('2026-01-01T00:00:00Z'),
      userProperties: [
        { code: 'dataAuthorization', value: '1' },
        { code: 'marketingPush', value: '0' },
      ],
      raw: { mock: true },
    };
  }

  async listAppUsers(params: {
    schema: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<ListAppUsersPage> {
    if (!params.schema.trim()) {
      throw new Error('listAppUsers requires schema (TUYA_APP_SCHEMA)');
    }
    const pageNo = params.pageNo ?? 1;
    if (pageNo > 1) {
      return { list: [], hasMore: false, total: 3 };
    }
    const list: TuyaUserProfile[] = [
      {
        tuyaUid: 'ay-mock-user-001',
        username: 'mock-user-001',
        nickName: 'Mock一号',
        mobile: '13800000001',
        raw: { mock: true },
      },
      {
        tuyaUid: 'ay-mock-user-002',
        username: 'mock-user-002',
        nickName: 'Mock二号',
        email: 'mock2@example.com',
        raw: { mock: true },
      },
      {
        tuyaUid: 'ay-mock-user-003',
        username: 'mock-user-003',
        nickName: 'Mock三号',
        raw: { mock: true },
      },
    ];
    return { list, hasMore: false, total: list.length };
  }

  async listUserHomes(tuyaUid: string): Promise<TuyaUserHome[]> {
    return [
      {
        homeId: `home-${tuyaUid.slice(-4)}`,
        name: '我的家',
        role: 'OWNER',
        lon: 120.06,
        lat: 30.3,
        geoName: '杭州市（mock）',
        raw: { mock: true },
      },
    ];
  }

  async listUserDevices(
    tuyaUid: string,
    opts?: { from?: 'home' | 'sharing' },
  ): Promise<TuyaUserDevice[]> {
    const bound = Object.entries(MOCK_DEVICE_USERS)
      .filter(([, uids]) => uids.includes(tuyaUid) || tuyaUid.startsWith('ay-mock'))
      .map(([deviceId]) => deviceId);
    const ids =
      bound.length > 0
        ? bound
        : MOCK_DEVICES.slice(0, 2).map((d) => d.deviceId);

    const out: TuyaUserDevice[] = [];
    for (const deviceId of ids) {
      const d = MOCK_DEVICES.find((x) => x.deviceId === deviceId);
      if (!d) continue;
      const from: TuyaUserDevice['from'] =
        opts?.from ?? (deviceId.endsWith('2') ? 'sharing' : 'home');
      if (opts?.from && opts.from !== from && !tuyaUid.startsWith('ay-mock')) {
        continue;
      }
      out.push({
        deviceId: d.deviceId,
        name: d.name,
        productId: d.productId,
        online: d.online,
        from: opts?.from ?? from,
        status: MOCK_STATUS[d.deviceId],
        raw: { mock: true },
      });
    }
    return out;
  }

  async getAppDeviceStat(params: {
    startDay: string;
    endDay: string;
    productId?: string;
  }): Promise<TuyaDeviceStatPoint[]> {
    void params.productId;
    return mockDaySeries(params.startDay, params.endDay).map((dt, i) => ({
      dt,
      activationNum: 2 + (i % 4),
      activationTotalNum: 1000 + i * 3,
      activeNum: 40 + (i % 10),
    }));
  }

  async getAppDeviceControl(params: {
    startDay: string;
    endDay: string;
    productId?: string;
  }): Promise<TuyaControlStatPoint[]> {
    void params.productId;
    return mockDaySeries(params.startDay, params.endDay).map((dt, i) => ({
      dt,
      controlNum: 80 + i * 3,
      controlUserNum: 20 + (i % 8),
    }));
  }

  async getAppUserRegisterStat(params: {
    startDay: string;
    endDay: string;
  }): Promise<TuyaRegisterStatPoint[]> {
    return mockDaySeries(params.startDay, params.endDay).map((dt, i) => ({
      dt,
      todayRegisterNum: 1 + (i % 5),
      totalRegisterNum: 700 + i,
    }));
  }

  async getLocationsActiveDatas(params: {
    dateType: TuyaLocationDateType;
    type?: TuyaLocationRegionType;
    limit?: number;
    productId?: string;
  }): Promise<TuyaLocationActivePoint[]> {
    void params.dateType;
    void params.type;
    void params.productId;
    const all: TuyaLocationActivePoint[] = [
      { name: '广东', value: 340, percentage: '33.14%' },
      { name: '河南', value: 175, percentage: '17.06%' },
      { name: '北京', value: 85, percentage: '8.28%' },
      { name: '江苏', value: 42, percentage: '4.10%' },
      { name: '其他', value: 384, percentage: '37.42%' },
    ];
    return all.slice(0, params.limit ?? 20);
  }

  async getDevicesDatasSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesDatasSurvey> {
    const list = params?.productId
      ? MOCK_DEVICES.filter((d) => d.productId === params.productId)
      : MOCK_DEVICES;
    const online = list.filter((d) => d.online).length;
    const offline = list.length - online;
    const fault = Math.max(1, Math.floor(list.length / 4));
    return {
      deviceTotal: list.length,
      deviceOnline: online,
      deviceOffline: offline,
      deviceActive: Math.max(online - 1, 0),
      deviceFault: fault,
      raw: { mock: true, productId: params?.productId ?? null },
    };
  }

  async getDevicesSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesDatasSurvey> {
    return this.getDevicesDatasSurvey(params);
  }

  async getDevicesLiveDatasSurvey(params?: {
    productId?: string;
  }): Promise<TuyaDevicesLiveDatasSurvey> {
    const survey = await this.getDevicesDatasSurvey(params);
    return {
      deviceOnline: survey.deviceOnline,
      deviceOffline: survey.deviceOffline,
      deviceActive: survey.deviceActive,
      deviceFault: survey.deviceFault,
      raw: { mock: true, live: true, productId: params?.productId ?? null },
    };
  }

  async reverseGeocode(params: {
    latitude: string;
    longitude: string;
  }): Promise<TuyaGeocodeResult> {
    return {
      latitude: params.latitude,
      longitude: params.longitude,
      address: `模拟地址(${params.latitude},${params.longitude})`,
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
    const codes = params.codes.split(',').map((c) => c.trim()).filter(Boolean);
    const size = params.size ?? 20;
    const list = Array.from({ length: Math.min(size, 5) }, (_, i) => ({
      code: codes[i % Math.max(codes.length, 1)] || 'switch',
      value: i % 2 === 0,
      eventTime: params.endTime - i * 3600_000,
    }));
    return {
      deviceId: params.deviceId,
      hasMore: false,
      total: list.length,
      list,
    };
  }

  async getDeviceUpgradeInfos(deviceId: string): Promise<TuyaFirmwareUpgradeInfo[]> {
    return [
      {
        type: '0',
        currentVersion: '1.0.0',
        version: '1.0.1',
        upgradeStatus: 0,
        desc: `mock firmware for ${deviceId}`,
      },
    ];
  }
}

function mockDaySeries(startDay: string, endDay: string): string[] {
  const start = parseYmd(startDay);
  const end = parseYmd(endDay);
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(formatYmd(new Date(t)));
  }
  return out.length ? out : [startDay];
}

function parseYmd(ymd: string): Date {
  const s = ymd.replace(/-/g, '');
  return new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
  );
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
