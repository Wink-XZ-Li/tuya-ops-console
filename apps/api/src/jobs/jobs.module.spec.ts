import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { JobsModule } from './jobs.module';

describe('JobsModule', () => {
  const prev = process.env.JOBS_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.JOBS_ENABLED;
    else process.env.JOBS_ENABLED = prev;
  });

  async function boot() {
    const moduleRef = await Test.createTestingModule({ imports: [JobsModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
      })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('schedules offline, retention, and rollup on a single API', async () => {
    process.env.JOBS_ENABLED = 'true';
    const moduleRef = await boot();
    try {
      const names = moduleRef.get(SchedulerRegistry).getIntervals().sort();
      expect(names).toEqual(['offline-rule', 'retention', 'rollup']);
    } finally {
      await moduleRef.close();
    }
  });

  it('removes those intervals when JOBS_ENABLED=false', async () => {
    process.env.JOBS_ENABLED = 'false';
    const moduleRef = await boot();
    try {
      expect(moduleRef.get(SchedulerRegistry).getIntervals()).toEqual([]);
    } finally {
      await moduleRef.close();
    }
  });
});
