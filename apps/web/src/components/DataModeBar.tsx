import { useEffect, useState } from 'react';
import {
  AnalyticsDataMeta,
  DATA_MODE_EVENT,
  DataModeChoice,
  DataModePreference,
  readDataMode,
  reconcileDataMode,
  writeDataMode,
} from '../data-mode/preference';

export function useAnalyticsDataMode() {
  const [pref, setPref] = useState<DataModePreference>(() => readDataMode());

  useEffect(() => {
    function sync() {
      setPref(readDataMode());
    }
    window.addEventListener(DATA_MODE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DATA_MODE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function select(mode: DataModeChoice) {
    const next = writeDataMode({ ...readDataMode(), mode, manual: true });
    setPref(next);
    return next;
  }

  function accept(meta: AnalyticsDataMeta) {
    const next = reconcileDataMode(readDataMode(), meta);
    writeDataMode(next);
    setPref(next);
    return next;
  }

  return { pref, select, accept };
}

export function DataModeBar({
  mode,
  manual,
  quotaExhausted,
  showingVirtual,
  onSelect,
}: {
  mode: DataModeChoice;
  manual: boolean;
  quotaExhausted: boolean;
  showingVirtual: boolean;
  onSelect: (mode: DataModeChoice) => void;
}) {
  const pinnedLive = manual && mode === 'live' && showingVirtual;
  return (
    <div className="data-mode">
      {showingVirtual && quotaExhausted && (
        <div className="data-mode-banner" role="status">
          <div className="data-mode-banner-title">
            <span className="badge data-mode-badge">虚拟数据</span>
            <strong>试用套餐已用完，当前显示虚拟数据</strong>
          </div>
          <p>
            IoT Core 试用基础资源包当月额度已用完（28841004）。下面是约 1.2
            万台稳态机群的演示数字，刷新不会跳动。
          </p>
          {pinnedLive ? (
            <p>
              你已手动选择「真实」，这个选择会保留，不会自动改回「虚拟」。额度仍未恢复，本页暂时显示虚拟数字，避免整页报错。冷却期内不会反复请求涂鸦。
            </p>
          ) : (
            <p>
              检测到额度用完后会自动停在「虚拟」，并记在本机。手动改回「真实」会再请求一次并记住该选择；若仍失败，开关保持「真实」，页面继续显示这些数字，约
              15 分钟内不再请求涂鸦。
            </p>
          )}
        </div>
      )}
      {showingVirtual && !quotaExhausted && (
        <div className="data-mode-banner" role="status">
          <div className="data-mode-banner-title">
            <span className="badge data-mode-badge">虚拟数据</span>
            <strong>当前显示虚拟数据</strong>
          </div>
          <p>这是约 1.2 万台稳态机群的演示数字，不是涂鸦实时统计。刷新不会跳动。</p>
        </div>
      )}
      <div className="data-mode-row">
        <span className="data-mode-label">数据来源</span>
        <div className="data-mode-switch" role="group" aria-label="数据来源">
          <button
            type="button"
            className={mode === 'virtual' ? 'on' : undefined}
            aria-pressed={mode === 'virtual'}
            onClick={() => onSelect('virtual')}
          >
            虚拟
          </button>
          <button
            type="button"
            className={mode === 'live' ? 'on' : undefined}
            aria-pressed={mode === 'live'}
            onClick={() => onSelect('live')}
          >
            真实
          </button>
        </div>
        <p className="data-mode-note">
          自动：识别 28841004 或 trial quota is exhausted 后切到虚拟。手动选「真实」会保持，失败时降级为虚拟数字，且不再连刷涂鸦。
        </p>
      </div>
    </div>
  );
}
