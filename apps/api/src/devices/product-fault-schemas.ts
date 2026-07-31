/** Fault bitmap labels from product debug schemas (Pro_Key → code → labels). */
export const PRODUCT_FAULT_BITMAP_LABELS: Record<string, Record<string, string[]>> = {
  'uhmj5b0ba31zpme6': {
    'fault': ["E1", "E2", "E3", "E4"],
  },
  'nohrp3vbmef7vxvx': {
    'fault': ["E1", "E3", "E4", "E2"],
  },
  '7sylzgrdnnq2w5mo': {
    'fault': ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "EA", "Eb", "EF", "EL"],
  },
};

export function getFaultBitmapLabels(productId: string | undefined | null, code: string): string[] | null {
  if (!productId) return null;
  const labels = PRODUCT_FAULT_BITMAP_LABELS[productId]?.[code];
  return labels?.length ? labels : null;
}

