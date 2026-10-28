import {
  AnalyticsService,
  pickLocationDateType,
} from './analytics.service';

describe('pickLocationDateType', () => {
  it('maps range length to date_type', () => {
    expect(pickLocationDateType('20260730', '20260730')).toBe('day');
    expect(pickLocationDateType('20260724', '20260730')).toBe('week');
    expect(pickLocationDateType('20260717', '20260730')).toBe('weeks');
    expect(pickLocationDateType('20260701', '20260730')).toBe('month');
  });
});

describe('AnalyticsService.getDashboard', () => {
  it('aggregates KPIs and caches', async () => {
    const tuya = {
      getAppDeviceStat: jest.fn().mockResolvedValue([
        {
          dt: '20260701',
          activationNum: 2,
          activationTotalNum: 100,
          activeNum: 10,
        },
        {
          dt: '20260702',
          activationNum: 3,
          activationTotalNum: 103,
          activeNum: 12,
        },
      ]),
      getAppUserRegisterStat: jest.fn().mockResolvedValue([
        { dt: '20260701', todayRegisterNum: 1, totalRegisterNum: 50 },
        { dt: '20260702', todayRegisterNum: 4, totalRegisterNum: 54 },
      ]),
      getAppDeviceControl: jest.fn().mockResolvedValue([
        { dt: '20260701', controlNum: 10, controlUserNum: 2 },
        { dt: '20260702', controlNum: 5, controlUserNum: 1 },
      ]),
      getLocationsActiveDatas: jest
        .fn()
        .mockResolvedValue([{ name: '广东', value: 10, percentage: '50%' }]),
    };
    const prisma = {} as any;

    const svc = new AnalyticsService(tuya as any, prisma);
    const first = await svc.getDashboard({
      startDay: '20260701',
      endDay: '20260702',
    });
    expect(first.kpis).toEqual({
      activationTotal: 103,
      activationNew: 5,
      activeLatest: 12,
      registerTotal: 54,
      registerNew: 5,
      controlTotal: 15,
      controlUsers: 3,
    });
    expect(first.fromCache).toBe(false);
    expect(first.locations.items).toHaveLength(1);

    const second = await svc.getDashboard({
      startDay: '20260701',
      endDay: '20260702',
    });
    expect(second.fromCache).toBe(true);
    expect(tuya.getAppDeviceStat).toHaveBeenCalledTimes(1);

    await svc.getDashboard({
      startDay: '20260701',
      endDay: '20260702',
      refresh: true,
    });
    expect(tuya.getAppDeviceStat).toHaveBeenCalledTimes(2);
  });

  it('falls back locations when productId denied', async () => {
    const tuya = {
      getAppDeviceStat: jest.fn().mockResolvedValue([]),
      getAppUserRegisterStat: jest.fn().mockResolvedValue([]),
      getAppDeviceControl: jest.fn().mockResolvedValue([]),
      getLocationsActiveDatas: jest
        .fn()
        .mockRejectedValueOnce(new Error('没有操作权限！'))
        .mockResolvedValueOnce([{ name: '河南', value: 3, percentage: '100%' }]),
    };
    const svc = new AnalyticsService(tuya as any, {} as any);
    const res = await svc.getDashboard({
      startDay: '20260701',
      endDay: '20260730',
      productId: 'uhmj5b0ba31zpme6',
    });
    expect(res.locations.items[0]?.name).toBe('河南');
    expect(res.warnings.some((w) => w.includes('回退'))).toBe(true);
    expect(tuya.getLocationsActiveDatas).toHaveBeenCalledTimes(2);
    expect(res.virtual).toBe(false);
    expect(res.dataMode).toBe('live');
  });

  it('serves virtual data when the trial quota is exhausted and does not retry inside the cooldown', async () => {
    const quotaError = new Error(
      'Tuya getAppDeviceStat failed: [28841004] IoT Core trial quota is exhausted',
    );
    const tuya = {
      getAppDeviceStat: jest.fn().mockRejectedValue(quotaError),
      getAppUserRegisterStat: jest.fn().mockRejectedValue(quotaError),
      getAppDeviceControl: jest.fn().mockRejectedValue(quotaError),
      getLocationsActiveDatas: jest.fn().mockRejectedValue(quotaError),
    };
    const svc = new AnalyticsService(tuya as any, {} as any);
    const query = {
      startDay: '20261001',
      endDay: '20261007',
      dataSource: 'live' as const,
    };

    const first = await svc.getDashboard(query);
    expect(first.virtual).toBe(true);
    expect(first.quotaExhausted).toBe(true);
    expect(first.virtualReason).toBe('quota-fallback');
    expect(first.dataMode).toBe('virtual');
    expect(first.kpis.activationTotal).toBeGreaterThan(10000);
    expect(first.series.device).toHaveLength(7);
    expect(first.series.register).toHaveLength(7);
    expect(first.locations.items.length).toBeGreaterThan(0);

    const second = await svc.getDashboard(query);
    expect(second.virtual).toBe(true);
    expect(second.kpis).toEqual(first.kpis);
    expect(tuya.getAppDeviceStat).toHaveBeenCalledTimes(1);

    const probed = await svc.getDashboard({ ...query, probe: true });
    expect(probed.quotaExhausted).toBe(true);
    expect(tuya.getAppDeviceStat).toHaveBeenCalledTimes(2);
  });

  it('does not mark service expiry 28841002 as quota exhaustion', async () => {
    const tuya = {
      getAppDeviceStat: jest
        .fn()
        .mockRejectedValue(
          new Error('Tuya getAppDeviceStat failed: [28841002] IoT Core service is expired'),
        ),
      getAppUserRegisterStat: jest.fn().mockResolvedValue([]),
      getAppDeviceControl: jest.fn().mockResolvedValue([]),
      getLocationsActiveDatas: jest.fn().mockResolvedValue([]),
    };
    const svc = new AnalyticsService(tuya as any, {} as any);
    const query = { startDay: '20261001', endDay: '20261002', dataSource: 'live' as const };
    await expect(svc.getDashboard(query)).rejects.toThrow(/28841002/);
    await expect(svc.getDashboard(query)).rejects.toThrow(/28841002/);
    expect(tuya.getAppDeviceStat).toHaveBeenCalledTimes(2);
  });

  it('returns the demo payload without calling Tuya when virtual mode is requested', async () => {
    const tuya = {
      getAppDeviceStat: jest.fn(),
      getAppUserRegisterStat: jest.fn(),
      getAppDeviceControl: jest.fn(),
      getLocationsActiveDatas: jest.fn(),
    };
    const svc = new AnalyticsService(tuya as any, {} as any);
    const dashboard = await svc.getDashboard({
      startDay: '20261001',
      endDay: '20261030',
      dataSource: 'virtual',
    });
    const devices = await svc.getDevicesUsage({
      startDay: '20261001',
      endDay: '20261030',
      dataSource: 'virtual',
    });
    const faults = await svc.getFaults({
      startDay: '20261001',
      endDay: '20261030',
      dataSource: 'virtual',
    });

    expect(tuya.getAppDeviceStat).not.toHaveBeenCalled();
    expect(dashboard.virtualReason).toBe('requested');
    expect(dashboard.series.device).toHaveLength(30);
    expect(devices.live.total).toBe(dashboard.kpis.activationTotal);
    expect(devices.virtual).toBe(true);
    expect(faults.kpis.inServiceDevices).toBe(devices.live.total);
    expect(faults.faultCodeHistogram.length).toBeGreaterThan(0);
    expect(faults.virtual).toBe(true);
  });
});

describe('AnalyticsService quota fallback for device usage', () => {
  it('marks the quota exhausted from the device-page probe and then skips Tuya', async () => {
    const tuya = {
      getAppDeviceStat: jest
        .fn()
        .mockRejectedValue(
          new Error('Tuya getAppDeviceStat failed: [28841004] trial quota is exhausted'),
        ),
    };
    const prisma = {
      device: { findMany: jest.fn() },
      dailyDeviceMetric: { findMany: jest.fn() },
    };
    const svc = new AnalyticsService(tuya as any, prisma as any);
    const query = {
      startDay: '20261001',
      endDay: '20261030',
      dataSource: 'live' as const,
    };

    const first = await svc.getDevicesUsage(query);
    expect(first.virtual).toBe(true);
    expect(first.quotaExhausted).toBe(true);
    expect(first.live.total).toBeGreaterThan(10000);
    expect(first.live.onlineRate).toBeGreaterThan(0.95);
    expect(prisma.device.findMany).not.toHaveBeenCalled();

    await svc.getDevicesUsage(query);
    expect(tuya.getAppDeviceStat).toHaveBeenCalledTimes(1);
  });
});
