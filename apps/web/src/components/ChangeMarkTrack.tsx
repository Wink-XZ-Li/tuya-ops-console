import { useEffect, useState } from 'react';
import { api, qs } from '../api/client';

export type ChangeMarker = {
  t: string;
  kind: 'firmware' | 'command';
  label: string;
  detail?: string | null;
};

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function useChangeMarkers(deviceId: string, from: string, to: string, enabled: boolean): ChangeMarker[] {
  const [markers, setMarkers] = useState<ChangeMarker[]>([]);

  useEffect(() => {
    if (!enabled || !from || !to) {
      setMarkers([]);
      return;
    }
    let cancelled = false;
    api<{ markers?: ChangeMarker[] }>(
      `/api/devices/${encodeURIComponent(deviceId)}/change-markers${qs({ from, to })}`,
    )
      .then((res) => {
        if (!cancelled) setMarkers(Array.isArray(res?.markers) ? res.markers : []);
      })
      .catch(() => {
        if (!cancelled) setMarkers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, enabled, from, to]);

  return markers;
}

export function changeMarkerText(marker: ChangeMarker): string {
  const detail = marker.detail?.trim();
  return [marker.label, detail || null, formatShanghai(marker.t)].filter(Boolean).join(' · ');
}

export function markerLeftPercent(t: string, from: string, to: string): number | null {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const time = Date.parse(t);
  if (![start, end, time].every(Number.isFinite) || end <= start) return null;
  if (time < start || time > end) return null;
  return ((time - start) / (end - start)) * 100;
}

/** Vertical marks over a bar that already spans [from, to]. Renders nothing when there are no marks. */
export function ChangeMarkTrack({
  markers,
  from,
  to,
}: {
  markers: ChangeMarker[];
  from: string;
  to: string;
}) {
  const [hover, setHover] = useState<{ text: string; left: number } | null>(null);
  const placed = markers
    .map((marker) => ({ marker, left: markerLeftPercent(marker.t, from, to) }))
    .filter((item): item is { marker: ChangeMarker; left: number } => item.left != null);
  if (placed.length === 0) return null;

  return (
    <div className="change-marks">
      {placed.map(({ marker, left }) => (
        <div
          key={`${marker.kind}-${marker.t}-${marker.label}`}
          className={`change-mark is-${marker.kind}`}
          data-kind={marker.kind}
          data-t={marker.t}
          style={{ left: `${left}%` }}
          onMouseEnter={(event) => {
            const host = event.currentTarget.parentElement?.getBoundingClientRect();
            const slot = event.currentTarget.getBoundingClientRect();
            const center = host ? slot.left - host.left + slot.width / 2 : left;
            setHover({ text: changeMarkerText(marker), left: center });
          }}
          onMouseLeave={() => setHover(null)}
        />
      ))}
      {hover && (
        <div className="trend-tip change-mark-tip" role="tooltip" style={{ left: hover.left }}>
          {hover.text}
        </div>
      )}
    </div>
  );
}

export function changeMarkerLegend(markers: ChangeMarker[]): string | null {
  if (markers.length === 0) return null;
  const kinds = new Set(markers.map((marker) => marker.kind));
  const parts = [kinds.has('firmware') ? '固件变更' : '', kinds.has('command') ? '成功指令' : ''].filter(Boolean);
  return `竖线：${parts.join('、')}。悬停查看时间，不表示原因。`;
}

function formatShanghai(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  const shifted = new Date(parsed + SHANGHAI_OFFSET_MS);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${month}-${day} ${hour}:${minute}`;
}
