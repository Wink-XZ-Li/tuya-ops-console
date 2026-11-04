import { JOBS_SINGLE_REPLICA_RULE, jobsEnabled } from './jobs-enabled';

describe('jobsEnabled', () => {
  it('runs jobs by default and turns them off only for an explicit disable', () => {
    expect(jobsEnabled({})).toBe(true);
    expect(jobsEnabled({ JOBS_ENABLED: 'true' })).toBe(true);
    expect(jobsEnabled({ JOBS_ENABLED: 'false' })).toBe(false);
    expect(jobsEnabled({ JOBS_ENABLED: '0' })).toBe(false);
    expect(jobsEnabled({ JOBS_ENABLED: 'off' })).toBe(false);
  });

  it('states that multiple API replicas must not run jobs', () => {
    expect(JOBS_SINGLE_REPLICA_RULE).toContain('禁止多副本跑 job');
    expect(JOBS_SINGLE_REPLICA_RULE).toContain('JOBS_ENABLED=false');
  });
});
