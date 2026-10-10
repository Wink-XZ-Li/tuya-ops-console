import { isAllowedProduct, propertiesFromThingModel } from './tuya.client';
import { MOCK_DEVICES, TuyaMockClient } from './tuya.mock';

describe('isAllowedProduct', () => {
  it('allows any non-empty product id', () => {
    expect(isAllowedProduct('uhmj5b0ba31zpme6')).toBe(true);
    expect(isAllowedProduct('ckjfqtnqqystvfaa', new Set(['other']))).toBe(true);
    expect(isAllowedProduct('not-on-old-list')).toBe(true);
  });

  it('rejects a blank product id', () => {
    expect(isAllowedProduct('  ')).toBe(false);
  });
});

describe('propertiesFromThingModel', () => {
  it('keeps read-only points such as fault', () => {
    const props = propertiesFromThingModel(
      JSON.stringify({
        services: [
          {
            properties: [
              {
                abilityId: 1,
                accessMode: 'rw',
                code: 'switch',
                name: '开关',
                typeSpec: { type: 'bool' },
              },
              {
                abilityId: 20,
                accessMode: 'ro',
                code: 'fault',
                name: '故障告警',
                typeSpec: { type: 'bitmap', label: ['E0', 'E1'], maxlen: 2 },
              },
            ],
          },
        ],
      }),
    );
    expect(props.map((p) => p.code)).toEqual(['switch', 'fault']);
    expect(props[1]).toMatchObject({
      name: '故障告警',
      mode: 'ro',
      type: 'bitmap',
      dpId: 20,
    });
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
