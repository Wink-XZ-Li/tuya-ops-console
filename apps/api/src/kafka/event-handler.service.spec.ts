import { EventHandlerService } from './event-handler.service';

describe('EventHandlerService', () => {
  it('ignores non-whitelisted product', async () => {
    const prisma = {
      device: { upsert: jest.fn(), findUnique: jest.fn() },
      deviceEvent: { create: jest.fn() },
    } as any;
    const handler = new EventHandlerService(prisma, new Set(['uhmj5b0ba31zpme6']));
    await handler.handle({
      bizCode: 'deviceOnline',
      ts: Date.now(),
      deviceId: 'd1',
      productId: 'not-allowed',
      payload: {},
    });
    expect(prisma.device.upsert).not.toHaveBeenCalled();
    expect(prisma.deviceEvent.create).not.toHaveBeenCalled();
  });
});
