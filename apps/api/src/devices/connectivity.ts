/** Tuya connectivity messages stored on DeviceEvent. Same codes that flip Device.onlineStatus. */
export const CONNECTIVITY_BIZ_CODES = ['online', 'deviceOnline', 'offline', 'deviceOffline'] as const;

export type ConnectivityState = 'online' | 'offline' | 'unknown';

export type ConnectivityPoint = { t: number; bizCode: string };

export type ConnectivitySegment = {
  state: ConnectivityState;
  from: string;
  to: string;
};

export function connectivityState(bizCode: string): ConnectivityState | null {
  if (bizCode === 'online' || bizCode === 'deviceOnline') return 'online';
  if (bizCode === 'offline' || bizCode === 'deviceOffline') return 'offline';
  return null;
}

/**
 * Paint [from, to] from connectivity events.
 * The last event before `from` carries its state in; with no prior event the leading stretch is unknown.
 * Adjacent stretches of the same state collapse. No fake online/offline is invented from alerts or the current snapshot.
 */
export function buildConnectivityTimeline(input: {
  from: Date;
  to: Date;
  prior: ConnectivityPoint | null;
  events: ConnectivityPoint[];
}): { segments: ConnectivitySegment[] } {
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return { segments: [] };
  }

  const points = input.events
    .filter((event) => event.t >= fromMs && event.t <= toMs && connectivityState(event.bizCode))
    .sort((a, b) => a.t - b.t);

  let state: ConnectivityState = 'unknown';
  if (input.prior && input.prior.t < fromMs) {
    state = connectivityState(input.prior.bizCode) ?? 'unknown';
  }

  const raw: Array<{ state: ConnectivityState; from: number; to: number }> = [];
  let cursor = fromMs;
  for (const point of points) {
    const next = connectivityState(point.bizCode);
    if (!next) continue;
    if (point.t > cursor) {
      raw.push({ state, from: cursor, to: point.t });
    }
    state = next;
    cursor = Math.max(cursor, point.t);
  }
  if (toMs > cursor) {
    raw.push({ state, from: cursor, to: toMs });
  }

  const merged: Array<{ state: ConnectivityState; from: number; to: number }> = [];
  for (const segment of raw) {
    if (segment.to <= segment.from) continue;
    const last = merged[merged.length - 1];
    if (last && last.state === segment.state && last.to === segment.from) {
      last.to = segment.to;
    } else {
      merged.push({ ...segment });
    }
  }

  return {
    segments: merged.map((segment) => ({
      state: segment.state,
      from: new Date(segment.from).toISOString(),
      to: new Date(segment.to).toISOString(),
    })),
  };
}
