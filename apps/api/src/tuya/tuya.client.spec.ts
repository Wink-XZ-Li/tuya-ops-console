import { TuyaContext } from '@tuya/tuya-connector-nodejs';
import { isAllowedProduct, propertiesFromThingModel, TuyaLiveClient } from './tuya.client';
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

describe('TuyaLiveClient.issueProperties', () => {
  it('posts every property to the IoT Core shadow issue endpoint', async () => {
    const request = jest.fn(async () => ({ success: true, result: true }));
    const client = new TuyaLiveClient({ request } as unknown as TuyaContext);
    await expect(client.issueProperties('dev-1', { ph: 122, switch: true })).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v2.0/cloud/thing/dev-1/shadow/properties/issue',
      body: { properties: { ph: 122, switch: true } },
    });
  });

  it('throws the Tuya error when issue fails', async () => {
    const request = jest.fn(async () => ({ success: false, code: 2008, msg: 'not support' }));
    const client = new TuyaLiveClient({ request } as unknown as TuyaContext);
    await expect(client.issueProperties('dev-1', { ph: 122 })).rejects.toThrow(
      'Tuya issueProperties failed for dev-1: [2008] not support',
    );
  });
});

describe('TuyaLiveClient.getDeviceSignal', () => {
  it('uses the latest type-8 log when the wifi signal sample is empty', async () => {
    const request = jest.fn(async (args: { path: string; query?: Record<string, string> }) => {
      if (args.path.endsWith('/wifi/signal')) {
        return { success: true, result: { eventTime: 0 } };
      }
      if (args.path.endsWith('/zigbee/signal')) {
        return { success: false, code: 2009, msg: 'not support this device' };
      }
      if (args.query?.type === '8') {
        return {
          success: true,
          result: {
            logs: [
              { event_value: '-52', event_time: 100 },
              { event_value: '-42', event_time: 200 },
            ],
          },
        };
      }
      return { success: false };
    });
    const client = new TuyaLiveClient({ request } as unknown as TuyaContext);
    await expect(client.getDeviceSignal('dev-1')).resolves.toBe('-42 dBm');
  });
});

describe('TuyaLiveClient.getDeviceReportLogs', () => {
  it('follows an empty page until a cursor returns rows', async () => {
    const request = jest.fn(async (args: { path: string; query?: Record<string, string> }) => {
      if (!args.query?.start_row_key) {
        return { success: true, result: { logs: [], has_next: true, next_row_key: 'cursor-2' } };
      }
      return {
        success: true,
        result: {
          logs: [{ code: 'fault', value: '0', event_time: 10 }],
          has_next: false,
        },
      };
    });
    const client = new TuyaLiveClient({ request } as unknown as TuyaContext);
    const page = await client.getDeviceReportLogs({
      deviceId: 'dev-1',
      codes: '',
      startTime: 1,
      endTime: 2,
      size: 20,
    });
    expect(page.list).toEqual([{ code: 'fault', value: 0, eventTime: 10 }]);
    expect(page.hasMore).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
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

  it('issueProperties returns mock success without network', async () => {
    const client = new TuyaMockClient();
    const result = await client.issueProperties('demo-001', { switch: true, ph: 122 });
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
