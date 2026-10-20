import { PrismaClient, AdminRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { backfillFaultAlerts } from '../src/alerts/backfill-fault-alerts';
import { DEMO_FAULT_COPY, PRODUCT_FAULT_BITMAP_LABELS } from '../src/devices/product-fault-schemas';

const prisma = new PrismaClient();

const DEMO_PRODUCTS = [
  'uhmj5b0ba31zpme6',
  'qxjzruuqz40bty7e',
  'nohrp3vbmef7vxvx',
];

const FAULT_CODES = ['E1', 'E3', 'E0'];

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

  // Optional chart seed: last 7 days of rollups for mock UI.
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const day = formatYmd(d);
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

      for (const [fi, faultCode] of FAULT_CODES.entries()) {
        await prisma.dailyFaultStat.upsert({
          where: {
            day_productId_faultCode: { day, productId, faultCode },
          },
          create: {
            day,
            productId,
            faultCode,
            openCount: 1 + ((i + fi) % 3),
            newCount: 1 + ((i + fi) % 4),
            closedCount: (i + fi) % 3,
            mttrMinutesAvg: 30 + fi * 15 + i * 5,
          },
          update: {
            openCount: 1 + ((i + fi) % 3),
            newCount: 1 + ((i + fi) % 4),
            closedCount: (i + fi) % 3,
            mttrMinutesAvg: 30 + fi * 15 + i * 5,
          },
        });
      }
    }

    for (const [fi, faultCode] of FAULT_CODES.entries()) {
      await prisma.dailyFaultStat.upsert({
        where: {
          day_productId_faultCode: { day, productId: '', faultCode },
        },
        create: {
          day,
          productId: '',
          faultCode,
          openCount: 3 + ((i + fi) % 4),
          newCount: 2 + ((i + fi) % 5),
          closedCount: 1 + ((i + fi) % 3),
          mttrMinutesAvg: 45 + fi * 10,
        },
        update: {
          openCount: 3 + ((i + fi) % 4),
          newCount: 2 + ((i + fi) % 5),
          closedCount: 1 + ((i + fi) % 3),
          mttrMinutesAvg: 45 + fi * 10,
        },
      });
    }
  }

  await backfillFaultAlerts(prisma);
}

async function seedFaultCodeDefinitions() {
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
            ...(copy
              ? { symptom: copy.symptom, suggestedAction: copy.suggestedAction }
              : {}),
          },
        });
      }
    }
  }
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
