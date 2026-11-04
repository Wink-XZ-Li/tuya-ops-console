# 交给 IT · 生产剖面与扩容信号

本文件是阶段 D 的交接说明。售后、通知、规则引擎、看板新指标都不在这次范围内。单独的 API / worker 进程入口也没有做：定时任务仍在一个 API 进程里，规则见 `docs/runbooks/phase-b-ingest.md`。

这里的「3000 台」是规划规格（保留约 90 天、上报约 0.2～1 条/台/分钟、部署默认 2C4G + 托管 MySQL）。**本文不宣称系统已经通过 3000 台、30 分钟稳态。** 已跑和未跑的范围写在 `docs/runbooks/phase-d-capacity.md`。

## 1. 生产剖面启动

`.env` 至少：

```bash
APP_PROFILE=production
DEMO_MODE=live
VITE_DEMO_MODE=live
```

`APP_PROFILE=production` 且 `DEMO_MODE` 不是 `live` 时，API 在 `listen` 之前退出，日志含 `refuses TuyaMockClient`。不会悄悄改用 mock 客户端，也不会在 OpenAPI 失败时改用演示分析曲线。

启动成功时应看到：

- `APP_PROFILE=production DEMO_MODE=live TuyaLiveClient; virtual analytics cannot replace live`
- `Using TuyaLiveClient (OpenAPI)`
- `DEVICE_SOFT_CAP=... (warn only; ingest is not truncated)`。默认 10000，只告警，不按 50 截断。
- bridge：`Bridge started: Tuya MQ WebSocket (prod) → Redpanda`

演示分析只在 `APP_PROFILE=demo` 下生效：环境变量 `DEMO_ANALYTICS=virtual`，或请求头 `X-Demo-Analytics: virtual`。生产忽略这两处。前端只有构建时 `VITE_DEMO_ANALYTICS=virtual` 才会带这个头。

## 2. 健康检查

登录后：

- `GET /api/system-health`：现场探测，不重启任何进程。
- `POST /api/system-health/check`：同样的探测，并写审计。
- `GET /api/system-health/catalog`：故障码和步骤。

要看的组件：`mysql`、`kafka_consumer`、`bridge`、`device_event_freshness`。生产进程起不来 mock 客户端，因此生产健康结果里不应再靠 `API_DEMO_MOCK` 判断「是不是真数据」。

Kafka 黄线 / 红线：

```bash
SYSTEM_HEALTH_KAFKA_LAG_WARN=100
SYSTEM_HEALTH_KAFKA_LAG_CRIT=1000
```

`kafka_consumer` 为黄或红、或故障码 `KAFKA_LAG`，就是消费积压信号。

## 3. Bridge 消费

1. 只保持一条涂鸦 Failover 连接。本仓库不改成 Shared 多消费者。
2. 进程日志出现 WebSocket open，以及有设备消息时的 `Forwarded`。
3. pong 超时或 stale watchdog 会打日志并重连。步骤在 `docs/runbooks/phase-b-ingest.md`。
4. 对照 `/api/system-health`：消费组 Stable，lag 低于黄线。控制台「消费者数量」主要反映原生 Pulsar，以 bridge 日志和这里的 lag 为准。

## 4. 备份

入库之后的记录在 MySQL。Redpanda 是缓冲，lag 回到 0 之后不要把 broker 磁盘当成备份。

要进备份的表：`Device`、`DeviceEvent`、`DeviceEventArchive`、`Alert`、`DailyDeviceMetric`、`DailyFaultStat`、`FaultCodeDefinition`、`EndUser`、`DeviceBinding`、`AuditLog`、`OpsReport`。

托管 MySQL（腾讯云精简档）：打开每日自动备份，保留不少于 7 天，并保留 binlog 以便按时间点恢复。应用机磁盘故障不能代替库备份。

本机 Compose 的临时导出：

```bash
docker compose exec mysql mysqldump -uops -pops --single-transaction --default-character-set=utf8mb4 tuya_ops > "tuya_ops-$(date +%F).sql"
```

这次没有做恢复演练。导出文件要放到与数据库磁盘分开的位置。

冷数据：超过 `EVENT_HOT_DAYS`（默认 14 天）的事件在 `DeviceEventArchive`，按月分区。超过 `RETENTION_DAYS`（默认 90）的整月分区会被 `DROP PARTITION`。日汇总表不在这条清理里。细节见 `docs/runbooks/phase-c-query.md`。

## 5. 同步

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `SYNC_PAGE_SIZE` | 20 | 设备列表每页条数，最大 100 |
| `SYNC_USER_PAGE_SIZE` | 100 | 用户列表每页条数，最大 100 |
| `SYNC_PAGE_INTERVAL_MS` | 200 | 翻页前的停顿。`0` 或 `off` 关闭 |

全量同步每翻一页写审计 `sync.reconcile.progress`，结束写 `sync.reconcile`（含 `pages`、`pageSize`、`intervalMs`、`durationMs`、`devicesSynced`）。用户同步对应 `sync.reconcileUsers.progress` / `sync.reconcileUsers`。

地理编码失败时设备行照常写入，坐标保留，地址退回本地拼法。这条降级没有改。

演示夹具：默认同步**不会**删除 `uid-demo-*` / `demo-*`。从演示库切到真机、需要清掉这批种子时，设一次 `DEMO_FIXTURE_PURGE=1`，触发一次全量同步，确认审计里的 `demoFixturePurge=true` 和删除计数后，把变量去掉再重启。这是一次性迁移，不是每次对账的隐藏步骤。

## 6. 扩容信号

三条一起看。单独一条升高不一定要加机器。

### 磁盘

规划假设下的事件量（算术，不是测量）：

- 0.2 条/台/分钟 × 3000 台 × 90 天 ≈ 7780 万行
- 1 条/台/分钟 × 3000 台 × 90 天 ≈ 3.89 亿行

热表只留约 14 天，更早的在按月分区的冷表里，过保留期整月丢弃。磁盘信号看 MySQL 数据卷占用：到大约七成就安排扩容或确认 retention 在跑；到大约八成五就在写满之前处理。应用盘和库盘分开看。

### Kafka lag

黄线 100、红线 1000，与系统健康页同一套阈值。lag 持续过黄线：先确认只有一个 API 在消费、handler 没有成片 `policy=skip-and-continue`，再考虑加分区。分区建议 ≥ 12 的操作步骤在 `docs/runbooks/phase-b-ingest.md`，本仓库不自动执行。

### API P95

仓库里没有请求直方图。在反代或访问日志上对这几条看 P95：

- `GET /api/devices`
- `GET /api/analytics/faults`
- `GET /api/analytics/devices-usage`
- 设备详情的状态条 / 连通接口

规划目标是首屏 2 秒内。P95 持续高于 2 秒是扩容信号（先看慢查询和库规格，再考虑只读副本）。阶段 C 在本机 MySQL 上对 3000 行设备做过一次查询计时（列表 + 故障看板 SQL 29ms），那不是生产 P95，也不能当成稳态结论。

## 7. 仍只跑一个带任务的 API

`JOBS_ENABLED` 默认 true。offline / retention / rollup 没有分布式锁。多副本时只有一个进程保持 true，其余必须 `JOBS_ENABLED=false`。不要为了扩容再起一个默认配置的 API。worker 入口这次不做。
