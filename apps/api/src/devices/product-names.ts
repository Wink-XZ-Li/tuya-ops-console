import { readRepoJson } from './schema-files';

type SchemaInventory = {
  products: Array<{ productId: string; name: string }>;
};

const inventory = readRepoJson<SchemaInventory>('schema-inventory.json');

/** Product display names from the schema export inventory. */
export const PRODUCT_NAMES: Record<string, string> = Object.fromEntries(
  inventory.products.map((product) => [product.productId, product.name]),
);

export const PRODUCT_IDS = inventory.products.map((product) => product.productId);

export function getProductName(productId: string): string | undefined {
  return PRODUCT_NAMES[productId];
}

export function formatProductLabel(productId: string): string {
  const name = PRODUCT_NAMES[productId];
  return name ? `${name}（${productId}）` : productId;
}
