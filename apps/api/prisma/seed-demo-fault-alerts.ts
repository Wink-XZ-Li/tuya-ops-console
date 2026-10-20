import { AlertStatus, Prisma, PrismaClient } from '@prisma/client';
import { backfillFaultAlerts } from '../src/alerts/backfill-fault-alerts';
import { RollupJob } from '../src/analytics/rollup.job';
import { asRecord, decodeBitmapLabels } from '../src/devices/device-derived';
import { DEMO_FAULT_COPY, PRODUCT_FAULT_BITMAP_LABELS } from '../src/devices/product-fault-schemas';

const prisma = new PrismaClient();
const WX2 = '90wi2aimyqstn9qc';

type DeviceRow = { id: string; deviceId: string; productId: string; name: string | null };

function labelsOf(productId: string): string[] {
  return PRODUCT_FAULT_BITMAP_LABELS[productId]?.fault ?? [];
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600_000);
}

async function upsertDefinitions(): Promise<void> {
  for (const [productId, byCode] of Object.entries(PRODUCT_FAULT_BITMAP_LABELS)) {
    for (const [code, labels] of Object.entries(byCode)) {
      for (const [sortOrder, label] of labels.entries()) {
        const copy = DEMO_FAULT_COPY[label];
        await prisma.faultCodeDefinition.upsert({
          where: { productId_code_label: { productId, code, label } },
          create: {
            productId,
            code,
            label,
            sortOrder,
            symptom: copy?.symptom,
            suggestedAction: copy?.suggestedAction,
          },
          update: {
            sortOrder,
            ...(copy ? { symptom: copy.symptom, suggestedAction: copy.suggestedAction } : {}),
          },
        });
      }
    }
  }
  await prisma.faultCodeDefinition.deleteMany({
    where: { productId: WX2, label: { startsWith: 'bit' } },
  });
}

async function ensureAlert(input: {
  device: DeviceRow;
  faultCode: string;
  status: 'open' | 'closed';
  closedReason?: string;
  openedAt: Date;
  closedAt?: Date;
}): Promise<void> {
  const fingerprint = `demo-sample:${input.device.id}:${input.faultCode}:${input.status}`;
  const activeKey = input.status === 'open' ? fingerprint : null;
  const data = {
    deviceId: input.device.id,
    source: 'device_fault',
    category: 'fault',
    faultCode: input.faultCode,
    title: `故障 ${input.faultCode}`,
    status: input.status === 'open' ? AlertStatus.open : AlertStatus.closed,
    openedAt: input.openedAt,
    closedAt: input.closedAt ?? null,
    closedReason: input.closedReason ?? null,
    conditionStartedAt: input.openedAt,
    occurrenceCount: 1,
    lastSeenAt: input.closedAt ?? new Date(),
    activeKey,
    fingerprint,
    detail: { demoSample: true, dpCode: 'fault', label: input.faultCode } as Prisma.InputJsonValue,
  };
  const existing = await prisma.alert.findFirst({ where: { fingerprint } });
  if (existing) {
    await prisma.alert.update({ where: { id: existing.id }, data });
    return;
  }
  if (activeKey) {
    const clash = await prisma.alert.findUnique({ where: { activeKey } });
    if (clash) {
      await prisma.alert.update({ where: { id: clash.id }, data });
      return;
    }
  }
  await prisma.alert.create({ data });
}

async function closeClearedBitmapAlerts(device: DeviceRow): Promise<void> {
  const labels = labelsOf(device.productId);
  if (labels.length === 0) return;
  const row = await prisma.device.findUnique({
    where: { id: device.id },
    select: { statusJson: true },
  });
  const active = new Set(decodeBitmapLabels(asRecord(row?.statusJson).fault, labels));
  const open = await prisma.alert.findMany({
    where: {
      deviceId: device.id,
      category: 'fault',
      status: { not: AlertStatus.closed },
      faultCode: { in: labels },
      NOT: { fingerprint: { startsWith: 'demo-sample:' } },
    },
    select: { id: true, faultCode: true },
  });
  const now = new Date();
  for (const alert of open) {
    if (!alert.faultCode || active.has(alert.faultCode)) continue;
    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        status: AlertStatus.closed,
        closedAt: now,
        closedReason: 'auto_clear',
        activeKey: null,
      },
    });
  }
}

async function ensureOpenCode(device: DeviceRow, faultCode: string, openedAt: Date): Promise<void> {
  const already = await prisma.alert.findFirst({
    where: {
      deviceId: device.id,
      faultCode,
      category: 'fault',
      status: { not: AlertStatus.closed },
    },
  });
  if (already) return;
  await ensureAlert({ device, faultCode, status: 'open', openedAt });
}

function pickDevices(devices: DeviceRow[]): { primary: DeviceRow; secondary: DeviceRow } {
  if (devices.length < 2) {
    throw new Error('库内设备少于 2 台，不能写演示告警');
  }
  const primary =
    devices.find((device) => device.productId === WX2) ??
    devices.find((device) => device.deviceId.startsWith('vdevo')) ??
    devices[0];
  const secondary =
    devices.find(
      (device) =>
        device.id !== primary.id &&
        labelsOf(device.productId).includes('E3') &&
        labelsOf(device.productId).includes('E4'),
    ) ?? devices.find((device) => device.id !== primary.id);
  if (!secondary) throw new Error('找不到第二台已有设备');
  return { primary, secondary };
}

async function main() {
  await upsertDefinitions();
  const backfill = await backfillFaultAlerts(prisma);

  const devices = await prisma.device.findMany({
    select: { id: true, deviceId: true, productId: true, name: true },
    orderBy: { deviceId: 'asc' },
  });
  const { primary, secondary } = pickDevices(devices);

  await closeClearedBitmapAlerts(primary);
  await ensureOpenCode(primary, 'E3', hoursAgo(4));
  await ensureOpenCode(secondary, 'E4', hoursAgo(3));
  await ensureOpenCode(secondary, 'E5', hoursAgo(5));
  await ensureAlert({
    device: primary,
    faultCode: 'E4',
    status: 'closed',
    closedReason: 'auto_clear',
    openedAt: hoursAgo(26),
    closedAt: hoursAgo(2),
  });
  await ensureAlert({
    device: secondary,
    faultCode: 'E3',
    status: 'closed',
    closedReason: 'manual',
    openedAt: hoursAgo(50),
    closedAt: hoursAgo(20),
  });

  const rollup = new RollupJob(prisma as never);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  await rollup.rollupDay(yesterday);
  await rollup.rollupDay(today);

  const open = await prisma.alert.findMany({
    where: { category: 'fault', status: { not: AlertStatus.closed }, faultCode: { startsWith: 'E' } },
    select: {
      faultCode: true,
      device: { select: { deviceId: true, productId: true } },
    },
  });
  const closed = await prisma.alert.findMany({
    where: { category: 'fault', status: AlertStatus.closed, faultCode: { startsWith: 'E' }, closedReason: { not: null } },
    select: { faultCode: true, closedReason: true, device: { select: { deviceId: true } } },
    orderBy: { closedAt: 'desc' },
    take: 10,
  });
  const copy = await prisma.faultCodeDefinition.findMany({
    where: { productId: primary.productId, label: { in: ['E3', 'E4', 'E5'] } },
    select: { label: true, symptom: true, suggestedAction: true },
  });
  const bitLeft = await prisma.alert.count({
    where: { device: { productId: WX2 }, status: { not: AlertStatus.closed }, faultCode: { startsWith: 'bit' } },
  });
  console.log(
    JSON.stringify(
      {
        backfill,
        primary: primary.deviceId,
        secondary: secondary.deviceId,
        openDevices: [...new Set(open.map((row) => row.device.deviceId))],
        openCodes: [...new Set(open.map((row) => row.faultCode))],
        closedSample: closed.slice(0, 4),
        copy,
        openBitAlertsLeft: bitLeft,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
