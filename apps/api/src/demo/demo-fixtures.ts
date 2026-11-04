export const DEMO_USER_UID_PREFIX = 'uid-demo-';
export const DEMO_DEVICE_ID_PREFIX = 'demo-';

export function isDemoFixtureUid(tuyaUid: string | null | undefined): boolean {
  return typeof tuyaUid === 'string' && tuyaUid.startsWith(DEMO_USER_UID_PREFIX);
}

export function isDemoFixtureDeviceId(deviceId: string | null | undefined): boolean {
  return typeof deviceId === 'string' && deviceId.startsWith(DEMO_DEVICE_ID_PREFIX);
}

/** One-time migration switch. Reconcile does not purge fixtures unless this is set. */
export function demoFixturePurgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.DEMO_FIXTURE_PURGE ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

type DeleteMany = (args: unknown) => Promise<{ count?: number } | unknown>;

export type DemoFixtureDb = {
  endUser: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    deleteMany: DeleteMany;
  };
  device: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    deleteMany: DeleteMany;
  };
  deviceBinding: { deleteMany: DeleteMany };
  deviceEvent: { deleteMany: DeleteMany };
  commandLog: { deleteMany: DeleteMany };
  alert: { deleteMany: DeleteMany };
  deviceEventArchive?: { deleteMany: DeleteMany };
};

async function deletedCount(result: { count?: number } | unknown): Promise<number> {
  if (result && typeof result === 'object' && 'count' in result) {
    const count = (result as { count?: number }).count;
    return typeof count === 'number' ? count : 0;
  }
  return 0;
}

/**
 * Removes seeded demo users and demo-* devices, including cold archive rows.
 * Only call this when DEMO_FIXTURE_PURGE is set. Turn the flag off afterwards.
 */
export async function purgeDemoFixtures(
  db: DemoFixtureDb,
): Promise<{ purgedDemoUsers: number; purgedMock: number }> {
  const demoUsers = await db.endUser.findMany({
    where: { tuyaUid: { startsWith: DEMO_USER_UID_PREFIX } },
    select: { id: true },
  });
  let purgedDemoUsers = 0;
  if (demoUsers.length > 0) {
    const ids = demoUsers.map((user) => user.id);
    await db.deviceBinding.deleteMany({ where: { endUserId: { in: ids } } });
    purgedDemoUsers = await deletedCount(
      await db.endUser.deleteMany({ where: { id: { in: ids } } }),
    );
  }

  const mockDevices = await db.device.findMany({
    where: { deviceId: { startsWith: DEMO_DEVICE_ID_PREFIX } },
    select: { id: true },
  });
  let purgedMock = 0;
  if (mockDevices.length > 0) {
    const ids = mockDevices.map((device) => device.id);
    await db.deviceBinding.deleteMany({ where: { deviceId: { in: ids } } });
    await db.deviceEvent.deleteMany({ where: { deviceId: { in: ids } } });
    if (db.deviceEventArchive?.deleteMany) {
      await db.deviceEventArchive.deleteMany({ where: { deviceId: { in: ids } } });
    }
    await db.commandLog.deleteMany({ where: { deviceId: { in: ids } } });
    await db.alert.deleteMany({ where: { deviceId: { in: ids } } });
    purgedMock = await deletedCount(await db.device.deleteMany({ where: { id: { in: ids } } }));
  }

  return { purgedDemoUsers, purgedMock };
}
