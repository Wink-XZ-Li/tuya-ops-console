import { NotFoundException } from '@nestjs/common';
import { CommandsService } from './commands.service';

describe('CommandsService', () => {
  it('throws NotFound for unknown device', async () => {
    const prisma = { device: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    const tuya = { sendStandardCommand: jest.fn() } as any;
    const svc = new CommandsService(prisma, tuya);
    await expect(
      svc.send('missing', 'admin1', { code: 'switch_1', value: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tuya.sendStandardCommand).not.toHaveBeenCalled();
  });
});
