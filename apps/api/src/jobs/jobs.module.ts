import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry, ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { JOBS_SINGLE_REPLICA_RULE, jobsEnabled } from './jobs-enabled';
import { OfflineRuleJob } from './offline-rule.job';
import { RetentionJob } from './retention.job';
import { RollupJob } from './rollup.job';

const SCHEDULED_JOBS = ['offline-rule', 'retention', 'rollup'] as const;

/**
 * Single scheduler for offline, retention, and rollup.
 * JOBS_ENABLED is read on bootstrap (after the root `.env` load), not at import time.
 * When it is false the three intervals are removed, so this process does not run them.
 */
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [OfflineRuleJob, RetentionJob, RollupJob],
})
export class JobsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsModule.name);

  constructor(private readonly registry: SchedulerRegistry) {}

  onApplicationBootstrap(): void {
    if (jobsEnabled()) {
      this.logger.log(JOBS_SINGLE_REPLICA_RULE);
      return;
    }
    const registered = new Set(this.registry.getIntervals());
    for (const name of SCHEDULED_JOBS) {
      if (registered.has(name)) this.registry.deleteInterval(name);
    }
    this.logger.warn(
      'JOBS_ENABLED=false; offline / retention / rollup are not scheduled in this process',
    );
  }
}
