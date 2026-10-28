import {
  buildVirtualDashboard,
  buildVirtualDevicesUsage,
  buildVirtualFaults,
  buildVirtualUsers,
  VIRTUAL_FLEET_TOTAL,
} from './virtual-fleet';

const range = { startDay: '20261001', endDay: '20261030' };

describe('virtual fleet demo payloads', () => {
  it('returns a stable dashboard shaped like the live star-analytics response', () => {
    const first = buildVirtualDashboard(range);
    const second = buildVirtualDashboard(range);

    expect(first.series.device).toHaveLength(30);
    expect(first.series.register).toHaveLength(30);
    expect(first.series.control).toHaveLength(30);
    expect(first.kpis.activationTotal).toBe(VIRTUAL_FLEET_TOTAL);
    expect(first.kpis.activationTotal).toBeGreaterThan(10000);
    expect(first.series.device.at(-1)?.activationTotalNum).toBe(first.kpis.activationTotal);
    expect(first.kpis.activationNew).toBe(
      first.series.device.reduce((sum, row) => sum + row.activationNum, 0),
    );
    expect(first.locations.items.reduce((sum, row) => sum + row.value, 0)).toBe(
      VIRTUAL_FLEET_TOTAL,
    );
    expect(first.warnings).toEqual([]);
    expect(first.kpis).toEqual(second.kpis);
    expect(first.series.device.map((row) => row.activationNum)).toEqual(
      second.series.device.map((row) => row.activationNum),
    );
    expect(first.series.device.map((row) => row.activeNum)).toEqual(
      second.series.device.map((row) => row.activeNum),
    );
  });

  it('returns device, fault, and user payloads on the same 12k fleet', () => {
    const devices = buildVirtualDevicesUsage(range);
    const faults = buildVirtualFaults(range);
    const users = buildVirtualUsers(range);

    expect(devices.live.total).toBe(VIRTUAL_FLEET_TOTAL);
    expect(devices.live.online + devices.live.offline).toBe(devices.live.total);
    expect(devices.live.onlineRate).toBeGreaterThan(0.95);
    expect(devices.live.onlineRate).toBeLessThan(0.99);
    expect(devices.dailyTrend).toHaveLength(30);
    expect(devices.live.byProduct.reduce((sum, row) => sum + row.total, 0)).toBe(
      devices.live.total,
    );
    expect(devices.live.modeDistribution.reduce((sum, row) => sum + row.count, 0)).toBe(
      devices.live.total,
    );
    expect(devices.dailyTrend.map((row) => row.onlineCount)).toEqual(
      buildVirtualDevicesUsage(range).dailyTrend.map((row) => row.onlineCount),
    );

    expect(faults.kpis.inServiceDevices).toBe(devices.live.total);
    expect(faults.kpis.qualityFaultDevices).toBe(devices.live.fault);
    expect(faults.kpis.qualityFaultRate).toBeGreaterThan(0.01);
    expect(faults.kpis.qualityFaultRate).toBeLessThan(0.02);
    expect(faults.dailyTrend).toHaveLength(30);
    expect(faults.faultCodeHistogram.length).toBeGreaterThan(0);
    expect(faults.correlation.reduce((sum, row) => sum + row.liveFaultDevices, 0)).toBe(
      faults.kpis.qualityFaultDevices,
    );
    expect(faults.faultCodeHistogram.reduce((sum, row) => sum + row.count, 0)).toBe(
      faults.dailyTrend.reduce((sum, row) => sum + row.newCount, 0),
    );
    expect(faults.byLocation.reduce((sum, row) => sum + row.count, 0)).toBe(
      faults.kpis.qualityFaultDevices,
    );
    expect(faults.kpis.avgDurationMinutes).toBe(214);
    expect(faults.kpis.pendingDeviceCount).toBeGreaterThan(0);
    expect(faults.kpis.openAlerts).toBeGreaterThan(0);

    expect(users.star.register).toHaveLength(30);
    expect(users.local.endUserTotal).toBeGreaterThan(8000);
    expect(users.local.boundUserRate).toBeGreaterThan(0.9);
    expect(users.local.countryCodeDistribution[0]?.countryCode).toBe('86');
    expect(
      users.local.bindingDistribution.zero +
        users.local.bindingDistribution.one +
        users.local.bindingDistribution.two +
        users.local.bindingDistribution.threePlus,
    ).toBe(users.local.endUserTotal);
  });

  it('narrows the fleet when a known product is selected', () => {
    const dash = buildVirtualDashboard({ ...range, productId: '90wi2aimyqstn9qc' });
    const devices = buildVirtualDevicesUsage({ ...range, productId: '90wi2aimyqstn9qc' });
    expect(dash.kpis.activationTotal).toBe(4120);
    expect(devices.live.total).toBe(4120);
    expect(devices.live.byProduct).toEqual([
      expect.objectContaining({ productId: '90wi2aimyqstn9qc', total: 4120 }),
    ]);
  });
});
