# Tuya Ops Console

涂鸦设备运维控制台。本地默认 `APP_PROFILE=demo`；生产剖面不再使用写死的 50 台设备上限。

| 变量 | 作用 |
| --- | --- |
| `APP_PROFILE=demo\|production` | 运行剖面。`production` 必须同时 `DEMO_MODE=live`，否则 API 在监听前退出，不会改用 mock 客户端。 |
| `DEMO_MODE=mock\|live` | 选择涂鸦客户端。`demo` 可 mock；`production` 只接受 live。不限制同步或 Kafka 入库。 |
| `DEMO_ANALYTICS` | 仅 `demo`。设为 `virtual`（或请求头 `X-Demo-Analytics: virtual`）才返回演示分析曲线。`production` 忽略该开关，OpenAPI 失败不会改用演示数据。 |
| `DEMO_FIXTURE_PURGE` | 一次性迁移。设为 `1` 时，下一次全量设备同步删掉 `uid-demo-*` 用户和 `demo-*` 设备。默认同步不清洗。 |
| `SYNC_PAGE_SIZE` / `SYNC_USER_PAGE_SIZE` / `SYNC_PAGE_INTERVAL_MS` | 云端同步页大小（设备默认 20，用户默认 100）和页间停顿（默认 200ms，`0` 或 `off` 关闭）。 |
| `DEVICE_SOFT_CAP` | 舰队软顶。未设置时为 **10000**。`0` / `none` / `unlimited` / `off` 表示不设顶。超过只打 `device_soft_cap` 警告，设备仍然入库。 |
| `DEMO_SEED_DEVICE_CAP` | 只约束 mock seed，默认 **50**。同步与消息消费不读它。 |
| `JOBS_ENABLED` | 默认 true。offline / retention / rollup 只在这个 API 进程里跑。**禁止多副本跑 job**（没有分布式锁）。多副本时只有一个进程保持 true，其余设 `false`。见 `docs/runbooks/phase-b-ingest.md`。 |

## 5 分钟本地 Demo

### 前置

- Node.js ≥ 20、pnpm
- Docker（MySQL 8 + Redpanda/Kafka）

### 步骤

1. **启动依赖**

   ```bash
   docker compose up -d
   ```

2. **环境变量**

   ```bash
   cp .env.example .env
   ```

   保持 `APP_PROFILE=demo` 与 `DEMO_MODE=mock` 即可；数据库与 Kafka 地址见 `.env.example`。

3. **安装依赖并初始化数据**

   ```bash
   pnpm install
   pnpm demo:mock
   ```

   `demo:mock` 会执行 Prisma migrate、seed 管理员账号，并写入 7 台 mock 设备。

4. **启动服务**（两个终端）

   ```bash
   pnpm dev:api
   pnpm dev:web
   ```

5. **打开浏览器**

   - 地址：本机 <http://localhost:5173>；局域网其它设备用 `http://<本机局域网IP>:5173`（Vite 已 `host: true`，仅内网 Demo）
   - 账号：`admin` / `ChangeMe123!`
   - 其他账号：`operator`、`readonly`（同密码）

### 一键自检

API 与数据库就绪后：

```bash
pnpm demo:smoke
```

脚本会：登录 admin → 校验设备数 ∈ [1, `DEMO_SEED_DEVICE_CAP`]（默认 50，只约束 mock seed）→ readonly 下发 403 → operator 下发 200（mock）。

若 Docker / MySQL / API 未启动，脚本会以非 0 退出并打印明确提示，不会误报通过。

### Live 模式（可选）

1. `.env` 中设置 `DEMO_MODE=live` / `VITE_DEMO_MODE=live`，填写 `TUYA_ACCESS_ID`、`TUYA_ACCESS_SECRET`；消息订阅设 `TUYA_MQ_ENV=prod`（与控制台「生产环境」一致）。用户全量同步另需 `TUYA_APP_SCHEMA`（App 渠道标识符）。交给生产时设 `APP_PROFILE=production` 且 `DEMO_MODE=live`。生产剖面若仍是 mock，API 会拒绝启动。
2. **必须重启** `pnpm dev:api` 与 `pnpm dev:bridge`（根目录 `.env` 由进程启动时加载；只改前端角标不够）。
3. 启动日志应出现：`TuyaLiveClient` / `virtual analytics cannot replace live`，以及 bridge 的 `Bridge started: Tuya MQ WebSocket (prod) → Redpanda`。若仍是 `TuyaMockClient`，说明还在 demo 剖面或环境变量未加载。
4. 管理端点「触发同步」拉取云项目下的真机；「同步指定设备」可按 deviceId 单拉。用户详情里的关联设备也可逐台同步入库。演示夹具不会在每次同步时自动删除。要从演示库迁走时，设一次 `DEMO_FIXTURE_PURGE=1`，同步完成后改回未设置。见 `docs/runbooks/it-handoff.md`。
5. 另开终端：`pnpm dev:bridge`（WebSocket `wss://mqe.tuyacn.com:8285/`）。测试环境用 `TUYA_MQ_ENV=test`。
6. 不再按 `productId` 白名单过滤，也没有 50 台入库硬顶。舰队规模由 `DEVICE_SOFT_CAP` 警告（默认 10000，可关掉），超限仍接收设备。
7. 若 OpenAPI 返回 `28841002`：与消息订阅无关。到 **云开发 → 云服务 → IoT Core → 延长试用**（免费基础资源包 ≠ IoT Core API 权限）。未续上前可用 bridge 事件入库。续期后可跑 `pnpm tuya:probe` 验证。
8. 控制台「消费者数量 0 / 离线」在 bridge 未连上前是正常的；WebSocket 消费成功时以 bridge 日志与堆积量下降为准（计数器主要反映原生 Pulsar 客户端）。

## 目录速览

| 路径 | 说明 |
| --- | --- |
| `apps/api` | NestJS API |
| `apps/web` | React 运维台 |
| `apps/bridge` | Tuya MQ WebSocket → Kafka 桥（live） |
| `scripts/smoke.sh` | Demo 冒烟脚本 |
| `scripts/fixtures/` | Kafka 事件样例（如 `sample-kafka-event.json`） |
| `docs/runbooks/phase-b-ingest.md` | 消费重试、单 API 任务、topic 分区 ≥12 的运维步骤（仓库不改集群） |
| `docs/runbooks/phase-c-query.md` | 看板走日汇总、详情长窗降采样、事件冷归档和分批 retention |
| `docs/runbooks/it-handoff.md` | 交给 IT 的生产剖面、健康检查、备份、lag 与扩容信号 |
| `docs/runbooks/phase-d-capacity.md` | 已有压测范围，以及哪些容量说法还不能写 |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm demo:up` | `docker compose up -d` |
| `pnpm demo:mock` | migrate + seed + mock 设备 |
| `pnpm demo:smoke` | 运行冒烟脚本 |
| `pnpm dev:api` / `pnpm dev:web` / `pnpm dev:bridge` | 开发服务 |
