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

  it('skips upsert for new device when global count >= MAX_DEVICES', async () => {
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(50),
        upsert: jest.fn(),
      },
      deviceEvent: { create: jest.fn() },
    } as any;
    const handler = new EventHandlerService(prisma);
    await handler.handle({
      bizCode: 'deviceOnline',
      ts: Date.now(),
      deviceId: 'd-new',
      productId: 'uhmj5b0ba31zpme6',
      payload: {},
    });
    expect(prisma.device.upsert).not.toHaveBeenCalled();
    expect(prisma.deviceEvent.create).not.toHaveBeenCalled();
  });
});
