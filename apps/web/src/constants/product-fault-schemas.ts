/** Fault bitmap labels from product debug schemas (Pro_Key → code → labels). */
export const PRODUCT_FAULT_BITMAP_LABELS: Record<string, Record<string, string[]>> = {
  uhmj5b0ba31zpme6: {
    fault: ['E1', 'E2', 'E3', 'E4'],
  },
  nohrp3vbmef7vxvx: {
    fault: ['E1', 'E3', 'E4', 'E2'],
  },
  '7sylzgrdnnq2w5mo': {
    fault: ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'EA', 'Eb', 'EF', 'EL'],
  },
};

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
