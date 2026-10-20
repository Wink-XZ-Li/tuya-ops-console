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
    const water = deriveFaultFields({ fault: 2 }, { productId: 'nohrp3vbmef7vxvx' });
    expect(water.faultInfo).toBe('fault=2｜E3');

    const e1 = deriveFaultFields({ fault: 1 }, { productId: 'nohrp3vbmef7vxvx' });
    expect(e1.faultInfo).toBe('fault=1｜E1');

    // AC: [E1, E2, E3, E4] — value 2 = bit1 → E2
    const ac = deriveFaultFields({ fault: 2 }, { productId: 'uhmj5b0ba31zpme6' });
    expect(ac.faultInfo).toBe('fault=2｜E2');

    // 90wi2aimyqstn9qc 暂用 T15 位图：fault=32 → bit5 → E5。
    const wx2 = deriveFaultFields({ fault: 32 }, { productId: '90wi2aimyqstn9qc' });
    expect(wx2.faultInfo).toBe('fault=32｜E5');
    const wx2both = deriveFaultFields({ fault: 33 }, { productId: '90wi2aimyqstn9qc' });
    expect(wx2both.faultInfo).toBe('fault=33｜E0+E5');
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

  it('does not treat a missing fault bitmap as a fault', () => {
    const out = deriveFaultFields({ switch: true, fault: 0 });
    expect(out.faultStatus).toBe(DeviceFaultStatus.normal);
  });

  it('keeps fault status from open fault-category alerts when the bitmap is empty', () => {
    const out = deriveFaultFields(
      { switch: true },
      { openFaultAlerts: [{ faultCode: 'E1', title: '故障 E1' }] },
    );
    expect(out.faultStatus).toBe(DeviceFaultStatus.fault);
    expect(out.faultInfo).toBe('E1');
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
