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
      listDevicesByProduct: jest.fn().mockResolvedValue({
        list: [
          { deviceId: 'new-1', productId: 'uhmj5b0ba31zpme6', name: 'New', online: true },
        ],
        total: 1,
      }),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDeviceStatus: jest.fn().mockResolvedValue([]),
      getUserProfile: jest.fn().mockResolvedValue(null),
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
      listDevicesByProduct: jest.fn().mockResolvedValue({
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
});
