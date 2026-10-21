import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  it('filters devices by productId', async () => {
    const prisma = {
      device: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const svc = new DevicesService(prisma, {} as any);
    await svc.list({ productId: 'uhmj5b0ba31zpme6', page: 1, pageSize: 20 });
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: 'uhmj5b0ba31zpme6' }),
      }),
    );
  });

  it('refresh stores wifi signal and the cloud owner when status has no signal DP', async () => {
    const device = {
      id: 'dev-1',
      deviceId: 'vdevo1',
      productId: 'p',
      statusJson: { switch: true },
      bindings: [],
      alerts: [],
    };
    const prisma = {
      device: {
        findUnique: jest.fn().mockImplementation(async ({ include }: { include?: unknown }) =>
          include ? { ...device, signalStrength: '-40 dBm · Excellent', bindings: [{ endUser: { tuyaUid: 'ay-owner', username: null, mobile: null, email: null, remark: null } }] } : device,
        ),
        update: jest.fn().mockResolvedValue(device),
      },
      alert: { findMany: jest.fn().mockResolvedValue([]) },
      endUser: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      deviceBinding: { deleteMany: jest.fn(), upsert: jest.fn() },
    } as any;
    const tuya = {
      getDeviceStatus: jest.fn().mockResolvedValue([{ code: 'switch', value: true }]),
      getDeviceSignal: jest.fn().mockResolvedValue('-40 dBm · Excellent'),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ uid: 'ay-owner' }),
    };
    const svc = new DevicesService(prisma, tuya as any);
    const detail = await svc.refreshStatus('vdevo1');
    expect(prisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signalStrength: '-40 dBm · Excellent' }),
      }),
    );
    expect(prisma.deviceBinding.upsert).toHaveBeenCalled();
    expect(detail.bindings.map((b: { tuyaUid: string }) => b.tuyaUid)).toEqual(['ay-owner']);
    expect(detail.signalStrength).toBe('-40 dBm · Excellent');
  });
});
