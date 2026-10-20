import {
  faultCodeReplacingBitLabel,
  planDeviceFaultBackfill,
  planMissingOpenFaultAlerts,
  renameBitAlertKey,
} from './backfill-fault-alerts';
import { PRODUCT_FAULT_BITMAP_LABELS } from '../devices/product-fault-schemas';

describe('faultCodeReplacingBitLabel', () => {
  const labels = PRODUCT_FAULT_BITMAP_LABELS['90wi2aimyqstn9qc'].fault;

  it('maps bit5 to E5 and rewrites the active key', () => {
    expect(labels).toEqual([
      'E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'EA', 'Eb', 'EF', 'EL',
    ]);
    expect(faultCodeReplacingBitLabel('bit5', labels)).toBe('E5');
    expect(renameBitAlertKey('dev:fault:fault:bit5', 'bit5', 'E5')).toBe('dev:fault:fault:E5');
    expect(faultCodeReplacingBitLabel('E5', labels)).toBeNull();
  });
});

describe('planDeviceFaultBackfill', () => {
  const opened = (id: string, iso: string) => ({ id, openedAt: new Date(iso) });

  it('closes every legacy row when the bitmap is clear', () => {
    const ops = planDeviceFaultBackfill({
      deviceId: 'dev1',
      productId: 'nohrp3vbmef7vxvx',
      statusJson: { fault: 0, switch: true },
      openAlerts: [opened('a', '2026-10-01T00:00:00Z'), opened('b', '2026-10-02T00:00:00Z')],
    });
    expect(ops).toEqual([
      { op: 'close', id: 'a' },
      { op: 'close', id: 'b' },
    ]);
    expect(JSON.stringify(ops)).not.toContain('faultCode');
  });

  it('closes rows when the product has no fault schema', () => {
    const ops = planDeviceFaultBackfill({
      deviceId: 'dev1',
      productId: 'qxjzruuqz40bty7e',
      statusJson: { switch_1: true },
      openAlerts: [opened('a', '2026-10-01T00:00:00Z')],
    });
    expect(ops).toEqual([{ op: 'close', id: 'a' }]);
  });

  it('keeps one survivor per set bit and closes the rest', () => {
    const ops = planDeviceFaultBackfill({
      deviceId: 'dev1',
      productId: 'uhmj5b0ba31zpme6',
      statusJson: { fault: 3 },
      openAlerts: [
        opened('c', '2026-10-03T00:00:00Z'),
        opened('a', '2026-10-01T00:00:00Z'),
        opened('b', '2026-10-02T00:00:00Z'),
      ],
    });
    const keeps = ops.filter((op) => op.op === 'keep');
    const closes = ops.filter((op) => op.op === 'close');
    expect(keeps.map((op) => (op.op === 'keep' ? op.faultCode : ''))).toEqual(['E1', 'E2']);
    expect(keeps.map((op) => (op.op === 'keep' ? op.id : ''))).toEqual(['a', 'b']);
    expect(closes).toEqual([{ op: 'close', id: 'c' }]);
    expect(keeps.every((op) => op.op === 'keep' && op.occurrenceCount === 3)).toBe(true);
    expect(keeps[0]).toMatchObject({
      activeKey: 'dev1:fault:fault:E1',
      conditionStartedAt: new Date('2026-10-01T00:00:00Z'),
    });
  });

  it('maps water-heater bit1 to E3', () => {
    const ops = planDeviceFaultBackfill({
      deviceId: 'dev1',
      productId: 'nohrp3vbmef7vxvx',
      statusJson: { fault: 2 },
      openAlerts: [opened('a', '2026-10-01T00:00:00Z')],
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'keep', faultCode: 'E3', id: 'a' });
  });

  it('creates a row when the bitmap is set and no legacy alert remains', () => {
    const now = new Date('2026-10-10T00:00:00Z');
    const ops = planDeviceFaultBackfill({
      deviceId: 'dev1',
      productId: 'uhmj5b0ba31zpme6',
      statusJson: { fault: 1 },
      openAlerts: [],
      now,
    });
    expect(ops).toEqual([
      expect.objectContaining({
        op: 'create',
        faultCode: 'E1',
        activeKey: 'dev1:fault:fault:E1',
        conditionStartedAt: now,
        occurrenceCount: 1,
      }),
    ]);
  });
});

describe('planMissingOpenFaultAlerts', () => {
  const wx2 = '90wi2aimyqstn9qc';

  it('opens E5 for fault=32 when no open alert exists', () => {
    const ops = planMissingOpenFaultAlerts({
      deviceId: 'dev-wx2',
      productId: wx2,
      statusJson: { fault: 32 },
      now: new Date('2026-10-10T06:00:00Z'),
    });
    expect(ops).toEqual([
      expect.objectContaining({
        op: 'create',
        faultCode: 'E5',
        dpCode: 'fault',
        activeKey: 'dev-wx2:fault:fault:E5',
        fingerprint: 'dev-wx2:fault:fault:E5',
        occurrenceCount: 1,
        conditionStartedAt: new Date('2026-10-10T06:00:00Z'),
      }),
    ]);
  });

  it('opens E0 and E5 together and skips a code that is already open', () => {
    const ops = planMissingOpenFaultAlerts({
      deviceId: 'dev-wx2',
      productId: wx2,
      statusJson: { fault: 33 },
      openFaultCodes: ['E0'],
    });
    expect(ops.map((op) => op.faultCode)).toEqual(['E5']);
  });

  it('does not create or close when the active key is already open', () => {
    const ops = planMissingOpenFaultAlerts({
      deviceId: 'dev-wx2',
      productId: wx2,
      statusJson: { fault: 32 },
      openActiveKeys: ['dev-wx2:fault:fault:E5'],
    });
    expect(ops).toEqual([]);
  });

  it('skips a fault device whose product has no bitmap schema', () => {
    const ops = planMissingOpenFaultAlerts({
      deviceId: 'dev-sw',
      productId: 'qxjzruuqz40bty7e',
      statusJson: { switch_1: true, fault: 32 },
    });
    expect(ops).toEqual([]);
  });
});
