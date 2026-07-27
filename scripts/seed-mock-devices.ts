import { DeviceOnlineStatus, PrismaClient } from '@prisma/client';
import { MOCK_DEVICES } from '../apps/api/src/tuya/tuya.mock';

const prisma = new PrismaClient();

const END_USERS = [
  { tuyaUid: 'uid-demo-001', username: 'Demo用户A', mobile: '13800000001' },
  { tuyaUid: 'uid-demo-002', username: 'Demo用户B', mobile: '13800000002' },
  { tuyaUid: 'uid-demo-003', username: 'Demo用户C', mobile: '13800000003' },
];

const DEVICE_USER_BINDINGS: Record<string, string[]> = {
  'demo-001': ['uid-demo-001', 'uid-demo-002'],
  'demo-003': ['uid-demo-001'],
  'demo-006': ['uid-demo-003'],
};

function toOnlineStatus(online?: boolean): DeviceOnlineStatus {
  if (online === true) return DeviceOnlineStatus.online;
  if (online === false) return DeviceOnlineStatus.offline;
  return DeviceOnlineStatus.unknown;
}

async function main() {
  for (const mock of MOCK_DEVICES) {
    await prisma.device.upsert({
      where: { deviceId: mock.deviceId },
      update: {
        productId: mock.productId,
        name: mock.name,
        onlineStatus: toOnlineStatus(mock.online),
      },
      create: {
        deviceId: mock.deviceId,
        productId: mock.productId,
        name: mock.name,
        onlineStatus: toOnlineStatus(mock.online),
      },
    });
  }

  for (const user of END_USERS) {
    await prisma.endUser.upsert({
      where: { tuyaUid: user.tuyaUid },
      update: { username: user.username, mobile: user.mobile },
      create: user,
    });
  }

  for (const [deviceId, tuyaUids] of Object.entries(DEVICE_USER_BINDINGS)) {
    const device = await prisma.device.findUnique({ where: { deviceId } });
    if (!device) continue;

    for (const tuyaUid of tuyaUids) {
      const endUser = await prisma.endUser.findUnique({ where: { tuyaUid } });
      if (!endUser) continue;

      await prisma.deviceBinding.upsert({
        where: {
          deviceId_endUserId: { deviceId: device.id, endUserId: endUser.id },
        },
        update: {},
        create: { deviceId: device.id, endUserId: endUser.id },
      });
    }
  }

  const count = await prisma.device.count();
  if (count >= 10) throw new Error('Demo 设备数必须小于 10');
  console.log(`Seeded ${count} mock devices and ${END_USERS.length} end users`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
