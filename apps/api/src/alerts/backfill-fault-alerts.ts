import { AlertStatus, Prisma, PrismaClient } from '@prisma/client';
import { asRecord, decodeBitmapLabels, deriveFaultFields } from '../devices/device-derived';
import { PRODUCT_FAULT_BITMAP_LABELS } from '../devices/product-fault-schemas';

const LEGACY_ROLLUP_CODES = ['local_offline', 'device', 'device_fault', 'sensor_error'];

export type OpenLegacyAlert = { id: string; openedAt: Date };

export type BackfillOp =
  | {
      op: 'keep';
      id: string;
      faultCode: string;
      dpCode: string;
      activeKey: string;
      fingerprint: string;
      occurrenceCount: number;
      conditionStartedAt: Date;
    }
  | {
      op: 'create';
      faultCode: string;
      dpCode: string;
      activeKey: string;
      fingerprint: string;
      occurrenceCount: number;
      conditionStartedAt: Date;
    }
  | { op: 'close'; id: string };

/** bit5 → E5 when labels are the T15-order bitmap. Non-bit codes are left alone. */
export function faultCodeReplacingBitLabel(faultCode: string, labels: string[]): string | null {
  const match = /^bit(\d+)$/.exec(faultCode.trim());
  if (!match) return null;
  return labels[Number(match[1])] ?? null;
}

export function renameBitAlertKey(key: string, fromLabel: string, toLabel: string): string {
  const suffix = `:${fromLabel}`;
  if (!key.endsWith(suffix)) return key;
  return `${key.slice(0, -suffix.length)}:${toLabel}`;
}

export function faultAlertActiveKey(deviceId: string, dpCode: string, label: string): string {
  return `${deviceId}:fault:${dpCode}:${label}`;
}

export function offlineAlertActiveKey(deviceId: string): string {
  return `${deviceId}:connectivity:offline`;
}

/** Plan how to merge legacy source=device rows. Unreadable bitmaps close every row. */
export function planDeviceFaultBackfill(input: {
  deviceId: string;
  productId: string | null | undefined;
  statusJson: unknown;
  openAlerts: OpenLegacyAlert[];
  now?: Date;
}): BackfillOp[] {
  const status = asRecord(input.statusJson);
  const schemas = input.productId ? PRODUCT_FAULT_BITMAP_LABELS[input.productId] : undefined;
  const active: Array<{ dpCode: string; label: string }> = [];
  if (schemas) {
    for (const [dpCode, labels] of Object.entries(schemas)) {
      for (const label of decodeBitmapLabels(status[dpCode], labels)) {
        active.push({ dpCode, label });
      }
    }
  }

  const sorted = [...input.openAlerts].sort((a, b) => {
    const delta = a.openedAt.getTime() - b.openedAt.getTime();
    if (delta !== 0) return delta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  if (active.length === 0) {
    return sorted.map((alert) => ({ op: 'close', id: alert.id }));
  }

  const occurrenceCount = Math.max(sorted.length, 1);
  const conditionStartedAt = sorted[0]?.openedAt ?? input.now ?? new Date();
  const ops: BackfillOp[] = [];

  sorted.forEach((alert, index) => {
    const slot = active[index];
    if (!slot) {
      ops.push({ op: 'close', id: alert.id });
      return;
    }
    const activeKey = faultAlertActiveKey(input.deviceId, slot.dpCode, slot.label);
    ops.push({
      op: 'keep',
      id: alert.id,
      faultCode: slot.label,
      dpCode: slot.dpCode,
      activeKey,
      fingerprint: activeKey,
      occurrenceCount,
      conditionStartedAt,
    });
  });

  for (let i = sorted.length; i < active.length; i++) {
    const slot = active[i];
    const activeKey = faultAlertActiveKey(input.deviceId, slot.dpCode, slot.label);
    ops.push({
      op: 'create',
      faultCode: slot.label,
      dpCode: slot.dpCode,
      activeKey,
      fingerprint: activeKey,
      occurrenceCount,
      conditionStartedAt,
    });
  }

  return ops;
}

/** Create open alerts for bits already set on the device, without closing anything. */
export function planMissingOpenFaultAlerts(input: {
  deviceId: string;
  productId: string | null | undefined;
  statusJson: unknown;
  openActiveKeys?: Array<string | null>;
  openFaultCodes?: Array<string | null>;
  now?: Date;
}): Array<Extract<BackfillOp, { op: 'create' }>> {
  const parsed = planDeviceFaultBackfill({
    deviceId: input.deviceId,
    productId: input.productId,
    statusJson: input.statusJson,
    openAlerts: [],
    now: input.now,
  }).filter((op): op is Extract<BackfillOp, { op: 'create' }> => op.op === 'create');

  const keys = new Set((input.openActiveKeys ?? []).filter((key): key is string => !!key));
  const codes = new Set((input.openFaultCodes ?? []).filter((code): code is string => !!code));
  return parsed.filter((op) => !keys.has(op.activeKey) && !codes.has(op.faultCode));
}

export type BackfillCounts = {
  offlineKept: number;
  offlineClosed: number;
  faultKept: number;
  faultCreated: number;
  faultClosed: number;
  legacyRollupRowsDeleted: number;
  emptyUnknownRowsDeleted: number;
  devicesRecomputed: number;
  snapshotAlertsCreated: number;
  bitAlertsRenamed: number;
};

type BackfillDb = Pick<PrismaClient, 'alert' | 'device' | 'dailyFaultStat'>;

export async function backfillFaultAlerts(prisma: BackfillDb, now = new Date()): Promise<BackfillCounts> {
  const counts: BackfillCounts = {
    offlineKept: 0,
    offlineClosed: 0,
    faultKept: 0,
    faultCreated: 0,
    faultClosed: 0,
    legacyRollupRowsDeleted: 0,
    emptyUnknownRowsDeleted: 0,
    devicesRecomputed: 0,
    snapshotAlertsCreated: 0,
    bitAlertsRenamed: 0,
  };

  counts.bitAlertsRenamed = await renameWx2BitFaultAlerts(prisma);

  const offline = await prisma.alert.findMany({
    where: { status: { not: AlertStatus.closed }, source: 'local_offline' },
    orderBy: [{ deviceId: 'asc' }, { openedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, deviceId: true, openedAt: true },
  });
  const seenOffline = new Set<string>();
  for (const row of offline) {
    if (seenOffline.has(row.deviceId)) {
      await prisma.alert.update({
        where: { id: row.id },
        data: {
          status: AlertStatus.closed,
          closedAt: now,
          closedReason: 'migration_dedupe',
          activeKey: null,
        },
      });
      counts.offlineClosed += 1;
      continue;
    }
    seenOffline.add(row.deviceId);
    const activeKey = offlineAlertActiveKey(row.deviceId);
    await prisma.alert.update({
      where: { id: row.id },
      data: {
        category: 'connectivity',
        faultCode: 'offline',
        fingerprint: activeKey,
        activeKey,
        conditionStartedAt: row.openedAt,
        lastSeenAt: now,
      },
    });
    counts.offlineKept += 1;
  }

  const legacy = await prisma.alert.findMany({
    where: {
      status: { not: AlertStatus.closed },
      OR: [
        { source: 'device' },
        {
          faultCode: null,
          source: { notIn: ['local_offline', 'device_fault'] },
          title: { contains: '故障' },
        },
      ],
    },
    orderBy: [{ deviceId: 'asc' }, { openedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, deviceId: true, openedAt: true },
  });

  const byDevice = new Map<string, OpenLegacyAlert[]>();
  for (const row of legacy) {
    const list = byDevice.get(row.deviceId) ?? [];
    list.push({ id: row.id, openedAt: row.openedAt });
    byDevice.set(row.deviceId, list);
  }

  for (const [deviceId, openAlerts] of byDevice) {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { productId: true, statusJson: true },
    });
    const ops = planDeviceFaultBackfill({
      deviceId,
      productId: device?.productId,
      statusJson: device?.statusJson,
      openAlerts,
      now,
    });
    for (const op of ops) {
      if (op.op === 'close') {
        await prisma.alert.update({
          where: { id: op.id },
          data: {
            status: AlertStatus.closed,
            closedAt: now,
            closedReason: 'migration_dedupe',
            activeKey: null,
          },
        });
        counts.faultClosed += 1;
        continue;
      }
      const data = {
        source: 'device_fault',
        category: 'fault',
        faultCode: op.faultCode,
        fingerprint: op.fingerprint,
        activeKey: op.activeKey,
        conditionStartedAt: op.conditionStartedAt,
        occurrenceCount: op.occurrenceCount,
        lastSeenAt: now,
        title: `故障 ${op.faultCode}`,
        detail: { dpCode: op.dpCode, label: op.faultCode, migrated: true } as Prisma.InputJsonValue,
      };
      if (op.op === 'keep') {
        await prisma.alert.update({ where: { id: op.id }, data });
        counts.faultKept += 1;
      } else {
        await prisma.alert.create({
          data: {
            ...data,
            deviceId,
            openedAt: op.conditionStartedAt,
          },
        });
        counts.faultCreated += 1;
      }
    }
  }

  const faultDevices = await prisma.device.findMany({
    where: { faultStatus: 'fault' },
    select: { id: true, productId: true, statusJson: true },
  });
  for (const device of faultDevices) {
    const openFaults = await prisma.alert.findMany({
      where: { deviceId: device.id, status: { not: AlertStatus.closed }, category: 'fault' },
      select: { activeKey: true, faultCode: true },
    });
    const missing = planMissingOpenFaultAlerts({
      deviceId: device.id,
      productId: device.productId,
      statusJson: device.statusJson,
      openActiveKeys: openFaults.map((row) => row.activeKey),
      openFaultCodes: openFaults.map((row) => row.faultCode),
      now,
    });
    for (const op of missing) {
      const data = {
        source: 'device_fault',
        category: 'fault',
        faultCode: op.faultCode,
        fingerprint: op.fingerprint,
        activeKey: op.activeKey,
        conditionStartedAt: op.conditionStartedAt,
        occurrenceCount: op.occurrenceCount,
        lastSeenAt: now,
        title: `故障 ${op.faultCode}`,
        detail: { dpCode: op.dpCode, label: op.faultCode, migrated: true } as Prisma.InputJsonValue,
      };
      try {
        await prisma.alert.create({
          data: {
            ...data,
            deviceId: device.id,
            openedAt: op.conditionStartedAt,
          },
        });
        counts.snapshotAlertsCreated += 1;
      } catch (err) {
        if (!isUniqueConflict(err)) throw err;
      }
    }
  }

  const devices = await prisma.device.findMany({
    select: { id: true, productId: true, statusJson: true, faultStatus: true, faultInfo: true },
  });
  for (const device of devices) {
    const openFaultAlerts = await prisma.alert.findMany({
      where: { deviceId: device.id, status: { not: AlertStatus.closed }, category: 'fault' },
      select: { faultCode: true, title: true },
      take: 20,
    });
    const fault = deriveFaultFields(asRecord(device.statusJson), {
      productId: device.productId,
      openFaultAlerts,
    });
    if (fault.faultStatus === device.faultStatus && fault.faultInfo === device.faultInfo) {
      continue;
    }
    await prisma.device.update({
      where: { id: device.id },
      data: { faultStatus: fault.faultStatus, faultInfo: fault.faultInfo },
    });
    counts.devicesRecomputed += 1;
  }

  const deleted = await prisma.dailyFaultStat.deleteMany({
    where: { faultCode: { in: LEGACY_ROLLUP_CODES } },
  });
  counts.legacyRollupRowsDeleted = deleted.count;
  const unknown = await prisma.dailyFaultStat.deleteMany({
    where: { faultCode: 'unknown', newCount: 0, openCount: 0 },
  });
  counts.emptyUnknownRowsDeleted = unknown.count;
  return counts;
}

const WX2_PRODUCT_ID = '90wi2aimyqstn9qc';

async function renameWx2BitFaultAlerts(prisma: BackfillDb): Promise<number> {
  const labels = PRODUCT_FAULT_BITMAP_LABELS[WX2_PRODUCT_ID]?.fault ?? [];
  const devices = await prisma.device.findMany({
    where: { productId: WX2_PRODUCT_ID },
    select: { id: true },
  });
  if (devices.length === 0) return 0;
  const alerts = await prisma.alert.findMany({
    where: {
      deviceId: { in: devices.map((device) => device.id) },
      faultCode: { startsWith: 'bit' },
    },
    select: { id: true, faultCode: true, activeKey: true, fingerprint: true, status: true },
  });
  let renamed = 0;
  for (const alert of alerts) {
    const from = alert.faultCode ?? '';
    const next = faultCodeReplacingBitLabel(from, labels);
    if (!next) continue;
    const nextKey = alert.activeKey ? renameBitAlertKey(alert.activeKey, from, next) : null;
    if (nextKey) {
      const clash = await prisma.alert.findUnique({ where: { activeKey: nextKey } });
      if (clash && clash.id !== alert.id) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: {
            status: AlertStatus.closed,
            closedAt: new Date(),
            closedReason: 'migration_dedupe',
            activeKey: null,
            faultCode: next,
            title: `故障 ${next}`,
          },
        });
        renamed += 1;
        continue;
      }
    }
    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        faultCode: next,
        title: `故障 ${next}`,
        activeKey: nextKey,
        fingerprint: alert.fingerprint ? renameBitAlertKey(alert.fingerprint, from, next) : nextKey,
      },
    });
    renamed += 1;
  }
  return renamed;
}

function isUniqueConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function faultAlertSelfCheck(prisma: Pick<PrismaClient, 'alert'>): Promise<{
  openWithoutActiveKey: number;
  badOffline: number;
}> {
  const [openWithoutActiveKey, badOffline] = await Promise.all([
    prisma.alert.count({
      where: { status: { not: AlertStatus.closed }, activeKey: null },
    }),
    prisma.alert.count({
      where: {
        status: { not: AlertStatus.closed },
        source: 'local_offline',
        NOT: { category: 'connectivity', faultCode: 'offline' },
      },
    }),
  ]);
  return { openWithoutActiveKey, badOffline };
}
