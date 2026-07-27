import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  it('filters devices by productId', async () => {
    const prisma = {
      device: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const svc = new DevicesService(prisma);
    await svc.list({ productId: 'uhmj5b0ba31zpme6', page: 1, pageSize: 20 });
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: 'uhmj5b0ba31zpme6' }),
      }),
    );
  });
});
