export type PropertyCatalogItem = {
  code: string;
  name?: string;
  /** Operator alias wins over the product name. */
  alias?: string;
  id?: number;
  type?: string;
  values?: Record<string, unknown> | null;
};

export type EventPropertyLine = {
  name: string;
  value: string;
};

export function eventPropertyLines(
  payload: unknown,
  catalog: PropertyCatalogItem[],
): EventPropertyLine[] {
  const byCode = new Map(catalog.map((item) => [item.code, item]));
  const byId = new Map(
    catalog.filter((item) => item.id != null).map((item) => [String(item.id), item]),
  );
  return extractPairs(payload).map((pair) => {
    const item = byCode.get(pair.code) ?? (pair.dpId ? byId.get(pair.dpId) : undefined);
    return {
      name: item?.alias || item?.name || pair.code,
      value: formatDpValue(item, pair.value),
    };
  });
}

type Pair = { code: string; dpId?: string; value: unknown };

function extractPairs(payload: unknown): Pair[] {
  const root = asRecord(payload);
  if (!root) return [];
  const fromStatus = pairsFromArray(root.status);
  if (fromStatus.length) return fromStatus;
  const fromProperties = pairsFromArray(root.properties);
  if (fromProperties.length) return fromProperties;
  if (root.properties && typeof root.properties === 'object' && !Array.isArray(root.properties)) {
    return Object.entries(root.properties as Record<string, unknown>).map(([code, value]) => ({
      code,
      value,
    }));
  }
  const nested = asRecord(root.data);
  if (nested) return extractPairs(nested);
  return [];
}

function pairsFromArray(value: unknown): Pair[] {
  if (!Array.isArray(value)) return [];
  const out: Pair[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || !('code' in item)) continue;
    const row = item as { code?: unknown; dpId?: unknown; value?: unknown };
    const code = String(row.code ?? '').trim();
    if (!code) continue;
    out.push({
      code,
      dpId: row.dpId != null ? String(row.dpId) : undefined,
      value: row.value,
    });
  }
  return out;
}

function formatDpValue(item: PropertyCatalogItem | undefined, value: unknown): string {
  const kind = String(item?.values?.type ?? item?.type ?? '');
  if (kind === 'bool' || typeof value === 'boolean') {
    if (value === true || value === 1 || value === 'true' || value === '1') return '开';
    if (value === false || value === 0 || value === 'false' || value === '0') return '关';
  }
  const labels = bitmapLabels(item);
  if (labels && (kind === 'bitmap' || typeof value === 'number')) {
    const names = decodeBitmap(value, labels);
    if (names.length) return names.join('+');
  }
  if (typeof value === 'number' && (kind === 'value' || kind === 'integer')) {
    const scale = Number(item?.values?.scale ?? 0);
    const unit = item?.values?.unit != null ? String(item.values.unit) : '';
    const real = scale > 0 ? value / 10 ** scale : value;
    const text = Number.isInteger(real) ? String(real) : String(Number(real.toFixed(Math.min(scale, 6))));
    return unit ? `${text}${unit}` : text;
  }
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function bitmapLabels(item: PropertyCatalogItem | undefined): string[] | null {
  const label = item?.values?.label;
  return Array.isArray(label) && label.every((entry) => typeof entry === 'string')
    ? (label as string[])
    : null;
}

function decodeBitmap(value: unknown, labels: string[]): string[] {
  let n: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value)) n = value >>> 0;
  else if (typeof value === 'string' && /^\d+$/.test(value.trim())) n = Number(value.trim()) >>> 0;
  if (n == null || n === 0) return [];
  const names: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (n & (1 << i)) names.push(labels[i]);
  }
  return names;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
