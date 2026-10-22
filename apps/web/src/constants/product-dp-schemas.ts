import schemas from '../../../../PRODUCT_DP_SCHEMAS.json';

/** Product DP schemas from the Tuya 功能定义 export at the repo root. */
export type ProductDp = {
  id: number;
  code: string;
  name: string;
  mode: string;
  type: string;
  values?: Record<string, unknown> | null;
};

export const PRODUCT_DP_SCHEMAS = schemas as Record<string, ProductDp[]>;

export function getProductDps(productId: string): ProductDp[] {
  return PRODUCT_DP_SCHEMAS[productId] ?? [];
}

export function formatProductDpLabel(dp: ProductDp): string {
  return `${dp.id} · ${dp.code}（${dp.name}）`;
}
