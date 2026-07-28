import { normalizeTuyaMessage } from './normalize';

describe('normalizeTuyaMessage', () => {
  it('maps Tuya online payload to DeviceBusMessage', () => {
    const out = normalizeTuyaMessage({
      bizCode: 'deviceOnline',
      dataId: 'x',
      ts: 1710000000000,
      productKey: 'uhmj5b0ba31zpme6',
      devId: 'vdevo1',
    });
    expect(out).toEqual({
      bizCode: 'deviceOnline',
      ts: 1710000000000,
      productId: 'uhmj5b0ba31zpme6',
      deviceId: 'vdevo1',
      payload: expect.any(Object),
    });
    expect(out.payload).toEqual({ dataId: 'x' });
  });

  it('uses t when ts is missing', () => {
    const out = normalizeTuyaMessage({
      bizCode: 'deviceOffline',
      t: 1710000001000,
      productKey: 'qxjzruuqz40bty7e',
      devId: 'vdevo2',
    });
    expect(out.ts).toBe(1710000001000);
    expect(out.productId).toBe('qxjzruuqz40bty7e');
  });

  it('flattens bizData envelope', () => {
    const out = normalizeTuyaMessage({
      bizCode: 'devicePropertyMessage',
      ts: 1710000002000,
      bizData: {
        dataId: 'd1',
        devId: 'vdevo3',
        productKey: 'nohrp3vbmef7vxvx',
        status: [{ code: 'switch_1', value: true }],
      },
    });
    expect(out.deviceId).toBe('vdevo3');
    expect(out.productId).toBe('nohrp3vbmef7vxvx');
    expect(out.payload.status).toEqual([{ code: 'switch_1', value: true }]);
  });

  it('infers property bizCode from status array', () => {
    const out = normalizeTuyaMessage({
      dataId: 'd2',
      devId: 'vdevo4',
      productKey: 'uhmj5b0ba31zpme6',
      status: [{ code: 'switch_1', value: false }],
      t: 1710000003000,
    });
    expect(out.bizCode).toBe('devicePropertyMessage');
    expect(out.deviceId).toBe('vdevo4');
  });
});
