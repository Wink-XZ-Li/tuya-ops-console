import { Logger } from '@nestjs/common';
import * as syncPacing from './sync-pacing';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  function basePrisma(overrides: Record<string, unknown> = {}) {
    return {
      device: {
        count: jest.fn().mockResolvedValue(50),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      endUser: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      deviceBinding: { deleteMany: jest.fn(), upsert: jest.fn() },
      deviceEvent: { deleteMany: jest.fn() },
      commandLog: { deleteMany: jest.fn() },
      alert: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
      ...overrides,
    } as any;
  }

  it('upserts the 51st device when DEVICE_SOFT_CAP is 3000', async () => {
    const prev = process.env.DEVICE_SOFT_CAP;
    process.env.DEVICE_SOFT_CAP = '3000';
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({
        list: [
          { deviceId: 'new-51', productId: 'uhmj5b0ba31zpme6', name: 'New', online: true },
        ],
        total: 51,
      }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ deviceId: 'new-51', productId: 'p', name: '', uid: undefined }),
      getDeviceSignal: jest.fn().mockResolvedValue(null),
      getDeviceStatus: jest.fn().mockResolvedValue([]),
      getUserProfile: jest.fn().mockResolvedValue(null),
      reverseGeocode: jest.fn().mockResolvedValue({
        latitude: '0',
        longitude: '0',
        address: 'mock',
      }),
    };
    const prisma = basePrisma({
      device: {
        count: jest.fn().mockResolvedValue(50),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'dev-51', deviceId: 'new-51' }),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const svc = new SyncService(prisma, tuya as any);
    try {
      const result = await svc.reconcileAll('admin-1');
      expect(prisma.device.upsert).toHaveBeenCalled();
      expect(result.devicesSynced).toBe(1);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.DEVICE_SOFT_CAP;
      else process.env.DEVICE_SOFT_CAP = prev;
    }
  });

  it('keeps ingesting when the fleet is already over DEVICE_SOFT_CAP', async () => {
    const prev = process.env.DEVICE_SOFT_CAP;
    process.env.DEVICE_SOFT_CAP = '50';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({
        list: [
          { deviceId: 'new-over', productId: 'uhmj5b0ba31zpme6', name: 'Over', online: true },
        ],
        total: 80,
      }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ deviceId: 'new-over', productId: 'p', name: '', uid: undefined }),
      getDeviceSignal: jest.fn().mockResolvedValue(null),
      getDeviceStatus: jest.fn().mockResolvedValue([]),
      getUserProfile: jest.fn().mockResolvedValue(null),
      reverseGeocode: jest.fn(),
    };
    const prisma = basePrisma({
      device: {
        count: jest.fn().mockResolvedValue(80),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'dev-over', deviceId: 'new-over' }),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const svc = new SyncService(prisma, tuya as any);
    try {
      const result = await svc.reconcileAll('admin-1');
      expect(result.devicesSynced).toBe(1);
      expect(prisma.device.upsert).toHaveBeenCalled();
      expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('action=accept');
    } finally {
      warn.mockRestore();
      if (prev === undefined) delete process.env.DEVICE_SOFT_CAP;
      else process.env.DEVICE_SOFT_CAP = prev;
    }
  });

  it('still upserts an existing device when the fleet count is already 50', async () => {
    const existing = { id: 'dev-1', deviceId: 'existing-1' };
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({
        list: [
          {
            deviceId: 'existing-1',
            productId: 'uhmj5b0ba31zpme6',
            name: 'Existing',
            online: true,
          },
        ],
        total: 1,
      }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ deviceId: 'new-1', productId: 'p', name: '', uid: undefined }),
      getDeviceSignal: jest.fn().mockResolvedValue(null),
      getDeviceStatus: jest.fn().mockResolvedValue([]),
      getUserProfile: jest.fn().mockResolvedValue(null),
      reverseGeocode: jest.fn().mockResolvedValue({
        latitude: '0',
        longitude: '0',
        address: 'mock',
      }),
    };
    const prisma = basePrisma({
      device: {
        count: jest.fn().mockResolvedValue(50),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(existing),
        deleteMany: jest.fn(),
      },
    });
    const svc = new SyncService(prisma, tuya as any);
    await svc.reconcileAll('admin-1');
    expect(prisma.device.upsert).toHaveBeenCalled();
  });

  it('removes local devices that are no longer associated in the cloud list', async () => {
    const prevMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'mock';
    const kept = { id: 'keep', deviceId: 'still-there' };
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({
        list: [{ deviceId: 'still-there', productId: 'p', name: 'Keep', online: true }],
        total: 1,
      }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ uid: undefined }),
      getDeviceSignal: jest.fn().mockResolvedValue(null),
      getDeviceStatus: jest.fn().mockResolvedValue([]),
      getUserProfile: jest.fn().mockResolvedValue(null),
      reverseGeocode: jest.fn(),
    };
    const prisma = basePrisma({
      device: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          { id: 'keep', deviceId: 'still-there' },
          { id: 'gone', deviceId: 'removed-in-cloud' },
        ]),
        findUnique: jest.fn().mockResolvedValue(kept),
        upsert: jest.fn().mockResolvedValue(kept),
        update: jest.fn().mockResolvedValue(kept),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const svc = new SyncService(prisma, tuya as any);
    try {
      const result = await svc.reconcileAll('admin-1');
      expect(result.removedDevices).toBe(1);
      expect(prisma.device.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['gone'] } },
      });
      expect(prisma.deviceBinding.deleteMany).toHaveBeenCalledWith({
        where: { deviceId: { in: ['gone'] } },
      });
    } finally {
      if (prevMode === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = prevMode;
    }
  });

  it('binds the device owner uid when the device-user API is empty', async () => {
    const existing = { id: 'dev-1', deviceId: 'vdevo1' };
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({
        list: [{ deviceId: 'vdevo1', productId: 'p', name: 'Boiler', online: true }],
        total: 1,
      }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ uid: 'ay-owner' }),
      getDeviceSignal: jest.fn().mockResolvedValue('-40 dBm · Excellent'),
      getDeviceStatus: jest.fn().mockResolvedValue([{ code: 'switch', value: true }]),
      getUserProfile: jest.fn().mockResolvedValue(null),
      reverseGeocode: jest.fn(),
    };
    const prisma = basePrisma({
      device: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(existing),
        deleteMany: jest.fn(),
      },
      endUser: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'user-1', tuyaUid: 'ay-owner' }),
        deleteMany: jest.fn(),
      },
    });
    const svc = new SyncService(prisma, tuya as any);
    await svc.reconcileAll('admin-1');
    expect(prisma.endUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tuyaUid: 'ay-owner' } }),
    );
    expect(prisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signalStrength: '-40 dBm · Excellent' }),
      }),
    );
  });

  it('does not purge demo fixtures unless DEMO_FIXTURE_PURGE is set', async () => {
    const prev = process.env.DEMO_FIXTURE_PURGE;
    delete process.env.DEMO_FIXTURE_PURGE;
    const prisma = basePrisma();
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({ list: [], total: 0 }),
    };
    try {
      const result = await new SyncService(prisma, tuya as any).reconcileAll('admin-1');
      expect(result.purgedDemoUsers).toBe(0);
      expect(result.purgedMock).toBe(0);
      expect(prisma.endUser.deleteMany).not.toHaveBeenCalled();
      expect(prisma.device.deleteMany).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.DEMO_FIXTURE_PURGE;
      else process.env.DEMO_FIXTURE_PURGE = prev;
    }
  });

  it('purges demo fixtures only for the one-time migration flag', async () => {
    const prevPurge = process.env.DEMO_FIXTURE_PURGE;
    const prevInterval = process.env.SYNC_PAGE_INTERVAL_MS;
    process.env.DEMO_FIXTURE_PURGE = '1';
    process.env.SYNC_PAGE_INTERVAL_MS = '0';
    const prisma = basePrisma({
      endUser: {
        findMany: jest.fn().mockResolvedValue([{ id: 'eu-demo' }]),
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      device: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'dev-demo' }])
          .mockResolvedValueOnce([]),
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({ list: [], total: 0 }),
    };
    try {
      const result = await new SyncService(prisma, tuya as any).reconcileAll('admin-1');
      expect(result.purgedDemoUsers).toBe(1);
      expect(result.purgedMock).toBe(1);
      expect(prisma.deviceEvent.deleteMany).toHaveBeenCalledWith({
        where: { deviceId: { in: ['dev-demo'] } },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'sync.reconcile',
            detail: expect.objectContaining({ demoFixturePurge: true, pages: 1 }),
          }),
        }),
      );
    } finally {
      if (prevPurge === undefined) delete process.env.DEMO_FIXTURE_PURGE;
      else process.env.DEMO_FIXTURE_PURGE = prevPurge;
      if (prevInterval === undefined) delete process.env.SYNC_PAGE_INTERVAL_MS;
      else process.env.SYNC_PAGE_INTERVAL_MS = prevInterval;
    }
  });

  it('pages with SYNC_PAGE_SIZE and records progress between pages', async () => {
    const prevSize = process.env.SYNC_PAGE_SIZE;
    const prevInterval = process.env.SYNC_PAGE_INTERVAL_MS;
    process.env.SYNC_PAGE_SIZE = '1';
    process.env.SYNC_PAGE_INTERVAL_MS = '250';
    const wait = jest.spyOn(syncPacing, 'waitMs').mockResolvedValue(undefined);
    const device = (id: string) => ({
      deviceId: id,
      productId: 'p',
      name: id,
      online: true,
    });
    const tuya = {
      listDevices: jest
        .fn()
        .mockResolvedValueOnce({ list: [device('a')], total: 2, nextLastId: 'a' })
        .mockResolvedValueOnce({ list: [device('b')], total: 2 }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ uid: undefined }),
      getDeviceSignal: jest.fn().mockResolvedValue(null),
      getDeviceStatus: jest.fn().mockResolvedValue([]),
      getUserProfile: jest.fn().mockResolvedValue(null),
      reverseGeocode: jest.fn(),
    };
    const prisma = basePrisma({
      device: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(async (args) => ({
          id: args.where.deviceId,
          deviceId: args.where.deviceId,
        })),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    try {
      const result = await new SyncService(prisma, tuya as any).reconcileAll('admin-1');
      expect(result.devicesSynced).toBe(2);
      expect(result.pages).toBe(2);
      expect(result.pageSize).toBe(1);
      expect(tuya.listDevices).toHaveBeenNthCalledWith(1, { lastId: undefined, pageSize: 1 });
      expect(wait).toHaveBeenCalledWith(250);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'sync.reconcile.progress',
            detail: expect.objectContaining({ page: 1, devicesSynced: 1, pageSize: 1 }),
          }),
        }),
      );
    } finally {
      wait.mockRestore();
      if (prevSize === undefined) delete process.env.SYNC_PAGE_SIZE;
      else process.env.SYNC_PAGE_SIZE = prevSize;
      if (prevInterval === undefined) delete process.env.SYNC_PAGE_INTERVAL_MS;
      else process.env.SYNC_PAGE_INTERVAL_MS = prevInterval;
    }
  });

  it('still upserts the device when reverseGeocode fails', async () => {
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({
        list: [
          {
            deviceId: 'geo-1',
            productId: 'p',
            name: 'Geo',
            online: true,
            lat: '31.2',
            lon: '121.5',
          },
        ],
        total: 1,
      }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ uid: undefined }),
      getDeviceSignal: jest.fn().mockResolvedValue(null),
      getDeviceStatus: jest.fn().mockResolvedValue([]),
      getUserProfile: jest.fn().mockResolvedValue(null),
      reverseGeocode: jest.fn().mockRejectedValue(new Error('geo down')),
    };
    const prisma = basePrisma({
      device: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'geo', deviceId: 'geo-1' }),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const result = await new SyncService(prisma, tuya as any).reconcileAll('admin-1');
    expect(result.devicesSynced).toBe(1);
    expect(tuya.reverseGeocode).toHaveBeenCalledWith({ latitude: '31.2', longitude: '121.5' });
    expect(prisma.device.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lat: '31.2', lon: '121.5' }),
      }),
    );
  });

  describe('reconcileUsers', () => {
    const prevSchema = process.env.TUYA_APP_SCHEMA;
    const prevInterval = process.env.SYNC_PAGE_INTERVAL_MS;

    afterEach(() => {
      if (prevSchema === undefined) delete process.env.TUYA_APP_SCHEMA;
      else process.env.TUYA_APP_SCHEMA = prevSchema;
      if (prevInterval === undefined) delete process.env.SYNC_PAGE_INTERVAL_MS;
      else process.env.SYNC_PAGE_INTERVAL_MS = prevInterval;
    });

    it('throws when TUYA_APP_SCHEMA is missing', async () => {
      delete process.env.TUYA_APP_SCHEMA;
      const tuya = { listAppUsers: jest.fn() };
      const prisma = basePrisma();
      const svc = new SyncService(prisma, tuya as any);
      await expect(svc.reconcileUsers('admin-1')).rejects.toThrow(/TUYA_APP_SCHEMA/);
      expect(tuya.listAppUsers).not.toHaveBeenCalled();
    });

    it('pages until hasMore=false and upserts users', async () => {
      process.env.TUYA_APP_SCHEMA = 'testApp';
      process.env.SYNC_PAGE_INTERVAL_MS = '0';
      const tuya = {
        listAppUsers: jest
          .fn()
          .mockResolvedValueOnce({
            list: [
              { tuyaUid: 'ay1', username: 'u1', mobile: '138', raw: { a: 1 } },
              { tuyaUid: 'uid-demo-skip', username: 'skip' },
            ],
            hasMore: true,
            total: 3,
          })
          .mockResolvedValueOnce({
            list: [{ tuyaUid: 'ay2', email: 'a@b.c' }],
            hasMore: false,
            total: 3,
          }),
      };
      const prisma = basePrisma({
        endUser: {
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn().mockResolvedValue({ id: 'eu-1' }),
          deleteMany: jest.fn(),
        },
      });
      const svc = new SyncService(prisma, tuya as any);
      const result = await svc.reconcileUsers('admin-1');
      expect(result).toEqual({
        usersSynced: 2,
        pages: 2,
        total: 3,
        pageSize: 100,
        intervalMs: 0,
      });
      expect(tuya.listAppUsers).toHaveBeenCalledTimes(2);
      expect(tuya.listAppUsers).toHaveBeenNthCalledWith(1, {
        schema: 'testApp',
        pageNo: 1,
        pageSize: 100,
      });
      expect(tuya.listAppUsers).toHaveBeenNthCalledWith(2, {
        schema: 'testApp',
        pageNo: 2,
        pageSize: 100,
      });
      expect(prisma.endUser.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'sync.reconcileUsers' }),
        }),
      );
    });
  });
});
