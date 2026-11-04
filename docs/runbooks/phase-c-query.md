# 阶段 C · 查询与存储

本阶段只让看板和详情在 3000 台规模下可查。不新增看板指标，不接售后、通知、规则引擎，不做 `DeviceDpSample`。

## 拆 / 合 / 不动

- **合** 故障看板的区间趋势、故障码直方图、平均持续时长读 `DailyFaultStat`。设备用量的日趋势和模式分布读 `DailyDeviceMetric`。当前在线 / 故障台数是 `Device` 上的 `GROUP BY` 计数，不是把每台的 `statusJson` 拉回应用。
- **拆** `analytics.service.ts` 里对已关闭告警的 `take: 5000`。质量故障台数和待处理台数改成 `COUNT(DISTINCT deviceId)`，不再把告警行装进内存。
- **拆** 设备详情长窗。窗口 ≤24 小时可以读 `DeviceEvent`。更长的窗口按页读取（每页 400 行），服务端收成最多 288 个点。7 天状态条不再一次 `take: 8000`，连通色带不再一次 `take: 4000`。分辨率大约是「区间 / 288」，产品接受这个粗细（决策 D6）。
- **合** `DeviceEvent` 仍是热表（它有指向 `Device` 的外键，MySQL 不能在带外键的表上做分区）。超过 `EVENT_HOT_DAYS`（默认 14 天）的行搬进 `DeviceEventArchive`。冷表按月 `RANGE` 分区，主键带 `eventTime`，没有外键。
- **合** 日汇总不再三次 `alert.findMany` 全表拉回内存。`RollupJob` 用 SQL `GROUP BY` 写 `DailyFaultStat` / `DailyDeviceMetric`。故障码规则不变：`connectivity`、`offline`、空码、`unknown` 不进故障统计。模式标签仍要从 `statusJson` 里读，按 400 台一页扫，不另建缓存表。
- **不动** 告警按码内核：`Alert.activeKey`、offline 不等于 fault、热水器 E1/E3/E4/E2、两份 `PRODUCT_*.json`。
- **不动** `DeviceDpSample` 投影。dpId 过滤事件仍是既有的 `take: 501` 上限，本阶段不改。

没有与 `Daily*` 平行的第二套看板缓存表。

## 分批 retention

`RetentionJob` 每天跑一次（仍受 `JOBS_ENABLED` 约束，禁止多副本跑 job）。

1. 给冷表补未来几个月的分区；整月都早于 `RETENTION_DAYS` 的分区直接 `DROP PARTITION`（改元数据，不逐行删）。
2. 热表里早于保留期的行：`DELETE ... ORDER BY eventTime LIMIT RETENTION_BATCH_SIZE`（默认 1000），循环到本批不足一批。
3. 热表里落在「保留期内、但早于热窗口」的行：按批 `INSERT` 进冷表，再按 id 删除热行。
4. 冷表残留、指令日志、审计日志、已关闭告警同样按批删除。

每一批是一次提交。批耗时超过 `RETENTION_BATCH_LOCK_BUDGET_MS`（默认 2000）就停，并打 error，避免一把锁住全表。

只计数、不删除：

```bash
RETENTION_DRY_RUN=true
```

或在进程里 `retention.run({ dryRun: true })`。日志形如 `Retention dry-run ... batches=... lockBudgetMs=2000`。`DailyDeviceMetric` / `DailyFaultStat` / `OpsReport` 不在这里删。

## 索引

迁移 `20261104120000_phase_c_query_storage` 补了这些索引，给看板、列表和详情用：

- `Device(createdAt)`、`Device(productId, createdAt)`、`Device(faultStatus, productId)`
- `DeviceEvent(deviceId, bizCode, eventTime)`
- `Alert(category, openedAt)`、`Alert(status, closedAt)`、`Alert(openedAt)`
- `DailyDeviceMetric(productId, day)`、`DailyFaultStat(productId, day)`

详情那条在 `bizCode IN (...)` 时优化器会去扫 `eventTime` 索引。读路径因此只按 `deviceId + eventTime` 取范围，bizCode 在服务里过滤。`EXPLAIN` 期望 `type=range`、`key=DeviceEvent_deviceId_eventTime_idx`。故障 `COUNT(DISTINCT)` 在告警只有几十行时优化器仍可能选 `ALL`，索引 `Alert_category_openedAt_idx` 已经在 `possible_keys` 里。

## 3k 基准

```bash
docker compose up -d mysql
pnpm --filter @tuya-ops/api exec prisma migrate deploy
pnpm query:load
```

脚本写入至少 3000 台 `qload-*` 设备、近 7 天每天一条事件、一台更密的设备（约 2 分钟一条，7 天约 5000 行），加上 7 天日汇总和少量故障告警。然后计时。

本地 MySQL 8 上一次结果（`docs/runbooks/phase-c-query-result.json`，跑完已删掉 `qload-*`）：

| 路径 | 耗时 |
| --- | --- |
| 设备列表 + 故障看板 SQL | 29ms（预算 2000ms） |
| 密设备 7 天详情，13 页 × 最多 400 行 | 52ms |
| `DELETE ... LIMIT 1000` 一批 | 38ms，删掉 1000 行 |

`EXPLAIN`：设备列表走 `Device_createdAt_idx`（Backward index scan）。详情走 `DeviceEvent_deviceId_eventTime_idx`，`type=range`。故障去重计数在 80 行告警上是 `ALL`，`Alert_category_openedAt_idx` 出现在 `possible_keys`。

可调：`DEVICE_COUNT`（默认 3000）、`EVENT_DAYS`（默认 7）、`KEEP=1` 留下数据。
