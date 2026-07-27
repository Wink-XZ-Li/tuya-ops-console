# Bridge（Pulsar → Redpanda）

`DEMO_MODE=mock` 时**无需启动**本服务；mock 演示可通过 `scripts/fixtures/sample-kafka-event.json` 直接向 Redpanda 打消息。

`DEMO_MODE=live` 时，bridge 消费涂鸦 Pulsar、解密并 normalize 为 `DeviceBusMessage`，再写入本机 Redpanda，供 `apps/api` 消费。

## Live 启动顺序

1. `docker compose up -d`（MySQL + Redpanda）
2. 配置 `.env`：`DEMO_MODE=live`，填写 `TUYA_*` 与 `TUYA_PULSAR_*`
3. `pnpm install`
4. `pnpm --filter @tuya-ops/api prisma:migrate` 与 seed
5. `pnpm dev:api`
6. `pnpm dev:bridge`（本服务）
7. `pnpm dev:web`

白名单外 `productId` 在 normalize 后丢弃，不转发到 Kafka。
