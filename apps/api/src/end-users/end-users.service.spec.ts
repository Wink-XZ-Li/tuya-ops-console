import { EndUsersService } from './end-users.service';

describe('EndUsersService.getCloudSnapshot', () => {
  it('annotates cloud devices with inConsole/allowedProduct and strips nothing extra', async () => {
    const prisma = {
      endUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: '1',
          tuyaUid: 'ay1',
          username: 'u',
          remark: null,
        }),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: '1',
          tuyaUid: 'ay1',
          ...data,
        })),
      },
      device: {
        findMany: jest.fn().mockResolvedValue([{ deviceId: 'dev-in' }]),
      },
    } as any;

    const tuya = {
      getUserProfile: jest.fn().mockResolvedValue({
        tuyaUid: 'ay1',
        username: 'u',
        nickName: '昵称',
        countryCode: '86',
        raw: { nick_name: '昵称' },
        userProperties: [{ code: 'dataAuthorization', value: '1' }],
      }),
      listUserHomes: jest.fn().mockResolvedValue([
        { homeId: 'h1', name: '家', role: 'OWNER' },
      ]),
      listUserDevices: jest.fn().mockResolvedValue([
        {
          deviceId: 'dev-in',
          productId: 'uhmj5b0ba31zpme6',
          name: 'A',
          from: 'home',
        },
        {
          deviceId: 'dev-out',
          productId: 'other-pid',
          name: 'B',
          from: 'sharing',
        },
      ]),
    };

    const svc = new EndUsersService(prisma, tuya as any);
    const snap = await svc.getCloudSnapshot('ay1');

    expect(snap.homes).toHaveLength(1);
    expect(snap.cloudDevices).toEqual([
      expect.objectContaining({
        deviceId: 'dev-in',
        inConsole: true,
        allowedProduct: true,
      }),
      expect.objectContaining({
        deviceId: 'dev-out',
        inConsole: false,
        allowedProduct: true,
      }),
    ]);
    expect(snap.user.nickName).toBe('昵称');
    expect(snap.warnings).toEqual([]);
  });
});
