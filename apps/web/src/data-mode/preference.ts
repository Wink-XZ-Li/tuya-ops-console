export type DataModeChoice = 'virtual' | 'live';

export type DataModePreference = {
  mode: DataModeChoice;
  /** 用户点过开关。为 true 且 mode 为 live 时，额度错误不再把开关改回虚拟。 */
  manual: boolean;
  quotaExhausted: boolean;
};

export const DATA_MODE_STORAGE_KEY = 'tuya-ops.dataMode';
export const DATA_MODE_EVENT = 'tuya-ops-data-mode';

const DEFAULT_PREFERENCE: DataModePreference = {
  mode: 'live',
  manual: false,
  quotaExhausted: false,
};

export function readDataMode(): DataModePreference {
  try {
    const raw = localStorage.getItem(DATA_MODE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCE };
    const parsed = JSON.parse(raw) as Partial<DataModePreference>;
    const mode = parsed.mode === 'virtual' || parsed.mode === 'live' ? parsed.mode : 'live';
    return {
      mode,
      manual: Boolean(parsed.manual),
      quotaExhausted: Boolean(parsed.quotaExhausted),
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

export function writeDataMode(pref: DataModePreference): DataModePreference {
  const next: DataModePreference = {
    mode: pref.mode === 'virtual' ? 'virtual' : 'live',
    manual: Boolean(pref.manual),
    quotaExhausted: Boolean(pref.quotaExhausted),
  };
  localStorage.setItem(DATA_MODE_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(DATA_MODE_EVENT));
  return next;
}

export function reconcileDataMode(
  current: DataModePreference,
  meta: { virtual?: boolean; quotaExhausted?: boolean },
): DataModePreference {
  const quotaExhausted = current.quotaExhausted || Boolean(meta.quotaExhausted);
  const keepManualLive = current.manual && current.mode === 'live';
  if (meta.quotaExhausted && !keepManualLive) {
    if (current.manual && current.mode === 'virtual') {
      return { ...current, quotaExhausted: true };
    }
    return { mode: 'virtual', manual: false, quotaExhausted: true };
  }
  return { ...current, quotaExhausted };
}

export type AnalyticsDataMeta = {
  virtual?: boolean;
  quotaExhausted?: boolean;
  virtualReason?: 'requested' | 'quota-fallback' | null;
  dataMode?: 'live' | 'virtual';
};
