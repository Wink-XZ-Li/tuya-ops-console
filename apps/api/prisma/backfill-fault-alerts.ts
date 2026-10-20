import { PrismaClient } from '@prisma/client';
import { backfillFaultAlerts, faultAlertSelfCheck } from '../src/alerts/backfill-fault-alerts';

const prisma = new PrismaClient();

async function main() {
  const counts = await backfillFaultAlerts(prisma);
  const check = await faultAlertSelfCheck(prisma);
  console.log(JSON.stringify({ counts, check }, null, 2));
  if (check.openWithoutActiveKey !== 0 || check.badOffline !== 0) {
    throw new Error(
      `fault alert self-check failed: openWithoutActiveKey=${check.openWithoutActiveKey} badOffline=${check.badOffline}`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
