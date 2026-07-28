import { SyncService } from './sync.service';

describe('SyncService', () => {
  it('skips new devices when global count would reach MAX_DEVICES', async () => {
    const tuya = {
      listDevicesByProduct: jest.fn().mockResolvedValue({
        list: [
          { deviceId: 'new-1', productId: 'uhmj5b0ba31zpme6', name: 'New', online: true },
        ],
        total: 1,
      }),
      getDeviceUsers: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      device: {
        count: jest.fn().mockResolvedValue(50),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      endUser: { upsert: jest.fn() },
      deviceBinding: { deleteMany: jest.fn(), upsert: jest.fn() },
      auditLog: { create: jest.fn() },
    } as any;
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
      getDeviceUsers: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      device: {
        count: jest.fn().mockResolvedValue(50),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockResolvedValue(existing),
      },
      endUser: { upsert: jest.fn() },
      deviceBinding: { deleteMany: jest.fn(), upsert: jest.fn() },
      auditLog: { create: jest.fn() },
    } as any;
    const svc = new SyncService(prisma, tuya as any);
    await svc.reconcileAll('admin-1');
    expect(prisma.device.upsert).toHaveBeenCalled();
  });
});
