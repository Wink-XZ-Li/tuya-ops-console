import { buildChangeMarkers, firmwareMarkerFromPayload } from './change-markers';

describe('change markers', () => {
  const from = new Date('2026-10-16T00:00:00.000Z');
  const to = new Date('2026-10-23T00:00:00.000Z');

  it('marks a finished upgrade and a version change, and ignores progress ticks', () => {
    expect(
      firmwareMarkerFromPayload(
        { bizData: { upgradeStatus: 2, progress: 40, version: '1.0.2' } },
        new Date('2026-10-20T00:00:00.000Z'),
      ),
    ).toBeNull();

    const built = buildChangeMarkers({
      from,
      to,
      firmwareEvents: [
        {
          eventTime: new Date('2026-10-20T00:00:00.000Z'),
          payload: { bizData: { upgradeStatus: 3, oldVersion: '1.0.0', version: '1.0.2' } },
        },
        {
          eventTime: new Date('2026-10-20T00:00:00.000Z'),
          payload: { upgradeStatus: '3', old_version: '1.0.0', new_version: '1.0.2' },
        },
        {
          eventTime: new Date('2026-10-21T00:00:00.000Z'),
          payload: { data: { oldVersion: '1.0.2', firmwareVersion: '1.0.3' } },
        },
        {
          eventTime: new Date('2026-10-18T00:00:00.000Z'),
          payload: { upgradeStatus: 2, progress: 80 },
        },
        {
          eventTime: new Date('2026-10-10T00:00:00.000Z'),
          payload: { upgradeStatus: 3, version: '0.9.0' },
        },
      ],
      commands: [
        { createdAt: new Date('2026-10-22T03:00:00.000Z'), code: 'switch', value: true, success: true },
        { createdAt: new Date('2026-10-22T04:00:00.000Z'), code: 'temp_set', value: 42, success: false },
      ],
    });

    expect(built.markers).toEqual([
      {
        t: '2026-10-20T00:00:00.000Z',
        kind: 'firmware',
        label: '固件升级',
        detail: '1.0.0 → 1.0.2',
      },
      {
        t: '2026-10-21T00:00:00.000Z',
        kind: 'firmware',
        label: '固件升级',
        detail: '1.0.2 → 1.0.3',
      },
      {
        t: '2026-10-22T03:00:00.000Z',
        kind: 'command',
        label: '指令 switch',
        detail: 'true',
      },
    ]);
  });

  it('returns no markers when nothing completed', () => {
    expect(
      buildChangeMarkers({
        from,
        to,
        firmwareEvents: [],
        commands: [{ createdAt: new Date('2026-10-22T03:00:00.000Z'), code: 'switch', value: false, success: false }],
      }),
    ).toEqual({ markers: [] });
  });
});
