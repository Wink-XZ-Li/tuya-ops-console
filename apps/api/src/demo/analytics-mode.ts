import type { AppProfile } from '../config/runtime-profile';

/** Request header. Express lowercases it; comparisons stay case-insensitive. */
export const DEMO_ANALYTICS_HEADER = 'x-demo-analytics';

export type AnalyticsDataMode = 'live' | 'virtual';

export type AnalyticsModeDecision = {
  mode: AnalyticsDataMode;
  /** Production was asked for virtual and the request was dropped. */
  virtualIgnored: boolean;
};

export function parseDemoAnalyticsHeader(
  header?: string | string[],
): 'virtual' | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  return raw?.trim().toLowerCase() === 'virtual' ? 'virtual' : undefined;
}

/**
 * Virtual charts are opt-in and demo-profile only.
 * Production always stays on live. There is no quota-exhausted fallback.
 */
export function resolveAnalyticsDataMode(input: {
  profile: AppProfile;
  headerValue?: string | string[];
  envValue?: string;
}): AnalyticsModeDecision {
  const header = parseDemoAnalyticsHeader(input.headerValue);
  const env = (input.envValue ?? '').trim().toLowerCase();
  const requested = header === 'virtual' || env === 'virtual';
  if (input.profile === 'production') {
    return { mode: 'live', virtualIgnored: requested };
  }
  return { mode: requested ? 'virtual' : 'live', virtualIgnored: false };
}
