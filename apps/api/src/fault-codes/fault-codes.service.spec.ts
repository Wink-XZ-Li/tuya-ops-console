import { BadRequestException, ConflictException } from '@nestjs/common';
import { FaultCodesService } from './fault-codes.service';
import { WATER_HEATER_PRODUCT_ID } from './fault-code-catalog';

function heaterRow(label: string, sortOrder: number, id = `wh-${label}`) {
  return {
    id,
    productId: WATER_HEATER_PRODUCT_ID,
    code: 'fault',
    label,
    sortOrder,
    symptom: null,
    cause: null,
    suggestedAction: null,
    countInQualityRate: true,
    notifyAftersales: false,
    createdAt: new Date('2026-10-22T00:00:00.000Z'),
    updatedAt: new Date('2026-10-22T00:00:00.000Z'),
  };
}

describe('FaultCodesService', () => {
  it('lists a product in bitmap order', async () => {
    const rows = ['E1', 'E3', 'E4', 'E2'].map((label, sortOrder) => heaterRow(label, sortOrder));
    const prisma = {
      faultCodeDefinition: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    } as any;
    const service = new FaultCodesService(prisma);

    const listed = await service.list({ productId: WATER_HEATER_PRODUCT_ID });

    expect(prisma.faultCodeDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: WATER_HEATER_PRODUCT_ID },
        orderBy: [{ productId: 'asc' }, { code: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
    expect(listed.map((row) => row.label)).toEqual(['E1', 'E3', 'E4', 'E2']);
  });

  it('updates symptom and the notify switch without touching sort order', async () => {
    const existing = heaterRow('E3', 1);
    const prisma = {
      faultCodeDefinition: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data })),
      },
    } as any;
    const service = new FaultCodesService(prisma);

    const updated = await service.update(existing.id, {
      symptom: '风机侧已改文案',
      notifyAftersales: true,
    });

    expect(prisma.faultCodeDefinition.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { symptom: '风机侧已改文案', notifyAftersales: true },
    });
    expect(updated.symptom).toBe('风机侧已改文案');
  });

  it('rejects reordering the water heater into E1-E4 sequence', async () => {
    const existing = heaterRow('E2', 3);
    const prisma = {
      faultCodeDefinition: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn(),
      },
    } as any;
    const service = new FaultCodesService(prisma);

    await expect(service.update(existing.id, { sortOrder: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.faultCodeDefinition.update).not.toHaveBeenCalled();
  });

  it('accepts the bitmap sort order for a water heater label', async () => {
    const existing = heaterRow('E2', 3);
    const prisma = {
      faultCodeDefinition: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data })),
      },
    } as any;
    const service = new FaultCodesService(prisma);

    await service.update(existing.id, { sortOrder: 3, cause: '人工补充原因' });

    expect(prisma.faultCodeDefinition.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { sortOrder: 3, cause: '人工补充原因' },
    });
  });

  it('rejects deleting a bitmap label', async () => {
    const existing = heaterRow('E4', 2);
    const prisma = {
      faultCodeDefinition: {
        findUnique: jest.fn().mockResolvedValue(existing),
        delete: jest.fn(),
      },
    } as any;
    const service = new FaultCodesService(prisma);

    await expect(service.remove(existing.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.faultCodeDefinition.delete).not.toHaveBeenCalled();
  });

  it('rejects creating a water heater label outside the bitmap', async () => {
    const prisma = { faultCodeDefinition: { create: jest.fn() } } as any;
    const service = new FaultCodesService(prisma);

    await expect(
      service.create({
        productId: WATER_HEATER_PRODUCT_ID,
        code: 'fault',
        label: 'E5',
        sortOrder: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.faultCodeDefinition.create).not.toHaveBeenCalled();
  });

  it('rejects creating a water heater label at a non-bitmap sort order', async () => {
    const prisma = { faultCodeDefinition: { create: jest.fn() } } as any;
    const service = new FaultCodesService(prisma);

    await expect(
      service.create({
        productId: WATER_HEATER_PRODUCT_ID,
        code: 'fault',
        label: 'E2',
        sortOrder: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 409 when the fault code already exists', async () => {
    const prisma = {
      faultCodeDefinition: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    } as any;
    const service = new FaultCodesService(prisma);

    await expect(
      service.create({
        productId: WATER_HEATER_PRODUCT_ID,
        code: 'fault',
        label: 'E1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
