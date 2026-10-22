import { Prisma, PrismaClient } from '@prisma/client';
import {
  getFaultMeaning,
  PRODUCT_FAULT_BITMAP_LABELS,
} from '../devices/product-fault-schemas';
import type { FaultMeaning } from '../devices/product-fault-meanings';

/** 西屋即热式电热水器-旋钮款。位图顺序固定为 E1,E3,E4,E2。 */
export const WATER_HEATER_PRODUCT_ID = 'nohrp3vbmef7vxvx';
export const WATER_HEATER_FAULT_CODE = 'fault';
export const WATER_HEATER_LABEL_ORDER = ['E1', 'E3', 'E4', 'E2'] as const;

export type FaultCodeSeedSummary = {
  total: number;
  withMeaning: number;
  withoutMeaning: number;
};

export type FaultCodeSeedRow = {
  productId: string;
  code: string;
  label: string;
  sortOrder: number;
  symptom: string | null;
  cause: string | null;
  suggestedAction: string | null;
  countInQualityRate: boolean;
  notifyAftersales: boolean;
  meaning: FaultMeaning | undefined;
};

export type BitmapSlot =
  | { kind: 'free' }
  | { kind: 'locked'; index: number }
  | { kind: 'rejected' };

type DictionaryRow = {
  code: string;
  label: string;
  sortOrder: number;
};

/**
 * 按产品位图顺序播种 FaultCodeDefinition。
 * 有 getFaultMeaning 的 productId+label 回填 symptom / suggestedAction，有 cause 才写 cause。
 * 没有含义的 PID（含热水器）不写占位文案。
 * 重复执行时刷新已匹配文案和 sortOrder，不改 countInQualityRate / notifyAftersales。
 */
export function buildFaultCodeSeedRows(): FaultCodeSeedRow[] {
  assertWaterHeaterBitmapSource();
  const rows: FaultCodeSeedRow[] = [];
  for (const [productId, byCode] of Object.entries(PRODUCT_FAULT_BITMAP_LABELS)) {
    for (const [code, labels] of Object.entries(byCode)) {
      labels.forEach((label, sortOrder) => {
        const meaning = getFaultMeaning(productId, label);
        rows.push({
          productId,
          code,
          label,
          sortOrder,
          symptom: meaning?.symptom ?? null,
          cause: meaning?.cause ?? null,
          suggestedAction: meaning?.suggestedAction ?? null,
          countInQualityRate: true,
          notifyAftersales: false,
          meaning,
        });
      });
    }
  }
  return rows;
}

export function assertWaterHeaterBitmapSource(): void {
  const byCode = PRODUCT_FAULT_BITMAP_LABELS[WATER_HEATER_PRODUCT_ID];
  if (!byCode?.[WATER_HEATER_FAULT_CODE]) {
    throw new Error(`缺少热水器 ${WATER_HEATER_PRODUCT_ID} 的 fault 位图`);
  }
  const codes = Object.keys(byCode);
  if (codes.length !== 1 || codes[0] !== WATER_HEATER_FAULT_CODE) {
    throw new Error(
      `热水器 ${WATER_HEATER_PRODUCT_ID} 的故障 DP 必须只有 fault，实际为 ${codes.join(',')}`,
    );
  }
  assertWaterHeaterLabelOrder(byCode[WATER_HEATER_FAULT_CODE]);
}

export function assertWaterHeaterLabelOrder(labels: readonly string[]): void {
  const expected = WATER_HEATER_LABEL_ORDER;
  const same =
    labels.length === expected.length && labels.every((label, index) => label === expected[index]);
  if (!same) {
    throw new Error(
      `热水器 ${WATER_HEATER_PRODUCT_ID} 的 label 顺序必须为 ${expected.join(',')}，实际为 ${
        labels.join(',') || '（空）'
      }`,
    );
  }
}

export function bitmapSlot(productId: string, code: string, label: string): BitmapSlot {
  const byCode = PRODUCT_FAULT_BITMAP_LABELS[productId];
  if (!byCode) return { kind: 'free' };
  const labels = byCode[code];
  if (!labels) return { kind: 'rejected' };
  const index = labels.indexOf(label);
  if (index < 0) return { kind: 'rejected' };
  return { kind: 'locked', index };
}

export async function upsertFaultCodeDefinitions(
  prisma: PrismaClient,
): Promise<FaultCodeSeedSummary> {
  const rows = buildFaultCodeSeedRows();
  let withMeaning = 0;
  for (const row of rows) {
    const copy = meaningUpdate(row.meaning);
    if (row.meaning) withMeaning += 1;
    await prisma.faultCodeDefinition.upsert({
      where: {
        productId_code_label: {
          productId: row.productId,
          code: row.code,
          label: row.label,
        },
      },
      create: {
        productId: row.productId,
        code: row.code,
        label: row.label,
        sortOrder: row.sortOrder,
        symptom: row.symptom,
        cause: row.cause,
        suggestedAction: row.suggestedAction,
        countInQualityRate: true,
        notifyAftersales: false,
      },
      update: {
        sortOrder: row.sortOrder,
        ...copy,
      },
    });
  }
  return {
    total: rows.length,
    withMeaning,
    withoutMeaning: rows.length - withMeaning,
  };
}

export async function verifyWaterHeaterDictionary(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.faultCodeDefinition.findMany({
    where: { productId: WATER_HEATER_PRODUCT_ID },
    select: { code: true, label: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
  const labels = waterHeaterLabels(rows);
  assertWaterHeaterLabelOrder(labels);
  const extras = rows.filter(
    (row) =>
      row.code !== WATER_HEATER_FAULT_CODE ||
      !WATER_HEATER_LABEL_ORDER.includes(row.label as (typeof WATER_HEATER_LABEL_ORDER)[number]),
  );
  if (extras.length > 0) {
    throw new Error(
      `热水器 ${WATER_HEATER_PRODUCT_ID} 含位图之外的故障码：${extras
        .map((row) => `${row.code}/${row.label}`)
        .join(',')}`,
    );
  }
  return labels;
}

function waterHeaterLabels(rows: DictionaryRow[]): string[] {
  return rows
    .filter((row) => row.code === WATER_HEATER_FAULT_CODE)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((row) => row.label);
}

function meaningUpdate(
  meaning: FaultMeaning | undefined,
): Prisma.FaultCodeDefinitionUncheckedUpdateInput {
  if (!meaning) return {};
  return {
    symptom: meaning.symptom,
    ...(meaning.suggestedAction ? { suggestedAction: meaning.suggestedAction } : {}),
    ...(meaning.cause ? { cause: meaning.cause } : {}),
  };
}
