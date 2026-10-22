import { PrismaClient } from '@prisma/client';
import { DEMO_FAULT_COPY, getFaultMeaning } from '../devices/product-fault-schemas';
import {
  assertWaterHeaterLabelOrder,
  bitmapSlot,
  buildFaultCodeSeedRows,
  upsertFaultCodeDefinitions,
  verifyWaterHeaterDictionary,
  WATER_HEATER_LABEL_ORDER,
  WATER_HEATER_PRODUCT_ID,
} from './fault-code-catalog';

describe('fault code catalog', () => {
  it('keeps the water heater bitmap order and does not invent copy', () => {
    const rows = buildFaultCodeSeedRows()
      .filter((row) => row.productId === WATER_HEATER_PRODUCT_ID)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    expect(rows.map((row) => row.label)).toEqual([...WATER_HEATER_LABEL_ORDER]);
    expect(rows.map((row) => row.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(rows.every((row) => row.symptom == null && row.cause == null)).toBe(true);
    expect(rows.every((row) => row.countInQualityRate && row.notifyAftersales === false)).toBe(
      true,
    );
    expect(rows[0]?.symptom).not.toBe(DEMO_FAULT_COPY.E1?.symptom);
  });

  it('fills matched product symptoms from getFaultMeaning instead of the merged placeholder', () => {
    const productId = '1x0qz5jtlabxywcg';
    const meaning = getFaultMeaning(productId, 'E1');
    const row = buildFaultCodeSeedRows().find(
      (item) => item.productId === productId && item.label === 'E1',
    );

    expect(meaning?.symptom).toBe('火焰故障');
    expect(row?.symptom).toBe(meaning?.symptom);
    expect(row?.suggestedAction).toBe(meaning?.suggestedAction);
    expect(row?.symptom).not.toBe(DEMO_FAULT_COPY.E1?.symptom);
    expect(row?.notifyAftersales).toBe(false);
    expect(row?.countInQualityRate).toBe(true);
  });

  it('rejects a sequential E1-E4 water heater order', () => {
    expect(() => assertWaterHeaterLabelOrder(['E1', 'E3', 'E4', 'E2'])).not.toThrow();
    expect(() => assertWaterHeaterLabelOrder(['E1', 'E2', 'E3', 'E4'])).toThrow(/E1,E3,E4,E2/);
  });

  it('locks bitmap labels to their bit index', () => {
    expect(bitmapSlot(WATER_HEATER_PRODUCT_ID, 'fault', 'E2')).toEqual({
      kind: 'locked',
      index: 3,
    });
    expect(bitmapSlot(WATER_HEATER_PRODUCT_ID, 'fault', 'E5').kind).toBe('rejected');
    expect(bitmapSlot('not-a-product', 'fault', 'E1').kind).toBe('free');
  });

  it('upserts meanings without resetting notify flags or unmatched copy', async () => {
    const calls: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
    const prisma = {
      faultCodeDefinition: {
        upsert: jest.fn(async (args) => {
          calls.push(args);
          return args.create;
        }),
      },
    } as unknown as PrismaClient;

    const summary = await upsertFaultCodeDefinitions(prisma);
    const matched = calls.find(
      (call) => call.create.productId === '1x0qz5jtlabxywcg' && call.create.label === 'E1',
    );
    const heater = calls.find(
      (call) => call.create.productId === WATER_HEATER_PRODUCT_ID && call.create.label === 'E2',
    );

    expect(summary.withMeaning).toBeGreaterThan(0);
    expect(summary.withoutMeaning).toBeGreaterThan(0);
    expect(matched?.create.symptom).toBe('火焰故障');
    expect(matched?.create.notifyAftersales).toBe(false);
    expect(matched?.update).toEqual(
      expect.objectContaining({ sortOrder: 1, symptom: '火焰故障' }),
    );
    expect(matched?.update.notifyAftersales).toBeUndefined();
    expect(matched?.update.countInQualityRate).toBeUndefined();
    expect(heater?.create.sortOrder).toBe(3);
    expect(heater?.create.symptom).toBeNull();
    expect(heater?.update).toEqual({ sortOrder: 3 });
  });

  it('reads the stored water heater order back as E1,E3,E4,E2', async () => {
    const prisma = {
      faultCodeDefinition: {
        findMany: jest.fn().mockResolvedValue([
          { code: 'fault', label: 'E1', sortOrder: 0 },
          { code: 'fault', label: 'E3', sortOrder: 1 },
          { code: 'fault', label: 'E4', sortOrder: 2 },
          { code: 'fault', label: 'E2', sortOrder: 3 },
        ]),
      },
    } as unknown as PrismaClient;

    await expect(verifyWaterHeaterDictionary(prisma)).resolves.toEqual([
      'E1',
      'E3',
      'E4',
      'E2',
    ]);
  });
});
