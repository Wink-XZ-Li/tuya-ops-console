import { PrismaClient, AdminRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { backfillFaultAlerts } from '../src/alerts/backfill-fault-alerts';
import {
  upsertFaultCodeDefinitions,
  verifyWaterHeaterDictionary,
} from '../src/fault-codes/fault-code-catalog';
import { ensureFaultCodeGroups } from '../src/fault-codes/fault-code-groups';

const prisma = new PrismaClient();

const DEMO_PRODUCTS = [
  'uhmj5b0ba31zpme6',
  'qxjzruuqz40bty7e',
  'nohrp3vbmef7vxvx',
];

/** 早期图表种子写过的故障码。这些码被套到多个产品上，不是各产品位图。 */
const DEMO_SEEDED_FAULT_CODES = ['E0', 'E1', 'E3'];

async function main() {
  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
  await seedFaultCodeDefinitions();

  for (const [username, role] of [
    ['admin', AdminRole.admin],
    ['operator', AdminRole.operator],
    ['readonly', AdminRole.readonly],
  ] as const) {
    await prisma.adminUser.upsert({
      where: { username },
      update: { passwordHash, role },
      create: { username, passwordHash, role },
    });
  }

  // Optional chart seed: last 7 days of device rollups for mock UI.
  // 故障码不再按 E0/E1/E3 套到每个演示产品上；并清掉已经写入的这批演示行。
  const today = new Date();
  const seededDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const day = formatYmd(d);
    seededDays.push(day);
    const baseOnline = 40 + (6 - i) * 2;
    const total = 60 + (i % 3);

    await prisma.dailyDeviceMetric.upsert({
      where: { day_productId: { day, productId: '' } },
      create: {
        day,
        productId: '',
        onlineCount: baseOnline,
        offlineCount: Math.max(total - baseOnline, 0),
        faultCount: 2 + (i % 3),
        totalDevices: total,
        modeCounts: { auto: 20 + i, cool: 10, eco: 5 + (i % 2), sleep: 3 },
      },
      update: {
        onlineCount: baseOnline,
        offlineCount: Math.max(total - baseOnline, 0),
        faultCount: 2 + (i % 3),
        totalDevices: total,
        modeCounts: { auto: 20 + i, cool: 10, eco: 5 + (i % 2), sleep: 3 },
      },
    });

    for (const [pi, productId] of DEMO_PRODUCTS.entries()) {
      const pTotal = 15 + pi * 5;
      const pOnline = 10 + pi * 3 + (i % 2);
      await prisma.dailyDeviceMetric.upsert({
        where: { day_productId: { day, productId } },
        create: {
          day,
          productId,
          onlineCount: pOnline,
          offlineCount: Math.max(pTotal - pOnline, 0),
          faultCount: 1 + (pi % 2),
          totalDevices: pTotal,
          modeCounts: { auto: 8 + pi, cool: 4, sleep: 1 },
        },
        update: {
          onlineCount: pOnline,
          offlineCount: Math.max(pTotal - pOnline, 0),
          faultCount: 1 + (pi % 2),
          totalDevices: pTotal,
          modeCounts: { auto: 8 + pi, cool: 4, sleep: 1 },
        },
      });
    }
  }

  await prisma.dailyFaultStat.deleteMany({
    where: {
      day: { in: seededDays },
      faultCode: { in: DEMO_SEEDED_FAULT_CODES },
      productId: { in: [...DEMO_PRODUCTS, ''] },
    },
  });

  await backfillFaultAlerts(prisma);
}

async function seedFaultCodeDefinitions() {
  await upsertFaultCodeDefinitions(prisma);
  await verifyWaterHeaterDictionary(prisma);
  await ensureFaultCodeGroups(prisma);
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
