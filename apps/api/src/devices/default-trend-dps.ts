/**
 * Product DP codes to chart before falling back to the last 7 days' top 3
 * numeric reports. Leave a product out until its 常用 DP are agreed.
 */
export const DEFAULT_TREND_DPS: Record<string, readonly string[]> = {};

export function defaultTrendDps(productId: string): string[] {
  return [...(DEFAULT_TREND_DPS[productId] ?? [])];
}
