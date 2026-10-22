import { Prisma, PrismaClient } from '@prisma/client';
import { PRODUCT_FAULT_FAMILY } from '../devices/product-fault-meanings';
import type { FaultFamilyId } from '../devices/product-fault-meanings';
import { PRODUCT_FAULT_BITMAP_LABELS } from '../devices/product-fault-schemas';
import { WATER_HEATER_LABEL_ORDER, WATER_HEATER_PRODUCT_ID } from './fault-code-catalog';

export type DictionaryCode = {
  code: string;
  label: string;
  sortOrder: number;
  symptom: string | null;
  cause: string | null;
  suggestedAction: string | null;
  countInQualityRate: boolean;
  notifyAftersales: boolean;
};

const FAMILY_LABEL: Record<FaultFamilyId, string> = {
  gas_boiler: '壁挂炉',
  gas_instant_water_heater: '燃气热水器',
  rv_ac_controller: '房车空调',
  water_purifier_faucet_comm: '净水器龙头通信',
  water_purifier_heat: '净水器加热',
  water_purifier_pureone_hot: '净水器热胆',
  water_softener: '软水机',
  zero_cold_water_heater: '零冷水热水器',
};

export function dictionarySignature(codes: DictionaryCode[]): string {
  return [...codes]
    .sort(compareCodes)
    .map((code) =>
      [
        code.code,
        code.label,
        code.sortOrder,
        code.symptom ?? '',
        code.cause ?? '',
        code.suggestedAction ?? '',
        code.countInQualityRate ? '1' : '0',
        code.notifyAftersales ? '1' : '0',
      ].join('\u001f'),
    )
    .join('\u001e');
}

export function clusterBySignature(
  products: Array<{ productId: string; codes: DictionaryCode[] }>,
): Array<{ productIds: string[]; codes: DictionaryCode[] }> {
  const groups = new Map<string, { productIds: string[]; codes: DictionaryCode[] }>();
  for (const product of products) {
    if (product.codes.length === 0) continue;
    const signature = dictionarySignature(product.codes);
    const existing = groups.get(signature);
    if (existing) {
      existing.productIds.push(product.productId);
    } else {
      groups.set(signature, {
        productIds: [product.productId],
        codes: [...product.codes].sort(compareCodes),
      });
    }
  }
  return [...groups.values()];
}

export function suggestGroupName(productIds: string[], codes: DictionaryCode[]): string {
  const labels = [...codes].sort(compareCodes).map((code) => code.label);
  const labelText = labels.join(',');
  const families = new Set(
    productIds
      .map((productId) => PRODUCT_FAULT_FAMILY[productId])
      .filter((family): family is FaultFamilyId => Boolean(family)),
  );
  let name: string;
  if (families.size === 1) {
    name = `${FAMILY_LABEL[[...families][0]]} · ${labelText}`;
  } else if (productIds.length === 1 && productIds[0] === WATER_HEATER_PRODUCT_ID) {
    name = `西屋即热旋钮款 · ${labelText}`;
  } else {
    name = `故障组 · ${labelText}`;
  }
  return name.slice(0, 128);
}

/** 返回不能把这套故障码写到该产品的原因。位图一致时返回 null。 */
export function incompatibleBitmapMessage(
  productId: string,
  codes: DictionaryCode[],
): string | null {
  const byCode = PRODUCT_FAULT_BITMAP_LABELS[productId];
  if (!byCode) return null;
  const grouped = new Map<string, DictionaryCode[]>();
  for (const code of codes) {
    const list = grouped.get(code.code) ?? [];
    list.push(code);
    grouped.set(code.code, list);
  }
  for (const [dpCode, labels] of Object.entries(byCode)) {
    const actual = (grouped.get(dpCode) ?? []).slice().sort(compareCodes).map((code) => code.label);
    if (actual.join(',') !== labels.join(',')) {
      if (productId === WATER_HEATER_PRODUCT_ID) {
        return `热水器 ${WATER_HEATER_PRODUCT_ID} 的故障码顺序必须保持 ${WATER_HEATER_LABEL_ORDER.join(
          ',',
        )}，不能并入顺序为 ${actual.join(',') || '空'} 的故障组`;
      }
      return `${productId} 的位图顺序是 ${labels.join(',')}，与故障组的 ${actual.join(',') || '空'} 不一致`;
    }
  }
  for (const code of codes) {
    const labels = byCode[code.code];
    if (!labels?.includes(code.label)) {
      if (productId === WATER_HEATER_PRODUCT_ID) {
        return `不能为热水器 ${WATER_HEATER_PRODUCT_ID} 写入位图之外的故障码 ${code.code}/${code.label}，顺序必须保持 ${WATER_HEATER_LABEL_ORDER.join(
          ',',
        )}`;
      }
      return `不能把位图之外的故障码 ${code.code}/${code.label} 写入 ${productId}`;
    }
  }
  return null;
}

export async function ensureFaultCodeGroups(prisma: PrismaClient): Promise<{ created: number }> {
  const [definitions, groups] = await Promise.all([
    prisma.faultCodeDefinition.findMany(),
    prisma.faultCodeGroup.findMany({ include: { members: true, codes: true } }),
  ]);
  const assigned = new Set(groups.flatMap((group) => group.members.map((member) => member.productId)));
  const byProduct = new Map<string, DictionaryCode[]>();
  for (const row of definitions) {
    if (assigned.has(row.productId)) continue;
    const list = byProduct.get(row.productId) ?? [];
    list.push(toDictionaryCode(row));
    byProduct.set(row.productId, list);
  }
  const usedNames = new Set(groups.map((group) => group.name));
  const signatureToGroup = new Map(
    groups.map((group) => [dictionarySignature(group.codes.map(toDictionaryCode)), group]),
  );
  let created = 0;
  for (const cluster of clusterBySignature(
    [...byProduct.entries()].map(([productId, codes]) => ({ productId, codes })),
  )) {
    const signature = dictionarySignature(cluster.codes);
    const existing = signatureToGroup.get(signature);
    if (existing) {
      await prisma.faultCodeGroupMember.createMany({
        data: cluster.productIds.map((productId) => ({ groupId: existing.id, productId })),
      });
      continue;
    }
    const name = uniqueName(suggestGroupName(cluster.productIds, cluster.codes), usedNames);
    await prisma.faultCodeGroup.create({
      data: {
        name,
        members: { create: cluster.productIds.map((productId) => ({ productId })) },
        codes: { create: cluster.codes.map(codeCreate) },
      },
    });
    created += 1;
  }
  return { created };
}

function compareCodes(a: DictionaryCode, b: DictionaryCode): number {
  return a.code.localeCompare(b.code) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
}

function toDictionaryCode(row: {
  code: string;
  label: string;
  sortOrder: number;
  symptom: string | null;
  cause: string | null;
  suggestedAction: string | null;
  countInQualityRate: boolean;
  notifyAftersales: boolean;
}): DictionaryCode {
  return {
    code: row.code,
    label: row.label,
    sortOrder: row.sortOrder,
    symptom: row.symptom,
    cause: row.cause,
    suggestedAction: row.suggestedAction,
    countInQualityRate: row.countInQualityRate,
    notifyAftersales: row.notifyAftersales,
  };
}

function codeCreate(code: DictionaryCode): Prisma.FaultCodeGroupCodeCreateWithoutGroupInput {
  return {
    code: code.code,
    label: code.label,
    sortOrder: code.sortOrder,
    symptom: code.symptom,
    cause: code.cause,
    suggestedAction: code.suggestedAction,
    countInQualityRate: code.countInQualityRate,
    notifyAftersales: code.notifyAftersales,
  };
}

function uniqueName(base: string, used: Set<string>): string {
  const trimmed = base.slice(0, 128);
  if (!used.has(trimmed)) {
    used.add(trimmed);
    return trimmed;
  }
  let index = 2;
  while (used.has(`${trimmed.slice(0, 120)} ${index}`)) index += 1;
  const name = `${trimmed.slice(0, 120)} ${index}`;
  used.add(name);
  return name;
}
