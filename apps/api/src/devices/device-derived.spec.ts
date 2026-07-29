import {
  asRecord,
  collectFaultEntries,
  deriveFaultFields,
  deriveSignalStrength,
  extractStatusUpdates,
  formatLocationText,
  statusFromPairs,
} from './device-derived';
import { DeviceFaultStatus } from '@prisma/client';

describe('device-derived', () => {
  it('derives fault from fault-like DP', () => {
    const out = deriveFaultFields({ fault: 1, switch: true });
    expect(out.faultStatus).toBe(DeviceFaultStatus.fault);
    expect(out.faultInfo).toContain('fault=1');
  });

  it('maps bitmap fault labels from product schema', () => {
    // nohrp3vbmef7vxvx: labels [E1, E3, E4, E2] — value 2 = bit1 → E3
    const water = deriveFaultFields({ fault: 2 }, [], 'nohrp3vbmef7vxvx');
    expect(water.faultInfo).toBe('fault=2｜E3');

    const e1 = deriveFaultFields({ fault: 1 }, [], 'nohrp3vbmef7vxvx');
    expect(e1.faultInfo).toBe('fault=1｜E1');

    // AC: [E1, E2, E3, E4] — value 2 = bit1 → E2
    const ac = deriveFaultFields({ fault: 2 }, [], 'uhmj5b0ba31zpme6');
    expect(ac.faultInfo).toBe('fault=2｜E2');
  });

  it('parses IoT Core properties array into status updates', () => {
    const updates = extractStatusUpdates({
      dataId: '000657B6A42A34C79B47204F6A050002',
      properties: [
        { code: 'hw_version', dpId: 198, time: 1, value: 1 },
        { code: 'heating', dpId: 101, time: 1, value: true },
        { code: 'temp_set', dpId: 9, time: 1, value: 33 },
      ],
    });
    expect(updates).toEqual({
      hw_version: 1,
      heating: true,
      temp_set: 33,
    });
    expect(updates.dataId).toBeUndefined();
  });

  it('derives normal when status present without fault', () => {
    const out = deriveFaultFields({ switch: true });
    expect(out.faultStatus).toBe(DeviceFaultStatus.normal);
  });

  it('picks signal strength', () => {
    expect(deriveSignalStrength({ rssi: -70, switch: true })).toBe('-70');
  });

  it('formats location', () => {
    expect(formatLocationText('22.6', '113.4')).toBe('22.6,113.4');
  });

  it('statusFromPairs and asRecord helpers', () => {
    expect(statusFromPairs([{ code: 'a', value: 1 }])).toEqual({ a: 1 });
    expect(asRecord({ x: 1 })).toEqual({ x: 1 });
    expect(collectFaultEntries({ fault: true, ok: 1 })).toHaveLength(1);
  });
});
