import { TuyaMockClient } from '../tuya/tuya.mock';
import * as virtualAnalytics from '../demo/virtual-analytics';
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
    expect(res.dataMode).toBe('live');
  });

  it('does not replace a live OpenAPI failure with virtual series', async () => {
    const prevProfile = process.env.APP_PROFILE;
    const prevAnalytics = process.env.DEMO_ANALYTICS;
    process.env.APP_PROFILE = 'production';
    process.env.DEMO_ANALYTICS = 'virtual';
    const virtual = jest.spyOn(virtualAnalytics, 'virtualAnalyticsClient');
    const tuya = {
      getAppDeviceStat: jest.fn().mockRejectedValue(new Error('quota 28841002')),
      getAppUserRegisterStat: jest.fn().mockResolvedValue([]),
      getAppDeviceControl: jest.fn().mockResolvedValue([]),
      getLocationsActiveDatas: jest.fn().mockResolvedValue([]),
    };
    const svc = new AnalyticsService(tuya as any, {} as any);
    try {
      await expect(
        svc.getDashboard({
          startDay: '20260701',
          endDay: '20260702',
          dataMode: 'virtual',
        }),
      ).rejects.toThrow(/28841002/);
      expect(virtual).not.toHaveBeenCalled();
      expect(tuya.getAppDeviceStat).toHaveBeenCalled();
    } finally {
      virtual.mockRestore();
      if (prevProfile === undefined) delete process.env.APP_PROFILE;
      else process.env.APP_PROFILE = prevProfile;
      if (prevAnalytics === undefined) delete process.env.DEMO_ANALYTICS;
      else process.env.DEMO_ANALYTICS = prevAnalytics;
    }
  });

  it('keeps mock-client charts empty until virtual is requested explicitly', async () => {
    const prevProfile = process.env.APP_PROFILE;
    const prevAnalytics = process.env.DEMO_ANALYTICS;
    process.env.APP_PROFILE = 'demo';
    delete process.env.DEMO_ANALYTICS;
    const mock = new TuyaMockClient();
    const spy = jest.spyOn(mock, 'getAppDeviceStat');
    const svc = new AnalyticsService(mock, {} as any);
    try {
      const refused = await svc.getDashboard({ startDay: '20260701', endDay: '20260703' });
      expect(refused.dataMode).toBe('live');
      expect(refused.series.device).toEqual([]);
      expect(refused.warnings.join('\n')).toContain('X-Demo-Analytics');
      expect(spy).not.toHaveBeenCalled();

      const virtual = await svc.getDashboard({
        startDay: '20260701',
        endDay: '20260703',
        dataMode: 'virtual',
      });
      expect(virtual.dataMode).toBe('virtual');
      expect(virtual.series.device).toHaveLength(3);
      expect(virtual.note).toContain('显式演示分析');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      if (prevProfile === undefined) delete process.env.APP_PROFILE;
      else process.env.APP_PROFILE = prevProfile;
      if (prevAnalytics === undefined) delete process.env.DEMO_ANALYTICS;
      else process.env.DEMO_ANALYTICS = prevAnalytics;
    }
  });

  it('ignores a virtual request in production and keeps the live payload', async () => {
    const prevProfile = process.env.APP_PROFILE;
    process.env.APP_PROFILE = 'production';
    const tuya = {
      getAppDeviceStat: jest.fn().mockResolvedValue([
        { dt: '20260701', activationNum: 2, activationTotalNum: 100, activeNum: 10 },
      ]),
      getAppUserRegisterStat: jest.fn().mockResolvedValue([
        { dt: '20260701', todayRegisterNum: 1, totalRegisterNum: 50 },
      ]),
      getAppDeviceControl: jest.fn().mockResolvedValue([]),
      getLocationsActiveDatas: jest.fn().mockResolvedValue([]),
    };
    const svc = new AnalyticsService(tuya as any, {} as any);
    try {
      const res = await svc.getDashboard({
        startDay: '20260701',
        endDay: '20260701',
        dataMode: 'virtual',
      });
      expect(res.dataMode).toBe('live');
      expect(res.kpis.activationTotal).toBe(100);
      expect(res.warnings.join('\n')).toContain('APP_PROFILE=production');
    } finally {
      if (prevProfile === undefined) delete process.env.APP_PROFILE;
      else process.env.APP_PROFILE = prevProfile;
    }
  });
});
