import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFaultMeaning } from './product-fault-meanings';

describe('product fault meanings source', () => {
  it('reads family copy from PRODUCT_FAULT_MEANINGS.json and does not embed it', () => {
    const src = readFileSync(join(__dirname, 'product-fault-meanings.ts'), 'utf8');
    expect(src).not.toContain('火焰故障');
    expect(src).not.toContain('点火失败或残火');
    expect(src).not.toMatch(/nameZh:\s*['"]/);
    expect(getFaultMeaning('1x0qz5jtlabxywcg', 'E1')?.symptom).toBe('火焰故障');
    expect(getFaultMeaning('xwwar3mdmhpipujn', 'E1')?.symptom).toBe('点火失败或残火，伪火');
    expect(getFaultMeaning('nohrp3vbmef7vxvx', 'E1')).toBeUndefined();
  });
});
