import { PrismaClient, AdminRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
