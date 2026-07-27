import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('rejects bad password', async () => {
    const prisma = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: '1',
          username: 'admin',
          passwordHash: '$2a$10$invalid',
          role: 'admin',
        }),
      },
    } as any;
    const jwt = { signAsync: jest.fn() } as any;
    await expect(new AuthService(prisma, jwt).login('admin', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
