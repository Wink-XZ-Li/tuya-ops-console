import { buildConnectivityTimeline } from './connectivity';

describe('buildConnectivityTimeline', () => {
  const from = new Date('2026-10-16T00:00:00.000Z');
  const to = new Date('2026-10-23T00:00:00.000Z');

  it('covers a window with no events as one unknown stretch', () => {
    const built = buildConnectivityTimeline({ from, to, prior: null, events: [] });
    expect(built.segments).toEqual([
      { state: 'unknown', from: from.toISOString(), to: to.toISOString() },
    ]);
  });

  it('carries the last event before the window, then splits on offline and online', () => {
    const built = buildConnectivityTimeline({
      from,
      to,
      prior: { t: Date.parse('2026-10-15T00:00:00.000Z'), bizCode: 'deviceOnline' },
      events: [
        { t: Date.parse('2026-10-20T00:00:00.000Z'), bizCode: 'offline' },
        { t: Date.parse('2026-10-20T02:00:00.000Z'), bizCode: 'deviceOnline' },
      ],
    });

    expect(built.segments).toEqual([
      { state: 'online', from: '2026-10-16T00:00:00.000Z', to: '2026-10-20T00:00:00.000Z' },
      { state: 'offline', from: '2026-10-20T00:00:00.000Z', to: '2026-10-20T02:00:00.000Z' },
      { state: 'online', from: '2026-10-20T02:00:00.000Z', to: '2026-10-23T00:00:00.000Z' },
    ]);
  });

  it('keeps the leading stretch unknown until the first in-window event', () => {
    const built = buildConnectivityTimeline({
      from,
      to,
      prior: null,
      events: [{ t: Date.parse('2026-10-18T12:00:00.000Z'), bizCode: 'online' }],
    });

    expect(built.segments.map((segment) => segment.state)).toEqual(['unknown', 'online']);
    expect(built.segments[0]).toMatchObject({
      from: '2026-10-16T00:00:00.000Z',
      to: '2026-10-18T12:00:00.000Z',
    });
  });

  it('merges repeated same-state events and ignores points outside the window', () => {
    const built = buildConnectivityTimeline({
      from,
      to,
      prior: { t: Date.parse('2026-10-01T00:00:00.000Z'), bizCode: 'offline' },
      events: [
        { t: Date.parse('2026-10-10T00:00:00.000Z'), bizCode: 'online' },
        { t: Date.parse('2026-10-17T00:00:00.000Z'), bizCode: 'deviceOffline' },
        { t: Date.parse('2026-10-17T01:00:00.000Z'), bizCode: 'offline' },
        { t: Date.parse('2026-10-24T00:00:00.000Z'), bizCode: 'online' },
      ],
    });

    expect(built.segments).toEqual([
      { state: 'offline', from: '2026-10-16T00:00:00.000Z', to: '2026-10-23T00:00:00.000Z' },
    ]);
  });
});
