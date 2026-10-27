import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getProductDps } from '../devices/product-dp-schemas';
import { CommandsService } from './commands.service';

const PRODUCT_ID = '0wyzpxylwzjx6gej';

function createService(opts?: {
  device?: Record<string, unknown> | null;
  standard?: Array<{ code: string; mode?: string; name?: string; type?: string }>;
  standardError?: Error;
  model?: Array<{ code: string; mode?: string; name?: string; type?: string }>;
}) {
  const device =
    opts && 'device' in opts
      ? opts.device
      : { id: 'row-1', deviceId: 'dev-1', productId: PRODUCT_ID };
  const prisma = {
    device: { findUnique: jest.fn().mockResolvedValue(device) },
    dpAlias: { findMany: jest.fn().mockResolvedValue([]) },
    commandLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const tuya = {
    getStandardFunctions: opts?.standardError
      ? jest.fn().mockRejectedValue(opts.standardError)
      : jest.fn().mockResolvedValue(opts?.standard ?? []),
    getThingProperties: jest.fn().mockResolvedValue(opts?.model ?? []),
    sendStandardCommand: jest.fn().mockResolvedValue({ ok: true }),
  };
  return { prisma, tuya, svc: new CommandsService(prisma as any, tuya as any) };
}

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

  it('keeps instruction-set modes and forces every other code to ro', async () => {
    const schema = getProductDps(PRODUCT_ID);
    const writable = schema.filter((dp) => dp.mode === 'rw');
    const readonly = schema.find((dp) => dp.mode === 'ro');
    expect(writable.length).toBeGreaterThan(1);
    expect(readonly).toBeDefined();
    const allowed = writable[0];
    const schemaOnly = writable[1];

    const { svc } = createService({
      standard: [
        { code: allowed.code, mode: 'rw', name: '标准指令' },
        { code: readonly!.code, mode: 'rw' },
        { code: 'standard_only', mode: 'ro', type: 'Boolean' },
      ],
      model: [
        { code: 'model_only', name: '物模型点', mode: 'rw', type: 'Boolean' },
        { code: allowed.code, mode: 'rw' },
      ],
    });

    const functions = await svc.getFunctions('dev-1');
    const modeOf = (code: string) => functions.find((fn) => fn.code === code)?.mode;

    expect(modeOf(allowed.code)).toBe('rw');
    expect(modeOf(readonly!.code)).toBe('ro');
    expect(modeOf('standard_only')).toBe('ro');
    expect(modeOf(schemaOnly.code)).toBe('ro');
    expect(modeOf('model_only')).toBe('ro');
  });

  it('marks every code read-only when the instruction set cannot be loaded', async () => {
    const { svc } = createService({
      standardError: new Error('tuya down'),
      model: [{ code: 'fault', mode: 'rw', type: 'Boolean' }],
    });

    const functions = await svc.getFunctions('dev-1');
    expect(functions.find((fn) => fn.code === 'fault')?.mode).toBe('ro');
    expect(functions.every((fn) => fn.mode === 'ro')).toBe(true);
  });

  it('sends a code that is in the standard instruction set', async () => {
    const { svc, tuya, prisma } = createService({
      standard: [{ code: 'wash_switch', mode: 'rw' }],
    });

    const result = await svc.send('dev-1', 'admin1', { code: 'wash_switch', value: true });

    expect(result.success).toBe(true);
    expect(tuya.sendStandardCommand).toHaveBeenCalledWith('dev-1', [
      { code: 'wash_switch', value: true },
    ]);
    expect(prisma.commandLog.create).toHaveBeenCalled();
  });

  it('rejects send when the code is outside the standard instruction set', async () => {
    const { svc, tuya, prisma } = createService({
      standard: [{ code: 'wash_switch', mode: 'rw' }],
    });

    await expect(
      svc.send('dev-1', 'admin1', { code: 'fault', value: 1 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.send('dev-1', 'admin1', { code: 'fault', value: 1 }),
    ).rejects.toThrow('fault 不在该设备标准指令集中，禁止下发');
    expect(tuya.sendStandardCommand).not.toHaveBeenCalled();
    expect(prisma.commandLog.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects send when the instruction set cannot be loaded', async () => {
    const { svc, tuya } = createService({
      standardError: new Error('tuya down'),
    });

    await expect(
      svc.send('dev-1', 'admin1', { code: 'wash_switch', value: true }),
    ).rejects.toThrow('无法获取设备标准指令集，已拒绝下发 wash_switch');
    expect(tuya.sendStandardCommand).not.toHaveBeenCalled();
  });
});
