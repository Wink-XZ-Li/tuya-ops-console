import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  it('filters devices by productId', async () => {
    const prisma = {
      device: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const svc = new DevicesService(prisma, {} as any);
    await svc.list({ productId: 'uhmj5b0ba31zpme6', page: 1, pageSize: 20 });
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: 'uhmj5b0ba31zpme6' }),
      }),
    );
  });

  it('refresh stores wifi signal and the cloud owner when status has no signal DP', async () => {
    const device = {
      id: 'dev-1',
      deviceId: 'vdevo1',
      productId: 'p',
      statusJson: { switch: true },
      bindings: [],
      alerts: [],
    };
    const prisma = {
      device: {
        findUnique: jest.fn().mockImplementation(async ({ include }: { include?: unknown }) =>
          include ? { ...device, signalStrength: '-40 dBm · Excellent', bindings: [{ endUser: { tuyaUid: 'ay-owner', username: null, mobile: null, email: null, remark: null } }] } : device,
        ),
        update: jest.fn().mockResolvedValue(device),
      },
      alert: { findMany: jest.fn().mockResolvedValue([]) },
      endUser: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      deviceBinding: { deleteMany: jest.fn(), upsert: jest.fn() },
    } as any;
    const tuya = {
      getDeviceStatus: jest.fn().mockResolvedValue([{ code: 'switch', value: true }]),
      getDeviceSignal: jest.fn().mockResolvedValue('-40 dBm · Excellent'),
      getDeviceUserProfiles: jest.fn().mockResolvedValue([]),
      getDevice: jest.fn().mockResolvedValue({ uid: 'ay-owner' }),
    };
    const svc = new DevicesService(prisma, tuya as any);
    const detail = await svc.refreshStatus('vdevo1');
    expect(prisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signalStrength: '-40 dBm · Excellent' }),
      }),
    );
    expect(prisma.deviceBinding.upsert).toHaveBeenCalled();
    expect(detail.bindings.map((b: { tuyaUid: string }) => b.tuyaUid)).toEqual(['ay-owner']);
    expect(detail.signalStrength).toBe('-40 dBm · Excellent');
  });

  it('asks the cloud log API for one cursor page inside a 7-day window', async () => {
    const prisma = { device: { findUnique: jest.fn().mockResolvedValue({ id: 'dev-1' }) } };
    const tuya = {
      getDeviceReportLogs: jest.fn().mockResolvedValue({
        deviceId: 'vdevo1',
        list: [],
        hasMore: true,
        lastRowKey: 'next',
      }),
    };
    const svc = new DevicesService(prisma as any, tuya as any);
    const endTime = 1_700_000_000_000;
    const page = await svc.getCloudReportLogs('vdevo1', {
      hours: 168,
      size: 50,
      lastRowKey: 'cursor',
      endTime,
    });
    expect(tuya.getDeviceReportLogs).toHaveBeenCalledWith({
      deviceId: 'vdevo1',
      codes: '',
      startTime: endTime - 168 * 3600_000,
      endTime,
      size: 50,
      lastRowKey: 'cursor',
    });
    expect(page).toMatchObject({ startTime: endTime - 168 * 3600_000, endTime, hasMore: true });
  });

  it('returns fault history with dictionary copy and leaves alerts unchanged', async () => {
    const now = new Date('2026-10-23T00:00:00.000Z');
    const alerts = [
      {
        id: 'open-e1',
        status: 'open',
        category: 'fault',
        faultCode: 'E1',
        title: '故障 E1',
        openedAt: new Date('2026-10-20T00:00:00.000Z'),
        closedAt: null,
        conditionStartedAt: new Date('2026-10-20T00:00:00.000Z'),
        occurrenceCount: 3,
        lastSeenAt: now,
        closedReason: null,
        detail: { dpCode: 'fault', label: 'E1' },
      },
      {
        id: 'closed-e1',
        status: 'closed',
        category: 'fault',
        faultCode: 'E1',
        title: '故障 E1',
        openedAt: new Date('2026-10-02T00:00:00.000Z'),
        closedAt: new Date('2026-10-02T02:00:00.000Z'),
        conditionStartedAt: new Date('2026-10-02T00:00:00.000Z'),
        occurrenceCount: 1,
        lastSeenAt: null,
        closedReason: 'auto_clear',
        detail: { dpCode: 'fault', label: 'E1' },
      },
      {
        id: 'bare',
        status: 'closed',
        category: 'fault',
        faultCode: 'ZZ',
        title: '故障 ZZ',
        openedAt: new Date('2026-10-11T00:00:00.000Z'),
        closedAt: new Date('2026-10-11T00:30:00.000Z'),
        conditionStartedAt: new Date('2026-10-11T00:00:00.000Z'),
        occurrenceCount: 1,
        lastSeenAt: null,
        closedReason: 'manual',
        detail: null,
      },
      {
        id: 'offline',
        status: 'open',
        category: 'connectivity',
        faultCode: 'offline',
        title: '设备离线',
        openedAt: new Date('2026-10-22T00:00:00.000Z'),
        closedAt: null,
        conditionStartedAt: new Date('2026-10-22T00:00:00.000Z'),
        occurrenceCount: 1,
        lastSeenAt: now,
        closedReason: null,
        detail: null,
      },
    ];
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue({ id: 'internal-1', productId: 'pid-1' }),
      },
      alert: { findMany: jest.fn().mockResolvedValue(alerts) },
      faultCodeDefinition: {
        findMany: jest.fn().mockResolvedValue([
          { code: 'fault', label: 'E1', symptom: '火焰故障', suggestedAction: '检查燃气供应' },
        ]),
      },
    };
    const svc = new DevicesService(prisma as any, {} as any);
    const page = await svc.faultHistory(
      'vdevo1',
      {
        from: '2026-09-23T00:00:00.000Z',
        to: '2026-10-23T00:00:00.000Z',
        includeConnectivity: '0',
      },
      now,
    );

    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deviceId: 'internal-1' } }),
    );
    expect(prisma.alert).not.toHaveProperty('update');
    expect(page.items.map((item) => item.id)).toEqual(['open-e1', 'bare', 'closed-e1']);
    expect(page.items.filter((item) => item.faultCode === 'E1')).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      faultCode: 'E1',
      symptom: '火焰故障',
      suggestedAction: '检查燃气供应',
      status: 'open',
      connectivity: false,
    });
    expect(page.items.find((item) => item.id === 'closed-e1')).toMatchObject({
      faultCode: 'E1',
      symptom: '火焰故障',
      closedReasonLabel: '自动恢复',
      occurrenceCount: 1,
    });
    expect(page.items.find((item) => item.id === 'bare')).toMatchObject({
      faultCode: 'ZZ',
      symptom: null,
      suggestedAction: null,
      closedReasonLabel: '人工关闭',
    });
    expect(page.summary).toEqual({
      openCount: 1,
      openedInRange: 3,
      longestDurationMinutes: 3 * 24 * 60,
    });
    expect(page.nextCursor).toBeNull();
    expect(prisma.faultCodeDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 'pid-1', label: { in: ['E1', 'ZZ'] } },
      }),
    );

    const withOffline = await svc.faultHistory(
      'vdevo1',
      { from: '2026-09-23T00:00:00.000Z', to: '2026-10-23T00:00:00.000Z', includeConnectivity: '1' },
      now,
    );
    expect(withOffline.items[0]).toMatchObject({
      id: 'offline',
      faultCode: 'offline',
      connectivity: true,
      symptom: null,
    });
  });

  it('aggregates numeric DP trends and leaves gaps empty', async () => {
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'internal-1',
          productId: '0wyzpxylwzjx6gej',
        }),
      },
      deviceEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventTime: new Date('2026-10-22T00:10:00.000Z'),
            payload: {
              status: [
                { code: 'steam_temp_current', value: 40 },
                { code: 'steam_temp_current', value: 50 },
                { code: 'wash_switch', value: true },
                { code: 'fault', value: 4 },
              ],
            },
          },
          {
            eventTime: new Date('2026-10-22T02:00:00.000Z'),
            payload: { status: [{ code: 'steam_temp_current', value: 42 }] },
          },
        ]),
      },
    };
    const svc = new DevicesService(prisma as any, {} as any);
    const page = await svc.dpTrends('vdevo1', {
      dpIds: 'steam_temp_current',
      from: '2026-10-22T00:00:00.000Z',
      to: '2026-10-22T03:00:00.000Z',
      bucket: '1h',
    });

    expect(page.bucket).toBe('1h');
    expect(page.series).toEqual([
      {
        dpId: 'steam_temp_current',
        name: '蒸箱当前温度',
        unit: '℃',
        points: [
          { t: '2026-10-22T00:00:00.000Z', avg: 45, min: 40, max: 50 },
          { t: '2026-10-22T02:00:00.000Z', avg: 42, min: 42, max: 42 },
        ],
      },
    ]);
    expect(prisma.deviceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId: 'internal-1',
          bizCode: { in: ['devicePropertyMessage', 'property', 'devicePropertyChange'] },
        }),
      }),
    );

    await expect(
      svc.dpTrends('vdevo1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('区间不能超过 90 天');

    prisma.deviceEvent.findMany.mockResolvedValue([]);
    const empty = await svc.dpTrends('vdevo1', {
      dpIds: 'steam_temp_current',
      from: '2026-10-22T00:00:00.000Z',
      to: '2026-10-22T01:00:00.000Z',
    });
    expect(empty.series).toEqual([
      { dpId: 'steam_temp_current', name: '蒸箱当前温度', unit: '℃', points: [] },
    ]);
    expect(empty.bucket).toBe('5min');
  });

  it('diffs gas_consumption for a product that has a usage meter and scales the raw value', async () => {
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'internal-1',
          productId: '1x0qz5jtlabxywcg',
        }),
      },
      deviceEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventTime: new Date('2026-10-22T00:00:00.000Z'),
            payload: { status: [{ code: 'gas_consumption', value: 100 }] },
          },
          {
            eventTime: new Date('2026-10-22T06:00:00.000Z'),
            payload: { status: [{ dpId: 24, value: 250 }] },
          },
        ]),
      },
    };
    const svc = new DevicesService(prisma as any, {} as any);
    const page = await svc.usage('vdevo1', {
      metric: 'gas',
      from: '2026-10-21T16:00:00.000Z',
      to: '2026-10-22T16:00:00.000Z',
      bucket: 'day',
    });
    expect(page).toMatchObject({
      metricId: 'gas',
      sourceDpId: 'gas_consumption',
      unit: 'm³',
      total: 1.5,
      dailyAvg: 1.5,
      peakDay: { date: '2026-10-22', value: 1.5 },
      note: null,
    });
    expect(page.days).toEqual([{ date: '2026-10-22', value: 1.5 }]);

    await expect(svc.usage('vdevo1', { metric: 'energy' })).rejects.toThrow('该产品没有这项用量');
  });

  it('builds the connectivity ribbon from online and offline device events, not alerts', async () => {
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue({ id: 'internal-1' }),
      },
      deviceEvent: {
        findFirst: jest.fn().mockResolvedValue({
          bizCode: 'deviceOnline',
          eventTime: new Date('2026-10-15T00:00:00.000Z'),
        }),
        findMany: jest.fn().mockResolvedValue([
          { bizCode: 'offline', eventTime: new Date('2026-10-20T00:00:00.000Z') },
          { bizCode: 'online', eventTime: new Date('2026-10-20T02:00:00.000Z') },
        ]),
      },
      alert: { findMany: jest.fn() },
    };
    const svc = new DevicesService(prisma as any, {} as any);
    const page = await svc.connectivity('vdevo1', {
      from: '2026-10-16T00:00:00.000Z',
      to: '2026-10-23T00:00:00.000Z',
    });

    expect(prisma.deviceEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId: 'internal-1',
          eventTime: { lt: new Date('2026-10-16T00:00:00.000Z') },
          bizCode: { in: ['online', 'deviceOnline', 'offline', 'deviceOffline'] },
        }),
      }),
    );
    expect(prisma.alert.findMany).not.toHaveBeenCalled();
    expect(page.source).toBe('deviceEvent');
    expect(page.segments.map((segment) => segment.state)).toEqual(['online', 'offline', 'online']);
    expect(page.segments[1]).toEqual({
      state: 'offline',
      from: '2026-10-20T00:00:00.000Z',
      to: '2026-10-20T02:00:00.000Z',
    });

    prisma.device.findUnique.mockResolvedValue(null);
    await expect(svc.connectivity('missing', {})).rejects.toThrow('Device missing not found');
  });

  it('builds status ribbons from enum and bool property reports and skips products with none', async () => {
    const prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'internal-1',
          productId: '1x0qz5jtlabxywcg',
        }),
      },
      deviceEvent: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { eventTime: { lt?: Date; gte?: Date } } }) => {
          if (where.eventTime.lt) {
            return [
              {
                eventTime: new Date('2026-10-15T00:00:00.000Z'),
                payload: {
                  status: [
                    { code: 'work_state', value: 'code_standby' },
                    { code: 'temp_current', value: 40 },
                  ],
                },
              },
            ];
          }
          return [
            {
              eventTime: new Date('2026-10-20T00:00:00.000Z'),
              payload: { status: [{ dpId: 15, value: 'heating' }] },
            },
            {
              eventTime: new Date('2026-10-21T00:00:00.000Z'),
              payload: { status: [{ code: 'flame_status', value: true }] },
            },
          ];
        }),
      },
    };
    const svc = new DevicesService(prisma as any, {} as any);
    const page = await svc.statusBars('vdevo1', {
      from: '2026-10-16T00:00:00.000Z',
      to: '2026-10-23T00:00:00.000Z',
    });

    expect(prisma.deviceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId: 'internal-1',
          eventTime: { lt: new Date('2026-10-16T00:00:00.000Z') },
          bizCode: { in: ['devicePropertyMessage', 'property', 'devicePropertyChange'] },
        }),
      }),
    );
    const work = page.bars.find((bar) => bar.dpId === 'work_state');
    expect(work?.segments).toEqual([
      {
        tStart: '2026-10-16T00:00:00.000Z',
        tEnd: '2026-10-20T00:00:00.000Z',
        value: 'code_standby',
        label: '冷待机',
      },
      {
        tStart: '2026-10-20T00:00:00.000Z',
        tEnd: '2026-10-23T00:00:00.000Z',
        value: 'heating',
        label: '加热',
      },
    ]);
    expect(page.bars.find((bar) => bar.dpId === 'flame_status')?.segments.map((segment) => segment.label)).toEqual([
      '未知',
      '燃烧中',
    ]);
    expect(page.bars.some((bar) => bar.dpId === 'temp_current')).toBe(false);

    prisma.device.findUnique.mockResolvedValue({ id: 'internal-2', productId: '0wyzpxylwzjx6gej' });
    prisma.deviceEvent.findMany.mockClear();
    const empty = await svc.statusBars('vdevo1', {
      from: '2026-10-16T00:00:00.000Z',
      to: '2026-10-23T00:00:00.000Z',
    });
    expect(empty.bars).toEqual([]);
    expect(prisma.deviceEvent.findMany).not.toHaveBeenCalled();
  });
});
