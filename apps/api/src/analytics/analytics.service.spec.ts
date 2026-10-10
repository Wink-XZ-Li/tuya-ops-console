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
  });
});
