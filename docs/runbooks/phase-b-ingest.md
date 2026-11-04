# 阶段 B · 入库链路运行说明

本阶段只收敛消费、定时任务和 bridge 保活。不改 Kafka 集群分区，不做分布式锁，不开通知 / 规则引擎 / 售后。

## 1. 定时任务：单 API，禁止多副本跑 job

`offline`（5 分钟）、`retention`（24 小时）、`rollup`（24 小时）只在 `apps/api/src/jobs/` 注册，由 `@nestjs/schedule` 触发。

- 默认 `JOBS_ENABLED=true`：这一个 API 进程会跑这三项任务。值在进程启动、`.env` 加载之后读取。
- **禁止多副本跑 job。** 没有分布式锁。两个都用默认值的 API 会重复打开离线告警、重复写日汇总。
- 水平扩展 API 时，只有一个进程保持 `JOBS_ENABLED=true`，其余进程必须设 `JOBS_ENABLED=false`。设为 false 的进程会在启动时卸掉这三项 interval，任务体不跑。
- 单独的 worker 入口本阶段不做。在那之前，不要让多个副本同时调度。

启动日志会打出：`禁止多副本跑 job`。

`RETENTION_RUN_ON_START=true` 与 `ANALYTICS_ROLLUP_ON_START=true` 仍是「本进程启动时跑一次」，并且同样受 `JOBS_ENABLED` 约束。

## 2. Kafka 消费

`apps/api` 用 `eachBatch`，不再用 `eachMessage`。

- 同一个 partition 按 offset 顺序处理。bridge 写入的 key 是 `deviceId`，同一台设备不会被别的 partition 打乱。
- 不同 partition 可以并行，上限 `KAFKA_PARTITIONS_CONCURRENCY`（默认 4）。
- 空消息、坏 JSON、缺 `deviceId` / `bizCode` / `ts`：记 warn，跳过，位移前进，不重试。
- handler 抛错：同一 chunk 最多 `KAFKA_MESSAGE_RETRIES` 次（默认 3，含第一次），间隔 `attempt * KAFKA_MESSAGE_RETRY_MS`（默认 200ms）。
- 重试仍失败：记 error，带 `policy=skip-and-continue`，位移前进，再处理同 partition 后面的消息。不把整组 consumer 打崩，也不让一条坏消息堵住同分区其它设备。
- 投递是 at-least-once。重试发生在写入成功之后时，可能多一条 `DeviceEvent`，故障 `occurrenceCount` 也会再加。没有幂等键。
- 2 条及以上的一批事件用 `createMany`。告警开闭仍按消息顺序逐条做，`activeKey` 语义不变。
- 新设备的舰队软顶不再每条消息 `count(*)`。近似计数在 `DEVICE_COUNT_CALIBRATE_MS`（默认 60s）内复用，过窗再校准。超过 `DEVICE_SOFT_CAP` 只打 `device_soft_cap` 警告，设备仍然入库。

## 3. 把 topic 分区调到 ≥12（本仓库不执行）

建议生产 topic `tuya.device.events` 至少 **12** 个分区。本 PR **不**修改 `docker-compose.yml`，也 **不**对正在运行的集群下扩分区命令。需要扩容时由运维在维护窗口执行。

分区只能增加，不能减少。key 是 `deviceId`，扩分区后同一设备可能落到新分区；消费组位移不会自动跟着搬。低峰操作，并看 `/system-health` 的 Kafka lag 回到黄线以下。分区数应不少于同时跑着的 consumer 数。

本地 Redpanda（外部地址 `127.0.0.1:19092`）示例，确认后再执行：

```bash
rpk topic add-partitions tuya.device.events --num 12 -X brokers=127.0.0.1:19092
```

没有 `rpk` 时：

```bash
kafka-topics --bootstrap-server 127.0.0.1:19092 \
  --alter --topic tuya.device.events --partitions 12
```

扩完用下面命令核对，期望分区数 ≥ 12：

```bash
rpk topic describe tuya.device.events -X brokers=127.0.0.1:19092
```

## 4. Bridge keepalive

`apps/bridge` 对涂鸦 MQ WebSocket 只有一条保活路径：

- 每 `TUYA_MQ_PING_INTERVAL_MS`（默认 30s）发一次 ping。
- 在 `TUYA_MQ_PONG_TIMEOUT_MS`（默认 10s）内没有收到任何入站帧（消息、服务端 ping 或 pong），日志出现 `涂鸦 MQ pong 超时，关闭连接并重连`，然后 `terminate`，走原有重连。
- `TUYA_MQ_STALE_MS`（默认 90s）内完全没有入站帧，日志出现 `stale watchdog`，同样关闭并重连。

点验：人为丢弃 bridge 的 pong（或拔掉半开连接），日志应出现上述超时，并在有设备消息时重新打出 `Forwarded`。
