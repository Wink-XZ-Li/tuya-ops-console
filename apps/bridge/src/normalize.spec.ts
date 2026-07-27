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
});
