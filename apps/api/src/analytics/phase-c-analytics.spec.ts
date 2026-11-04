import { readFileSync } from 'fs';
import { join } from 'path';
import { AnalyticsService } from './analytics.service';
import { RollupJob } from '../jobs/rollup.job';

describe('AnalyticsService.getFaults', () => {
  it('reads DailyFaultStat and does not take 5000 alerts', async () => {
    const prisma = {
      device: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      alert: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn(),
      },
      dailyFaultStat: {
        findMany: jest.fn().mockResolvedValue([
          {
            day: '20261101',
            productId: '',
            faultCode: 'E1',
            newCount: 2,
            closedCount: 2,
            openCount: 1,
            mttrMinutesAvg: 10,
          },
          {
            day: '20261101',
            productId: '',
            faultCode: 'E2',
            newCount: 1,
            closedCount: 1,
            openCount: 0,
            mttrMinutesAvg: 40,
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([
          { productId: 'p1', faultCode: 'E1', _sum: { newCount: 2, openCount: 1 } },
        ]),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ n: 4 }]),
    };
    const tuya = {
      getDevicesDatasSurvey: jest.fn().mockResolvedValue(null),
      getDevicesLiveDatasSurvey: jest.fn().mockResolvedValue(null),
    };
    const svc = new AnalyticsService(tuya as any, prisma as any);
    const result = await svc.getFaults({ startDay: '20261101', endDay: '20261102' });

    expect(prisma.alert.findMany).not.toHaveBeenCalled();
    expect(prisma.dailyFaultStat.findMany).toHaveBeenCalled();
    expect(result.kpis.avgDurationMinutes).toBe(20);
    expect(result.kpis.avgMttrMinutes).toBe(20);
    expect(result.kpis.qualityFaultDevices).toBe(4);
    expect(result.kpis.pendingDeviceCount).toBe(4);
    expect(result.dailyTrend).toEqual([
      { day: '20261101', newCount: 3, closedCount: 3, openCount: 1 },
    ]);
    const src = readFileSync(join(__dirname, 'analytics.service.ts'), 'utf8');
    expect(src).not.toMatch(/take:\s*5000/);
    expect(src).not.toMatch(/alert\.findMany/);
  });
});

describe('RollupJob SQL', () => {
  it('groups devices and faults in SQL instead of loading every alert', async () => {
    const sql: string[] = [];
    const prisma = {
      $queryRawUnsafe: jest.fn(async (text: string) => {
        sql.push(text);
        if (text.includes('onlineStatus')) {
          return [{ productId: 'p1', onlineCount: 2, offlineCount: 1, faultCount: 1, totalDevices: 3 }];
        }
        if (text.includes('AS newCount')) {
          return [{ productId: 'p1', faultCode: 'E1', newCount: 2 }];
        }
        if (text.includes('closedCount')) {
          return [{ productId: 'p1', faultCode: 'E1', closedCount: 1, mttrSum: 30 }];
        }
        return [];
      }),
      device: { findMany: jest.fn().mockResolvedValue([]) },
      dailyDeviceMetric: { upsert: jest.fn().mockResolvedValue({}) },
      dailyFaultStat: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const job = new RollupJob(prisma as any);
    await job.rollupDay(new Date(2026, 10, 4));

    expect(sql.some((text) => text.includes('GROUP BY productId'))).toBe(true);
    expect(sql.some((text) => text.includes('GROUP BY d.productId'))).toBe(true);
    expect(sql.some((text) => text.includes("category <> 'connectivity'"))).toBe(true);
    expect(prisma.device.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 400 }));
    const faultCodes = prisma.dailyFaultStat.upsert.mock.calls.map(
      (call) => call[0].create.faultCode as string,
    );
    expect(faultCodes).toEqual(expect.arrayContaining(['E1']));
    expect(prisma.dailyFaultStat.upsert.mock.calls.some((call) => call[0].create.productId === '')).toBe(
      true,
    );
    expect(prisma.dailyDeviceMetric.upsert).toHaveBeenCalled();
  });
});
