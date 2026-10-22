import { summarizeFaultCodesByProduct } from './fault-code-breakdown';

describe('summarizeFaultCodesByProduct', () => {
  it('keeps the same fault code separate for each product', () => {
    const rows = summarizeFaultCodesByProduct([
      { productId: 'nohrp3vbmef7vxvx', faultCode: 'E3', newCount: 10 },
      { productId: 'nohrp3vbmef7vxvx', faultCode: 'E3', newCount: 9 },
      { productId: 'uhmj5b0ba31zpme6', faultCode: 'E3', newCount: 19 },
      { productId: '', faultCode: 'E3', newCount: 100 },
      { productId: 'qxjzruuqz40bty7e', faultCode: 'E0', newCount: 0 },
    ]);

    expect(rows).toEqual([
      { productId: 'nohrp3vbmef7vxvx', faultCode: 'E3', count: 19 },
      { productId: 'uhmj5b0ba31zpme6', faultCode: 'E3', count: 19 },
    ]);
  });
});
