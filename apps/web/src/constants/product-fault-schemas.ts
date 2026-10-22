import { PRODUCT_DP_SCHEMAS, ProductDp } from './product-dp-schemas';

function bitmapLabels(dp: ProductDp): string[] | null {
  if (dp.type !== 'fault' && dp.type !== 'bitmap') return null;
  const label = dp.values?.label;
  if (!Array.isArray(label) || label.length === 0) return null;
  if (!label.every((item) => typeof item === 'string')) return null;
  return label;
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

function decodeBitmapLabels(value: number, labels: string[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (value & (1 << i)) names.push(labels[i]);
  }
  return names;
}

/**
 * Enrich stored faultInfo like `fault=2` → `fault=2｜E3` using product schema.
 * Leaves already-mapped or non-numeric entries as-is.
 */
export function formatFaultInfoDisplay(
  productId: string | null | undefined,
  faultInfo: string | null | undefined,
): string {
  if (!faultInfo) return '—';
  if (!productId) return faultInfo;

  return faultInfo
    .split(';')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed || trimmed.includes('｜')) return trimmed;
      const m = /^([^=]+)=(.+)$/.exec(trimmed);
      if (!m) return trimmed;
      const [, code, raw] = m;
      const labels = PRODUCT_FAULT_BITMAP_LABELS[productId]?.[code];
      if (!labels?.length) return trimmed;
      if (!/^\d+$/.test(raw.trim())) return trimmed;
      const names = decodeBitmapLabels(Number(raw.trim()), labels);
      if (names.length === 0) return trimmed;
      return `${code}=${raw.trim()}｜${names.join('+')}`;
    })
    .filter(Boolean)
    .join('; ');
}
