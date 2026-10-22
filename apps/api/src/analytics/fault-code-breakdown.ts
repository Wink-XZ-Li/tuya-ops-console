export type ProductFaultCodeCount = {
  productId: string;
  faultCode: string;
  count: number;
};

/**
 * 按产品汇总区间新发。空 productId 是全机群合计，不参与，避免把不同 PID 的同一故障码加在一起。
 */
export function summarizeFaultCodesByProduct(
  rows: Array<{ productId: string; faultCode: string; newCount: number }>,
): ProductFaultCodeCount[] {
  const totals = new Map<string, ProductFaultCodeCount>();
  for (const row of rows) {
    if (!row.productId || row.newCount <= 0) continue;
    const key = `${row.productId}\0${row.faultCode}`;
    const existing = totals.get(key);
    if (existing) {
      existing.count += row.newCount;
    } else {
      totals.set(key, {
        productId: row.productId,
        faultCode: row.faultCode,
        count: row.newCount,
      });
    }
  }
  return [...totals.values()].sort((a, b) => {
    if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1;
    return b.count - a.count || a.faultCode.localeCompare(b.faultCode);
  });
}
