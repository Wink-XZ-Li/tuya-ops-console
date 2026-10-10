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

  it('skips new devices when global count would reach MAX_DEVICES', async () => {
    const tuya = {
      listDevices: jest.fn().mockResolvedValue({
        list: [
          { deviceId: 'new-1', productId: 'uhmj5b0ba31zpme6', name: 'New', online: true },
        ],
        total: 1,
      }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDeviceStatus: jest.fn().mockResolvedValue([]),
      getUserProfile: jest.fn().mockResolvedValue(null),
      reverseGeocode: jest.fn().mockResolvedValue({
        latitude: '0',
        longitude: '0',
        address: 'mock',
      }),
    };
    const prisma = basePrisma();
    const svc = new SyncService(prisma, tuya as any);
    await svc.reconcileAll('admin-1');
    expect(prisma.device.upsert).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('still upserts existing devices at global cap', async () => {
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

  describe('reconcileUsers', () => {
    const prevSchema = process.env.TUYA_APP_SCHEMA;

    afterEach(() => {
      if (prevSchema === undefined) delete process.env.TUYA_APP_SCHEMA;
      else process.env.TUYA_APP_SCHEMA = prevSchema;
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
      expect(result).toEqual({ usersSynced: 2, pages: 2, total: 3 });
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
