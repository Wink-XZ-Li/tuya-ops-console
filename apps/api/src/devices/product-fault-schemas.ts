/** Fault bitmap labels from product debug schemas (Pro_Key → code → labels). */
export const PRODUCT_FAULT_BITMAP_LABELS: Record<string, Record<string, string[]>> = {
  'uhmj5b0ba31zpme6': {
    'fault': ["E1", "E2", "E3", "E4"],
  },
  'nohrp3vbmef7vxvx': {
    'fault': ["E1", "E3", "E4", "E2"],
  },
};

export function getFaultBitmapLabels(productId: string | undefined | null, code: string): string[] | null {
  if (!productId) return null;
  const labels = PRODUCT_FAULT_BITMAP_LABELS[productId]?.[code];
  return labels?.length ? labels : null;
}

