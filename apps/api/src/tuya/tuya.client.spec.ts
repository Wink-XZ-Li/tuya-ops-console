import { isAllowedProduct } from './tuya.client';
import { MOCK_DEVICES, TuyaMockClient } from './tuya.mock';

describe('isAllowedProduct', () => {
  const allowed = new Set([
    'uhmj5b0ba31zpme6',
    'qxjzruuqz40bty7e',
    'nohrp3vbmef7vxvx',
    '7sylzgrdnnq2w5mo',
  ]);

  it('allows whitelisted pid', () => {
    expect(isAllowedProduct('uhmj5b0ba31zpme6', allowed)).toBe(true);
  });

  it('blocks unknown pid', () => {
    expect(isAllowedProduct('other', allowed)).toBe(false);
  });
});

describe('TuyaMockClient', () => {
  it('keeps global device count under 10', () => {
    expect(MOCK_DEVICES.length).toBeLessThan(10);
  });

  it('returns 1–3 devices per product', async () => {
    const client = new TuyaMockClient();
    for (const pid of ['uhmj5b0ba31zpme6', 'qxjzruuqz40bty7e', 'nohrp3vbmef7vxvx']) {
      const { list, total } = await client.listDevicesByProduct(pid, 1);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(3);
      expect(list).toHaveLength(total);
      expect(list.every((d) => d.productId === pid)).toBe(true);
    }
  });

  it('sendStandardCommand returns mock success without network', async () => {
    const client = new TuyaMockClient();
    const result = await client.sendStandardCommand('demo-001', [
      { code: 'switch', value: true },
    ]);
    expect(result).toEqual({ success: true, mock: true });
  });

  it('returns analytics series for dashboard', async () => {
    const client = new TuyaMockClient();
    const device = await client.getAppDeviceStat({
      startDay: '20260701',
      endDay: '20260703',
    });
    expect(device).toHaveLength(3);
    const locations = await client.getLocationsActiveDatas({
      dateType: 'month',
      type: 'province',
      limit: 3,
    });
    expect(locations).toHaveLength(3);
  });
});
