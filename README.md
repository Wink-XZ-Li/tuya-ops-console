# Tuya Ops Console (Local Demo)

涂鸦设备运维控制台 — 本仓库为**本机 Demo**，无需腾讯云，支持 `mock` / `live` 双模式，设备上限 50。

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

   保持 `DEMO_MODE=mock` 即可；数据库与 Kafka 地址见 `.env.example`。

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

脚本会：登录 admin → 校验设备数 ∈ [1, 9] → readonly 下发 403 → operator 下发 200（mock）。

若 Docker / MySQL / API 未启动，脚本会以非 0 退出并打印明确提示，不会误报通过。

### Live 模式（可选）

1. `.env` 中设置 `DEMO_MODE=live` / `VITE_DEMO_MODE=live`，填写 `TUYA_ACCESS_ID`、`TUYA_ACCESS_SECRET`；消息订阅设 `TUYA_MQ_ENV=prod`（与控制台「生产环境」一致）。
2. **必须重启** `pnpm dev:api` 与 `pnpm dev:bridge`（根目录 `.env` 由进程启动时加载；只改前端角标不够）。
3. 启动日志应出现：`Using TuyaLiveClient` / `Bridge started: Tuya MQ WebSocket (prod) → Redpanda`。若仍是 `TuyaMockClient` 或 `DEMO_MODE=mock`，说明环境变量未加载。
4. 管理端点「触发同步」：会清除 `demo-*` mock 设备，再按白名单 PID 拉真机；「同步指定设备」可按 deviceId 单拉。
5. 另开终端：`pnpm dev:bridge`（WebSocket `wss://mqe.tuyacn.com:8285/`）。测试环境用 `TUYA_MQ_ENV=test`。
6. 真实设备需在设备上限（50）内，且 `productId` 在 `TUYA_PRODUCT_IDS` 白名单内。
7. 若 OpenAPI 返回 `28841002`：与消息订阅无关。到 **云开发 → 云服务 → IoT Core → 延长试用**（免费基础资源包 ≠ IoT Core API 权限）。未续上前可用 bridge 事件入库；确保 `TUYA_PRODUCT_IDS` 含真实 PID。续期后可跑 `pnpm tuya:probe` 验证。
8. 控制台「消费者数量 0 / 离线」在 bridge 未连上前是正常的；WebSocket 消费成功时以 bridge 日志与堆积量下降为准（计数器主要反映原生 Pulsar 客户端）。

## 目录速览

| 路径 | 说明 |
| --- | --- |
| `apps/api` | NestJS API |
| `apps/web` | React 运维台 |
| `apps/bridge` | Tuya MQ WebSocket → Kafka 桥（live） |
| `scripts/smoke.sh` | Demo 冒烟脚本 |
| `scripts/fixtures/` | Kafka 事件样例（如 `sample-kafka-event.json`） |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm demo:up` | `docker compose up -d` |
| `pnpm demo:mock` | migrate + seed + mock 设备 |
| `pnpm demo:smoke` | 运行冒烟脚本 |
| `pnpm dev:api` / `pnpm dev:web` / `pnpm dev:bridge` | 开发服务 |
