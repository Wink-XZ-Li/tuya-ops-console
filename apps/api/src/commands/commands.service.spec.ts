import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getProductDps } from '../devices/product-dp-schemas';
import { CommandsService } from './commands.service';

const PRODUCT_ID = '0wyzpxylwzjx6gej';

function createService(opts?: {
  device?: Record<string, unknown> | null;
  standard?: Array<{ code: string; mode?: string; name?: string; type?: string }>;
  standardError?: Error;
  model?: Array<{ code: string; mode?: string; name?: string; type?: string }>;
  issueError?: Error;
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
    issueProperties: opts?.issueError
      ? jest.fn().mockRejectedValue(opts.issueError)
      : jest.fn().mockResolvedValue({ ok: true }),
  };
  return { prisma, tuya, svc: new CommandsService(prisma as any, tuya as any) };
}

describe('CommandsService', () => {
  it('throws NotFound for unknown device', async () => {
    const prisma = { device: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    const tuya = { issueProperties: jest.fn(), sendStandardCommand: jest.fn() } as any;
    const svc = new CommandsService(prisma, tuya);
    await expect(
      svc.send('missing', 'admin1', { code: 'switch_1', value: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tuya.issueProperties).not.toHaveBeenCalled();
    expect(tuya.sendStandardCommand).not.toHaveBeenCalled();
  });

  it('keeps schema and thing-model modes for codes outside the standard instruction set', async () => {
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
        { code: 'ph', name: 'PH采暖最大比例阀电流', mode: 'rw', type: 'value' },
        { code: allowed.code, mode: 'rw' },
      ],
    });

    const functions = await svc.getFunctions('dev-1');
    const modeOf = (code: string) => functions.find((fn) => fn.code === code)?.mode;

    expect(modeOf(allowed.code)).toBe('rw');
    expect(modeOf(readonly!.code)).toBe('ro');
    expect(modeOf('standard_only')).toBe('ro');
    expect(modeOf(schemaOnly.code)).toBe('rw');
    expect(modeOf('model_only')).toBe('rw');
    expect(modeOf('ph')).toBe('rw');
  });

  it('keeps schema and thing-model modes when the instruction set cannot be loaded', async () => {
    const schema = getProductDps(PRODUCT_ID);
    const readonly = schema.find((dp) => dp.mode === 'ro');
    const writable = schema.find((dp) => dp.mode === 'rw');
    const { svc } = createService({
      standardError: new Error('tuya down'),
      model: [{ code: 'ph', mode: 'rw', type: 'value' }],
    });

    const functions = await svc.getFunctions('dev-1');
    expect(functions.find((fn) => fn.code === readonly!.code)?.mode).toBe('ro');
    expect(functions.find((fn) => fn.code === writable!.code)?.mode).toBe('rw');
    expect(functions.find((fn) => fn.code === 'ph')?.mode).toBe('rw');
  });

  it('issues every writable property through IoT Core, including codes outside the instruction set', async () => {
    const { svc, tuya, prisma } = createService({
      standard: [{ code: 'wash_switch', mode: 'rw' }],
      model: [{ code: 'ph', mode: 'rw', type: 'value' }],
    });

    const result = await svc.send('dev-1', 'admin1', { code: 'ph', value: 122 });

    expect(result.success).toBe(true);
    expect(tuya.issueProperties).toHaveBeenCalledWith('dev-1', { ph: 122 });
    expect(tuya.sendStandardCommand).not.toHaveBeenCalled();
    expect(prisma.commandLog.create).toHaveBeenCalled();
  });

  it('issues standard instruction codes through the same properties issue path', async () => {
    const { svc, tuya } = createService({
      standard: [
        { code: 'wash_switch', mode: 'rw' },
        { code: 'switch', mode: 'rw' },
        { code: 'temp_set', mode: 'rw' },
        { code: 'dhw_temp_set', mode: 'rw' },
      ],
      model: [
        { code: 'switch', mode: 'rw' },
        { code: 'temp_set', mode: 'rw' },
        { code: 'dhw_temp_set', mode: 'rw' },
      ],
    });

    await svc.send('dev-1', 'admin1', { code: 'wash_switch', value: true });
    await svc.send('dev-1', 'admin1', { code: 'switch', value: true });
    await svc.send('dev-1', 'admin1', { code: 'temp_set', value: 78 });
    await svc.send('dev-1', 'admin1', { code: 'dhw_temp_set', value: 44 });

    expect(tuya.issueProperties).toHaveBeenNthCalledWith(1, 'dev-1', { wash_switch: true });
    expect(tuya.issueProperties).toHaveBeenNthCalledWith(2, 'dev-1', { switch: true });
    expect(tuya.issueProperties).toHaveBeenNthCalledWith(3, 'dev-1', { temp_set: 78 });
    expect(tuya.issueProperties).toHaveBeenNthCalledWith(4, 'dev-1', { dhw_temp_set: 44 });
    expect(tuya.sendStandardCommand).not.toHaveBeenCalled();
  });

  it('rejects send when the property is read-only', async () => {
    const readonly = getProductDps(PRODUCT_ID).find((dp) => dp.mode === 'ro');
    const { svc, tuya, prisma } = createService({
      standard: [{ code: readonly!.code, mode: 'rw' }],
    });

    await expect(
      svc.send('dev-1', 'admin1', { code: readonly!.code, value: 1 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.send('dev-1', 'admin1', { code: readonly!.code, value: 1 }),
    ).rejects.toThrow(`${readonly!.code} 为只读属性，禁止下发`);
    expect(tuya.issueProperties).not.toHaveBeenCalled();
    expect(tuya.sendStandardCommand).not.toHaveBeenCalled();
    expect(prisma.commandLog.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects send when the code is not in the schema or thing model', async () => {
    const { svc, tuya } = createService({
      standard: [{ code: 'wash_switch', mode: 'rw' }],
    });

    await expect(svc.send('dev-1', 'admin1', { code: 'not_a_dp', value: 1 })).rejects.toThrow(
      'not_a_dp 不在该设备物模型或功能定义中，禁止下发',
    );
    expect(tuya.issueProperties).not.toHaveBeenCalled();
  });

  it('returns the Tuya error when property issue fails', async () => {
    const { svc, tuya, prisma } = createService({
      model: [{ code: 'ph', mode: 'rw' }],
      issueError: new Error('Tuya issueProperties failed for dev-1: [2008] not support'),
    });

    const result = await svc.send('dev-1', 'admin1', { code: 'ph', value: 122 });

    expect(result.success).toBe(false);
    expect(result.tuyaResponse).toEqual({
      error: 'Tuya issueProperties failed for dev-1: [2008] not support',
    });
    expect(tuya.sendStandardCommand).not.toHaveBeenCalled();
    expect(prisma.commandLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'ph', success: false }),
      }),
    );
  });
});
