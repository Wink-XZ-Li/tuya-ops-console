import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FAULT_ROLLUP_WHERE_SQL,
  mergeFaultGroups,
  mttrMinutesAvg,
  rollupFaultCode,
  sqlPredicateKeeps,
  weightedMttrMinutes,
} from './fault-rollup';
import { monthsToEnsure, partitionNamesToDrop } from './event-archive';

describe('fault rollup SQL predicate', () => {
  const rows = [
    { faultCode: 'E1', category: 'fault' },
    { faultCode: 'E2', category: 'fault' },
    { faultCode: 'E3', category: 'fault' },
    { faultCode: 'E4', category: 'fault' },
    { faultCode: 'offline', category: 'connectivity' },
    { faultCode: 'E3', category: 'connectivity' },
    { faultCode: 'offline', category: 'fault' },
    { faultCode: 'unknown', category: 'fault' },
    { faultCode: '  ', category: 'fault' },
    { faultCode: null, category: 'fault' },
  ];

  it('keeps the same rows as rollupFaultCode and excludes connectivity', () => {
    for (const row of rows) {
      expect(sqlPredicateKeeps(row)).toBe(rollupFaultCode(row) != null);
    }
    expect(FAULT_ROLLUP_WHERE_SQL).toContain("category <> 'connectivity'");
    expect(FAULT_ROLLUP_WHERE_SQL).toContain("faultCode <> 'offline'");
    expect(FAULT_ROLLUP_WHERE_SQL).toContain("'unknown'");
  });

  it('sums product groups into the fleet row', () => {
    const buckets = mergeFaultGroups({
      opened: [{ productId: 'p1', faultCode: 'E1', newCount: 2 }],
      closed: [{ productId: 'p1', faultCode: 'E1', closedCount: 1, mttrSum: 30 }],
      stillOpen: [{ productId: 'p1', faultCode: 'offline', openCount: 9 }],
    });
    const product = buckets.find((row) => row.productId === 'p1' && row.faultCode === 'E1');
    const fleet = buckets.find((row) => row.productId === '' && row.faultCode === 'E1');
    expect(product).toMatchObject({ newCount: 2, closedCount: 1, openCount: 0 });
    expect(fleet).toMatchObject({ newCount: 2, closedCount: 1 });
    expect(mttrMinutesAvg(product!)).toBe(30);
    expect(buckets.some((row) => row.faultCode === 'offline')).toBe(false);
  });

  it('weights daily MTTR by closed count', () => {
    expect(
      weightedMttrMinutes([
        { closedCount: 2, mttrMinutesAvg: 10 },
        { closedCount: 1, mttrMinutesAvg: 40 },
        { closedCount: 0, mttrMinutesAvg: 99 },
      ]),
    ).toBe(20);
    expect(weightedMttrMinutes([])).toBeNull();
  });
});

describe('archive partitions', () => {
  it('drops only whole months at or before the cutoff and never pmax', () => {
    expect(
      partitionNamesToDrop(
        [
          { name: 'p202607', description: '739830' },
          { name: 'p202611', description: '739952' },
          { name: 'pmax', description: 'MAXVALUE' },
        ],
        739900,
      ),
    ).toEqual(['p202607']);
  });

  it('names the months the retention job must keep ahead', () => {
    const months = monthsToEnsure(new Date(2026, 10, 4), 3);
    expect(months.map((month) => month.name)).toEqual([
      'p202610',
      'p202611',
      'p202612',
      'p202701',
      'p202702',
    ]);
    expect(months[1].lessThan).toBe('2026-12-01');
  });
});

describe('phase C query sources', () => {
  it('rolls faults up in SQL and deletes retention in batches', () => {
    const rollup = readFileSync(join(__dirname, 'rollup.job.ts'), 'utf8');
    const retention = readFileSync(join(__dirname, 'retention.job.ts'), 'utf8');
    expect(rollup).not.toMatch(/alert\.findMany/);
    expect(rollup).toContain('GROUP BY d.productId');
    expect(rollup).toContain('GROUP BY productId');
    expect(retention).toContain('LIMIT ${batchSize}');
    expect(retention).toContain('RETENTION_DRY_RUN');
    expect(retention).not.toMatch(/deviceEvent\.deleteMany\(\{\s*where:\s*\{\s*eventTime/);
  });
});
