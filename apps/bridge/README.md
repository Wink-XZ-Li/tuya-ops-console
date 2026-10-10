# Bridge（Tuya MQ WebSocket → Redpanda）

`DEMO_MODE=mock` 时**无需启动**本服务；mock 演示可通过 `scripts/fixtures/sample-kafka-event.json` 直接向 Redpanda 打消息。

`DEMO_MODE=live` 时，bridge 通过涂鸦官方 **WebSocket 消息订阅**（`wss://mqe.tuyacn.com:8285/`）消费消息、解密并 normalize 为 `DeviceBusMessage`，再写入本机 Redpanda，供 `apps/api` 消费。

> 说明：开源 `pulsar-client` **不支持**涂鸦自定义鉴权 `auth1`，不要用 Pulsar TCP（7285）直连。控制台「消费者数量 / 在线」主要反映原生 Pulsar 订阅端；WebSocket 消费成功时，以 bridge 日志收到消息、控制台「消息堆积」下降为准。

## Live 启动顺序

1. `docker compose up -d`（MySQL + Redpanda）
2. 配置 `.env`：`DEMO_MODE=live`，填写 `TUYA_*`；消息侧可用同一对 Access ID/Secret，并设 `TUYA_MQ_ENV=prod`（与控制台「生产环境」一致）
3. 云平台开启对应环境的消息订阅（消息队列）
4. `pnpm install`
5. `pnpm --filter @tuya-ops/api prisma:migrate` 与 seed
6. `pnpm dev:api`
7. `pnpm dev:bridge`（本服务）
8. `pnpm dev:web`

有 `deviceId` 的消息都会转发到 Kafka，不再按产品白名单丢弃。
