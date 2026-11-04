/**
 * Jobs run inside the single API process. There is no distributed lock.
 * A second API replica with the default (enabled) would double-open offline
 * alerts and double-write rollups. Extra replicas must set JOBS_ENABLED=false.
 */
export function jobsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.JOBS_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'no';
}

export const JOBS_SINGLE_REPLICA_RULE =
  '禁止多副本跑 job：未做分布式锁。只允许一个 API 进程调度 offline / retention / rollup。水平扩展时其余副本必须设 JOBS_ENABLED=false，或改由单独 worker 承载（本阶段未做 worker 入口）。';
