import { AlertStatus } from '@prisma/client';
import { AlertsService } from './alerts.service';

describe('AlertsService.close', () => {
  it('closes an open alert, clears activeKey, and writes an audit log', async () => {
    const prisma = {
      alert: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a1',
          deviceId: 'dev1',
          faultCode: 'E1',
          status: AlertStatus.open,
        }),
        update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'a1', ...data })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'log1' }) },
    } as any;
    const service = new AlertsService(prisma);
    const closed = await service.close('a1', 'admin-1', '现场已恢复');

    expect(prisma.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({
          status: AlertStatus.closed,
          closedReason: 'manual',
          activeKey: null,
        }),
      }),
    );
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'alert.close',
          resource: 'alert',
        }),
      }),
    );
  });

  it('does not clear activeKey when acknowledging', async () => {
    const prisma = {
      alert: {
        findUnique: jest.fn().mockResolvedValue({ id: 'a1', status: AlertStatus.open }),
        update: jest.fn().mockResolvedValue({ id: 'a1', status: AlertStatus.acked }),
      },
    } as any;
    const service = new AlertsService(prisma);
    await service.ack('a1');
    const data = prisma.alert.update.mock.calls[0][0].data;
    expect(data).toEqual({ status: AlertStatus.acked });
    expect(data.activeKey).toBeUndefined();
  });
});
