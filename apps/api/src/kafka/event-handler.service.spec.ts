import { Logger } from '@nestjs/common';
import { EventHandlerService } from './event-handler.service';

describe('EventHandlerService', () => {
  it('stores events for any product id', async () => {
    const prisma = {
      device: {
        upsert: jest.fn().mockResolvedValue({ id: 'row-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
      },
      deviceEvent: { create: jest.fn() },
      alert: { updateMany: jest.fn() },
    } as any;
    const handler = new EventHandlerService(prisma);
    await handler.handle({
      bizCode: 'deviceOnline',
      ts: Date.now(),
      deviceId: 'd1',
      productId: 'not-on-old-list',
      payload: {},
    });
    expect(prisma.device.upsert).toHaveBeenCalled();
    expect(prisma.deviceEvent.create).toHaveBeenCalled();
  });

  it('ignores events without a product id', async () => {
    const prisma = {
      device: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn() },
      deviceEvent: { create: jest.fn() },
    } as any;
    const handler = new EventHandlerService(prisma);
    await handler.handle({
      bizCode: 'deviceOnline',
      ts: Date.now(),
      deviceId: 'd1',
      payload: {},
    });
    expect(prisma.device.upsert).not.toHaveBeenCalled();
  });

  it('upserts the 51st device when DEVICE_SOFT_CAP is 3000', async () => {
    const prev = process.env.DEVICE_SOFT_CAP;
    process.env.DEVICE_SOFT_CAP = '3000';
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(50),
        upsert: jest.fn().mockResolvedValue({ id: 'row-51' }),
        update: jest.fn(),
      },
      deviceEvent: { create: jest.fn() },
      alert: { updateMany: jest.fn() },
    } as any;
    const handler = new EventHandlerService(prisma);
    try {
      await handler.handle({
        bizCode: 'deviceOnline',
        ts: Date.now(),
        deviceId: 'd-51',
        productId: 'uhmj5b0ba31zpme6',
        payload: {},
      });
      expect(prisma.device.upsert).toHaveBeenCalled();
      expect(prisma.deviceEvent.create).toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.DEVICE_SOFT_CAP;
      else process.env.DEVICE_SOFT_CAP = prev;
    }
  });

  it('still accepts a new device at the soft cap and logs device_soft_cap', async () => {
    const prev = process.env.DEVICE_SOFT_CAP;
    process.env.DEVICE_SOFT_CAP = '50';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(50),
        upsert: jest.fn().mockResolvedValue({ id: 'row-over' }),
        update: jest.fn(),
      },
      deviceEvent: { create: jest.fn() },
      alert: { updateMany: jest.fn() },
    } as any;
    const handler = new EventHandlerService(prisma);
    try {
      await handler.handle({
        bizCode: 'deviceOnline',
        ts: Date.now(),
        deviceId: 'd-over',
        productId: 'uhmj5b0ba31zpme6',
        payload: {},
      });
      expect(prisma.device.upsert).toHaveBeenCalled();
      expect(prisma.deviceEvent.create).toHaveBeenCalled();
      expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
        'device_soft_cap',
      );
      expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('action=accept');
    } finally {
      warn.mockRestore();
      if (prev === undefined) delete process.env.DEVICE_SOFT_CAP;
      else process.env.DEVICE_SOFT_CAP = prev;
    }
  });

  it('does not consult the soft cap for a device that already exists', async () => {
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue({ id: 'row-1' }),
        count: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'row-1' }),
        update: jest.fn(),
      },
      deviceEvent: { create: jest.fn() },
      alert: { updateMany: jest.fn() },
    } as any;
    const handler = new EventHandlerService(prisma);
    await handler.handle({
      bizCode: 'deviceOnline',
      ts: Date.now(),
      deviceId: 'd-existing',
      productId: 'uhmj5b0ba31zpme6',
      payload: {},
    });
    expect(prisma.device.count).not.toHaveBeenCalled();
    expect(prisma.device.upsert).toHaveBeenCalled();
  });
});

describe('EventHandlerService fault alerts', () => {
  type AlertRow = {
    id: string;
    deviceId: string;
    status: string;
    source: string;
    category?: string;
    faultCode?: string;
    activeKey: string | null;
    occurrenceCount: number;
    closedReason?: string | null;
    fingerprint?: string;
  };

  function harness() {
    const devices = new Map<
      string,
      { id: string; deviceId: string; productId: string; statusJson: Record<string, unknown> | null }
    >();
    const alerts = new Map<string, AlertRow>();
    let seq = 0;

    const prisma = {
      device: {
        findUnique: jest.fn(async ({ where }: { where: { deviceId?: string; id?: string } }) => {
          if (where.deviceId) {
            const row = [...devices.values()].find((d) => d.deviceId === where.deviceId);
            return row ? { id: row.id, productId: row.productId } : null;
          }
          const row = where.id ? devices.get(where.id) : undefined;
          return row ? { statusJson: row.statusJson, productId: row.productId } : null;
        }),
        count: jest.fn(async () => devices.size),
        upsert: jest.fn(async ({ where, create }: any) => {
          const existing = [...devices.values()].find((d) => d.deviceId === where.deviceId);
          if (existing) return { id: existing.id };
          const id = `row-${devices.size + 1}`;
          devices.set(id, {
            id,
            deviceId: create.deviceId,
            productId: create.productId,
            statusJson: null,
          });
          return { id };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = devices.get(where.id);
          if (row && data.statusJson) row.statusJson = data.statusJson;
          return row;
        }),
      },
      deviceEvent: { create: jest.fn(async () => ({})) },
      alert: {
        findUnique: jest.fn(async ({ where }: { where: { activeKey?: string } }) => {
          if (!where.activeKey) return null;
          return [...alerts.values()].find((a) => a.activeKey === where.activeKey) ?? null;
        }),
        findMany: jest.fn(async () =>
          [...alerts.values()].filter((a) => a.status !== 'closed' && a.category === 'fault'),
        ),
        create: jest.fn(async ({ data }: { data: Omit<AlertRow, 'id' | 'status'> }) => {
          seq += 1;
          const row: AlertRow = {
            ...data,
            id: `a${seq}`,
            status: 'open',
          };
          alerts.set(row.id, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = where.id
            ? alerts.get(where.id)
            : [...alerts.values()].find((a) => a.activeKey === where.activeKey);
          if (!row) throw new Error('alert missing');
          if (data.occurrenceCount?.increment) {
            row.occurrenceCount += data.occurrenceCount.increment;
          }
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const row of alerts.values()) {
            if (row.status === 'closed') continue;
            if (where.deviceId && row.deviceId !== where.deviceId) continue;
            if (where.activeKey && row.activeKey !== where.activeKey) continue;
            if (where.OR) {
              const matched = where.OR.some((clause: Record<string, unknown>) =>
                Object.entries(clause).every(([key, value]) => (row as any)[key] === value),
              );
              if (!matched) continue;
            }
            row.status = data.status ?? row.status;
            if ('activeKey' in data) row.activeKey = data.activeKey;
            if (data.closedReason) row.closedReason = data.closedReason;
            count += 1;
          }
          return { count };
        }),
      },
      endUser: { upsert: jest.fn(), findUnique: jest.fn() },
      deviceBinding: { upsert: jest.fn(), deleteMany: jest.fn() },
    };

    return { prisma, alerts, devices };
  }

  async function report(
    prisma: any,
    productId: string,
    fault: number,
    deviceId = 'd1',
  ) {
    const handler = new EventHandlerService(prisma);
    await handler.handle({
      bizCode: 'devicePropertyMessage',
      ts: Date.now(),
      deviceId,
      productId,
      payload: { status: [{ code: 'fault', value: fault }] },
    });
  }

  function openAlerts(alerts: Map<string, AlertRow>) {
    return [...alerts.values()].filter((a) => a.status !== 'closed');
  }

  it('opens one E3 alert for water-heater bit1 and counts a repeat', async () => {
    const { prisma, alerts } = harness();
    await report(prisma, 'nohrp3vbmef7vxvx', 2);
    await report(prisma, 'nohrp3vbmef7vxvx', 2);

    const open = openAlerts(alerts);
    expect(open).toHaveLength(1);
    expect(open[0].faultCode).toBe('E3');
    expect(open[0].faultCode).not.toBe('E2');
    expect(open[0].occurrenceCount).toBe(2);
    expect(open[0].activeKey).toBe(`${open[0].deviceId}:fault:fault:E3`);
    expect(open[0].source).toBe('device_fault');
  });

  it('opens two boiler alerts and clears only the bit that returns to 0', async () => {
    const { prisma, alerts } = harness();
    await report(prisma, '7sylzgrdnnq2w5mo', 3);
    expect(openAlerts(alerts).map((a) => a.faultCode).sort()).toEqual(['E0', 'E1']);

    await report(prisma, '7sylzgrdnnq2w5mo', 1);
    const open = openAlerts(alerts);
    expect(open.map((a) => a.faultCode)).toEqual(['E0']);
    expect(open[0].occurrenceCount).toBe(2);
    const cleared = [...alerts.values()].find((a) => a.faultCode === 'E1');
    expect(cleared?.status).toBe('closed');
    expect(cleared?.activeKey).toBeNull();
    expect(cleared?.closedReason).toBe('auto_clear');
  });

  it('opens E5 for T6-WX2 fault=32, keeps a second code, then clears both', async () => {
    const { prisma, alerts } = harness();
    await report(prisma, '90wi2aimyqstn9qc', 32);
    expect(openAlerts(alerts).map((a) => a.faultCode)).toEqual(['E5']);
    expect(openAlerts(alerts)[0].activeKey).toBe(
      `${openAlerts(alerts)[0].deviceId}:fault:fault:E5`,
    );

    await report(prisma, '90wi2aimyqstn9qc', 33);
    expect(openAlerts(alerts).map((a) => a.faultCode).sort()).toEqual(['E0', 'E5']);

    await report(prisma, '90wi2aimyqstn9qc', 0);
    expect(openAlerts(alerts)).toEqual([]);
    expect([...alerts.values()].every((a) => a.status === 'closed' && a.activeKey === null)).toBe(
      true,
    );
    expect([...alerts.values()].map((a) => a.closedReason)).toEqual(['auto_clear', 'auto_clear']);
  });

  it('clears the alert when the bitmap returns to 0', async () => {
    const { prisma, alerts } = harness();
    await report(prisma, 'uhmj5b0ba31zpme6', 1);
    await report(prisma, 'uhmj5b0ba31zpme6', 0);
    const row = [...alerts.values()][0];
    expect(row.status).toBe('closed');
    expect(row.activeKey).toBeNull();
    expect(row.closedReason).toBe('auto_clear');
    expect(row.faultCode).toBe('E1');
  });

  it('closes offline alerts and nulls activeKey when the device comes online', async () => {
    const { prisma, alerts, devices } = harness();
    devices.set('row-1', {
      id: 'row-1',
      deviceId: 'd1',
      productId: 'qxjzruuqz40bty7e',
      statusJson: null,
    });
    alerts.set('off-1', {
      id: 'off-1',
      deviceId: 'row-1',
      status: 'open',
      source: 'local_offline',
      category: 'connectivity',
      faultCode: 'offline',
      activeKey: 'row-1:connectivity:offline',
      occurrenceCount: 1,
    });

    const handler = new EventHandlerService(prisma as any);
    await handler.handle({
      bizCode: 'deviceOnline',
      ts: Date.now(),
      deviceId: 'd1',
      productId: 'qxjzruuqz40bty7e',
      payload: {},
    });

    const row = alerts.get('off-1');
    expect(row?.status).toBe('closed');
    expect(row?.activeKey).toBeNull();
    expect(row?.closedReason).toBe('online');
  });
});
