import { PRODUCT_DP_SCHEMAS, ProductDp } from './product-dp-schemas';

function bitmapLabels(dp: ProductDp): string[] | null {
  if (dp.type !== 'fault' && dp.type !== 'bitmap') return null;
  const label = dp.values?.label;
  if (!Array.isArray(label) || label.length === 0) return null;
  if (!label.every((item) => typeof item === 'string')) return null;
  return label as string[];
}

/** Fault bitmap labels taken from PRODUCT_DP_SCHEMAS.json (code → bit labels). */
export const PRODUCT_FAULT_BITMAP_LABELS: Record<string, Record<string, string[]>> =
  Object.fromEntries(
    Object.entries(PRODUCT_DP_SCHEMAS)
      .map(([productId, dps]) => {
        const byCode: Record<string, string[]> = {};
        for (const dp of dps) {
          const labels = bitmapLabels(dp);
          if (labels) byCode[dp.code] = labels;
        }
        return [productId, byCode] as const;
      })
      .filter(([, byCode]) => Object.keys(byCode).length > 0),
  );

/** 真实故障文案见 product-fault-meanings.ts（由面板工程收集）。 */
export { DEMO_FAULT_COPY, getFaultMeaning, PRODUCT_FAULT_FAMILY, FAULT_FAMILY_MEANINGS } from './product-fault-meanings';
export type { FaultMeaning, FaultFamilyId } from './product-fault-meanings';

export function getFaultBitmapLabels(productId: string | undefined | null, code: string): string[] | null {
  if (!productId) return null;
  const labels = PRODUCT_FAULT_BITMAP_LABELS[productId]?.[code];
  return labels?.length ? labels : null;
}

