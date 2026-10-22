import { BadRequestException } from '@nestjs/common';
import {
  clusterBySignature,
  DictionaryCode,
  incompatibleBitmapMessage,
  suggestGroupName,
} from './fault-code-groups';
import { FaultCodeGroupsService } from './fault-code-groups.service';
import { WATER_HEATER_PRODUCT_ID } from './fault-code-catalog';

function code(label: string, sortOrder: number, symptom: string | null = null): DictionaryCode {
  return {
    code: 'fault',
    label,
    sortOrder,
    symptom,
    cause: null,
    suggestedAction: symptom ? '检查后联系售后。' : null,
    countInQualityRate: true,
    notifyAftersales: false,
  };
}

describe('fault code groups', () => {
  it('clusters products that share the same dictionary', () => {
    const shared = [code('E0', 0, '水温探头故障'), code('E1', 1, '火焰故障')];
    const clusters = clusterBySignature([
      { productId: '1x0qz5jtlabxywcg', codes: shared },
      { productId: '2d2lzbcuvusrbfo1', codes: shared.map((item) => ({ ...item })) },
      { productId: WATER_HEATER_PRODUCT_ID, codes: [code('E1', 0), code('E3', 1), code('E4', 2), code('E2', 3)] },
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.productIds).toEqual(['1x0qz5jtlabxywcg', '2d2lzbcuvusrbfo1']);
    expect(clusters[1]?.productIds).toEqual([WATER_HEATER_PRODUCT_ID]);
    expect(suggestGroupName(clusters[0]!.productIds, clusters[0]!.codes)).toBe(
      '燃气热水器 · E0,E1',
    );
  });

  it('rejects putting the water heater into an E1-E4 group', () => {
    const sequential = [code('E1', 0), code('E2', 1), code('E3', 2), code('E4', 3)];
    expect(incompatibleBitmapMessage(WATER_HEATER_PRODUCT_ID, sequential)).toMatch(/E1,E3,E4,E2/);
    expect(
      incompatibleBitmapMessage(WATER_HEATER_PRODUCT_ID, [
        code('E1', 0),
        code('E3', 1),
        code('E4', 2),
        code('E2', 3),
      ]),
    ).toBeNull();
  });
});

describe('FaultCodeGroupsService.update', () => {
  it('does not write when the water heater bitmap would change', async () => {
    const prisma = {
      faultCodeGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          name: '顺排',
          members: [],
          codes: [code('E1', 0), code('E2', 1), code('E3', 2), code('E4', 3)].map((item, index) => ({
            id: `c${index}`,
            ...item,
          })),
        }),
      },
      $transaction: jest.fn(),
    } as any;
    const service = new FaultCodeGroupsService(prisma);

    await expect(
      service.update('g1', { productIds: [WATER_HEATER_PRODUCT_ID] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
