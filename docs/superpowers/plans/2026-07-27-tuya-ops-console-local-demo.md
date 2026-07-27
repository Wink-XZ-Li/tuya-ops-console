# 涂鸦运维台 · 本地 Demo 实现计划

> **给代理执行者：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步实现。步骤使用复选框（`- [ ]`）跟踪进度。  
> **关系说明：** 本计划从 `2026-07-27-tuya-ops-console.md`（腾讯云生产版）裁剪而来，专门用于**本机跑通 Demo**；目录与模块命名尽量对齐生产计划，便于日后无缝升级。

**目标：** 在开发者本机用 Docker Compose 跑起一套可演示的内部运维台：管理 **少于 10 台** 涂鸦中国区 OEM 设备（三款 PID 白名单），支持用户–设备查看、标准指令下发、本地消息管道落库与简单告警。

**架构：** 与生产版同构的三进程 monorepo：`apps/api`、`apps/bridge`、`apps/web`。差异在于消息中间层用 **本机 Redpanda（Kafka 协议）** 替代腾讯云 CKafka；MySQL 用 Compose 容器；**不部署腾讯云 CVM/TencentDB**。支持两种联调模式：`DEMO_MODE=mock`（无真实设备，夹具数据演示 UI）与 `DEMO_MODE=live`（接真实涂鸦 OpenAPI + Pulsar，设备 &lt; 10）。

**技术栈：** pnpm workspaces、NestJS 10、Prisma 5、MySQL 8（本地容器）、React 18 + Vite + React Router 6、kafkajs、pulsar-client（仅 live）、`@tuya/tuya-connector-nodejs`、Docker Compose、bcrypt + JWT。

## 全局约束

- 设备量：**&lt; 10 台**；分页与索引按小数据量实现即可，不做 千级 优化
- 产品白名单仍为：`uhmj5b0ba31zpme6`、`qxjzruuqz40bty7e`、`nohrp3vbmef7vxvx`
- 涂鸦区域：中国区（`https://openapi.tuyacn.com`）
- 消息链路（Demo）：涂鸦 Pulsar → **本机 Redpanda** → `apps/api` 消费（**不用 CKafka**）
- 数据策略：混合——MQ 落状态/事件；用户/绑定 = MQ 事件 + **可手动触发**的对账（cron 可改为 1 小时或仅手动）
- 部署目标：**仅本机** `docker compose up`；不做腾讯云、TKE、SSO、域名、COS
- 角色：`readonly` | `operator` | `admin`（种子账号即可）
- 历史保留：Demo 默认 **7 天**（或手动清空）；不做生产级 90 天运维强调
- **不做**设备删除 / 解绑
- 告警：设备上报类 + 本地「离线 &gt; N 分钟」（N 默认 10，便于 Demo）
- 指令 UI：通用标准指令面板 + DP 别名
- 付费：本机 Demo **零腾讯云费用**；live 模式仅消耗已有涂鸦云额度
- 明确不做：多租户、CKafka、云 MySQL、CVM Compose 生产打包（保留给生产计划）

## 与生产计划的差异速查

| 项 | 生产计划 | 本 Demo 计划 |
| --- | --- | --- |
| 运行位置 | 腾讯云 CVM | 开发者本机 |
| 队列 | 腾讯云 CKafka | Compose 内 Redpanda |
| 设备量 | 1k～10k | &lt; 10 |
| MySQL | 可上 TencentDB | 仅本地容器 |
| 对账 | 15 分钟 cron + 手动 | 默认手动 + 可选长周期 cron |
| 保留期 | 90 天 | 7 天 |
| 冒烟 | 含 CVM 部署 | 仅本地 smoke |
| mock | 无 | `DEMO_MODE=mock` 必备 |

---

## 目录结构

与生产计划相同根布局，Demo 额外强调：

```
tuya-ops-console/
├── package.json
├── pnpm-workspace.yaml
├── docker-compose.yml              # mysql + redpanda（本机）
├── .env.example
├── scripts/
│   ├── smoke.sh
│   ├── seed-mock-devices.ts        # mock 模式灌入 &lt;10 台假设备
│   └── fixtures/
│       └── sample-kafka-event.json
├── apps/api/ …
├── apps/bridge/ …                  # live 时转发 Pulsar→Redpanda；mock 时可不起
├── apps/web/ …
└── docs/superpowers/plans/
    ├── 2026-07-27-tuya-ops-console.md           # 生产版
    └── 2026-07-27-tuya-ops-console-local-demo.md # 本文件
```

---

### 任务 1：本机 Compose 脚手架（MySQL + Redpanda）

**文件：**
- 创建：`package.json`、`pnpm-workspace.yaml`、`.gitignore`、`.env.example`、`docker-compose.yml`、`apps/api|bridge|web/package.json`

**接口：**
- 产出：本机 `localhost:3306` MySQL、`localhost:19092` Kafka（Redpanda）；`pnpm install` 可用

- [ ] **步骤 1：写 workspace 与 `.env.example`**

`.env.example` 关键相对生产版改为：

```bash
DEMO_MODE=mock
# mock | live

DATABASE_URL=mysql://ops:ops@127.0.0.1:3306/tuya_ops
JWT_SECRET=local-demo-secret
JWT_EXPIRES_IN=12h

TUYA_BASE_URL=https://openapi.tuyacn.com
TUYA_ACCESS_ID=
TUYA_ACCESS_SECRET=
TUYA_PRODUCT_IDS=uhmj5b0ba31zpme6,qxjzruuqz40bty7e,nohrp3vbmef7vxvx

# live 才需要
TUYA_PULSAR_URL=pulsar+ssl://mqe.tuyacn.com:7285/
TUYA_PULSAR_ACCESS_ID=
TUYA_PULSAR_ACCESS_KEY=

KAFKA_BROKERS=127.0.0.1:19092
KAFKA_TOPIC_DEVICE_EVENTS=tuya.device.events
KAFKA_GROUP_ID=tuya-ops-demo

OFFLINE_ALERT_MINUTES=10
RETENTION_DAYS=7
API_PORT=3000
WEB_ORIGIN=http://localhost:5173
```

`docker-compose.yml` **只含** `mysql` + `redpanda`（api/web 本机 `pnpm dev` 跑，减少 Demo 镜像复杂度）：

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: tuya_ops
      MYSQL_USER: ops
      MYSQL_PASSWORD: ops
    ports: ["3306:3306"]
    volumes: ["mysql_data:/var/lib/mysql"]
    command: ["--default-authentication-plugin=mysql_native_password", "--character-set-server=utf8mb4"]
  redpanda:
    image: redpandadata/redpanda:v24.2.4
    command:
      - redpanda
      - start
      - --overprovisioned
      - --smp
      - "1"
      - --memory
      - 512M
      - --kafka-addr
      - internal://0.0.0.0:9092,external://0.0.0.0:19092
      - --advertise-kafka-addr
      - internal://redpanda:9092,external://127.0.0.1:19092
    ports: ["19092:19092"]
volumes:
  mysql_data:
```

根 `package.json` scripts 与生产计划任务 1 相同（`dev:api` / `dev:bridge` / `dev:web`）。

- [ ] **步骤 2：启动并验证**

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

预期：`mysql`、`redpanda` 均为 Up。

- [ ] **步骤 3：提交**

```bash
git add package.json pnpm-workspace.yaml .env.example docker-compose.yml .gitignore apps/*/package.json
git commit -m "chore(demo): 本机 MySQL+Redpanda 脚手架"
```

---

### 任务 2：Prisma 模型 + 种子账号（与生产对齐，略简）

**文件：**
- 创建：`apps/api/prisma/schema.prisma`、`prisma/seed.ts`

**接口：**
- 模型与生产计划任务 2 **相同**（`AdminUser`、`EndUser`、`Device`、`DeviceBinding`、`DeviceEvent`、`CommandLog`、`AuditLog`、`Alert`、`DpAlias`）
- 种子：`admin` / `operator` / `readonly`，密码 `ChangeMe123!`

- [ ] **步骤 1：写入与生产计划一致的 `schema.prisma`**

（完整 schema 见生产计划任务 2；本 Demo **原样复用**，不要删字段。）

- [ ] **步骤 2：migrate + seed**

```bash
cd apps/api
pnpm add @prisma/client @nestjs/common @nestjs/core @nestjs/platform-express bcryptjs reflect-metadata rxjs
pnpm add -D prisma typescript ts-node @types/node @types/bcryptjs jest @types/jest ts-jest @nestjs/testing
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
```

- [ ] **步骤 3：提交**

```bash
git commit -am "feat(demo): Prisma 模型与本地种子账号"
```

---

### 任务 3：JWT 鉴权与三角色

**文件：**
- 创建：`apps/api/src/auth/*`
- 测试：`auth.service.spec.ts`

**接口：**
- `POST /api/auth/login` → `{ accessToken, role, username }`
- `@Roles('readonly'|'operator'|'admin')` + `RolesGuard`

- [ ] **步骤 1：写失败用例（错误密码 → Unauthorized）**

```typescript
it('rejects bad password', async () => {
  const prisma = {
    adminUser: {
      findUnique: jest.fn().mockResolvedValue({
        id: '1', username: 'admin', passwordHash: '$2a$10$invalid', role: 'admin',
      }),
    },
  } as any;
  const jwt = { signAsync: jest.fn() } as any;
  await expect(new AuthService(prisma, jwt).login('admin', 'wrong'))
    .rejects.toBeInstanceOf(UnauthorizedException);
});
```

- [ ] **步骤 2：跑测试预期 FAIL → 实现 → PASS**

- [ ] **步骤 3：提交**

```bash
git commit -am "feat(demo): JWT 登录与角色守卫"
```

---

### 任务 4：涂鸦客户端 + Mock 适配器

**文件：**
- 创建：`apps/api/src/tuya/tuya.client.ts`、`tuya.mock.ts`、`tuya.module.ts`、`tuya.client.spec.ts`

**接口：**
- 统一接口：`getDevice`、`getDeviceStatus`、`getStandardFunctions`、`sendStandardCommand`、`listDevicesByProduct`、`getDeviceUsers`、`isAllowedProduct`
- `DEMO_MODE=live`：走 `@tuya/tuya-connector-nodejs`（中国区）
- `DEMO_MODE=mock`：走 `TuyaMockClient`，内存返回 ≤9 台假设备，指令只记日志不调外网

- [ ] **步骤 1：白名单单测**

```typescript
const allowed = new Set(['uhmj5b0ba31zpme6','qxjzruuqz40bty7e','nohrp3vbmef7vxvx']);
expect(isAllowedProduct('uhmj5b0ba31zpme6', allowed)).toBe(true);
expect(isAllowedProduct('other', allowed)).toBe(false);
```

- [ ] **步骤 2：实现 Mock 客户端**

`TuyaMockClient.listDevicesByProduct` 每个 PID 返回 1～3 台，**全局设备总数硬限制 &lt; 10**：

```typescript
export const MOCK_DEVICES = [
  { deviceId: 'demo-001', productId: 'uhmj5b0ba31zpme6', name: 'Demo线控器A' },
  { deviceId: 'demo-002', productId: 'qxjzruuqz40bty7e', name: 'Demo设备B' },
  { deviceId: 'demo-003', productId: 'nohrp3vbmef7vxvx', name: 'Demo设备C' },
  // 最多再补到 9 台，禁止 ≥10
];
```

`sendStandardCommand` 在 mock 下返回 `{ success: true, mock: true }`。

- [ ] **步骤 3：Module 按 `DEMO_MODE` 注入实现；提交**

```bash
git commit -am "feat(demo): 涂鸦 live/mock 双客户端"
```

---

### 任务 5：设备 / 用户只读 API + Mock 灌库脚本

**文件：**
- 创建：`apps/api/src/devices/*`、`apps/api/src/end-users/*`、`scripts/seed-mock-devices.ts`
- **禁止** DELETE 路由

**接口：**
- `GET /api/devices`、`GET /api/devices/:deviceId`
- `GET /api/end-users`、`GET /api/end-users/:tuyaUid/devices`
- `pnpm seed:mock`：写入 &lt;10 台设备 + 2～3 个终端用户与绑定（仅 mock）

- [ ] **步骤 1：列表按 productId 过滤单测**

- [ ] **步骤 2：实现查询 API**

- [ ] **步骤 3：写 `scripts/seed-mock-devices.ts`，断言插入后 `device.count &lt; 10`**

```typescript
const count = await prisma.device.count();
if (count >= 10) throw new Error('Demo 设备数必须小于 10');
```

- [ ] **步骤 4：提交**

```bash
git commit -am "feat(demo): 设备用户查询与 mock 灌库"
```

---

### 任务 6：Kafka 事件处理（对接本机 Redpanda）

**文件：**
- 创建：`apps/api/src/kafka/*`、`event-handler.service.ts`、`event-handler.service.spec.ts`

**接口：**
- 消息形状与生产计划相同：`DeviceBusMessage`
- 白名单外丢弃；online/offline 更新状态；属性上报合并 `statusJson`；绑定类更新 `DeviceBinding`
- Demo：消费组 `tuya-ops-demo`，broker `127.0.0.1:19092`

- [ ] **步骤 1：单测忽略非白名单 PID**

- [ ] **步骤 2：实现 handler + kafkajs 消费者**

- [ ] **步骤 3：用夹具向 Redpanda 打一条消息，curl 设备应变为 online**

`scripts/fixtures/sample-kafka-event.json`：

```json
{
  "bizCode": "deviceOnline",
  "ts": 1710000000000,
  "productId": "uhmj5b0ba31zpme6",
  "deviceId": "demo-001",
  "payload": {}
}
```

- [ ] **步骤 4：提交**

```bash
git commit -am "feat(demo): Redpanda 事件消费落库"
```

---

### 任务 7：Bridge（仅 live）—— Pulsar → Redpanda

**文件：**
- 创建：`apps/bridge/src/index.ts`、`normalize.ts`、`normalize.spec.ts`、`pulsar.ts`、`kafka-producer.ts`

**接口：**
- `DEMO_MODE=mock` 时文档写明：**无需启动 bridge**
- `DEMO_MODE=live`：解密涂鸦 Pulsar → normalize → 发到本机 Redpanda
- 设备数保护：normalize 后若 `productId` 不在白名单则不转发

- [ ] **步骤 1：normalize 单测**

- [ ] **步骤 2：实现转发；README 注明 live 启动顺序**

- [ ] **步骤 3：提交**

```bash
git commit -am "feat(demo): live 模式 Pulsar→Redpanda bridge"
```

---

### 任务 8：手动对账 + 标准指令 + DP 别名

**文件：**
- 创建：`apps/api/src/sync/*`、`commands/*`、`dp-aliases/*`

**接口：**
- `POST /api/sync/reconcile`（admin）—— live 拉涂鸦；mock 调 `TuyaMockClient` 刷新本地
- **不对 &lt;10 台做复杂分页压力测试**；list 时若总数 ≥10 打 warn 日志并截断处理
- `GET/POST .../functions|commands`、`CRUD /api/dp-aliases`
- 下发写 `CommandLog` + `AuditLog`；`readonly` 禁止 POST commands

- [ ] **步骤 1：commands 对未知设备 NotFound 单测**

- [ ] **步骤 2：实现 sync / commands / aliases**

- [ ] **步骤 3：提交**

```bash
git commit -am "feat(demo): 对账、标准指令与 DP 别名"
```

---

### 任务 9：告警 + 7 天清理（轻量）

**文件：**
- 创建：`apps/api/src/alerts/*`、`offline-rule.job.ts`、`retention.job.ts`

**接口：**
- `GET /api/alerts`、`POST /api/alerts/:id/ack`
- 离线规则：`OFFLINE_ALERT_MINUTES`（默认 10）
- 每日（或启动时可选）清理 `RETENTION_DAYS=7` 之前的事件/指令/已关闭告警/审计

- [ ] **步骤 1：离线告警不重复创建单测**

- [ ] **步骤 2：实现后提交**

```bash
git commit -am "feat(demo): 告警与 7 天清理"
```

---

### 任务 10：React Demo 前端（核心页面）

**文件：**
- 创建：`apps/web` Vite React 应用——登录、设备列表/详情、指令面板、用户、告警、指令历史、别名设置

**接口：**
- 路由与生产计划一致；页眉显示 `DEMO_MODE` 徽章（`mock` / `live`）
- 设备列表角标或提示文案：「Demo · 设备 &lt; 10」
- **无删除按钮**

- [ ] **步骤 1：登录 + RoleGate + 路由壳**

- [ ] **步骤 2：设备列表/详情 + CommandPanel（alias ?? code）**

- [ ] **步骤 3：用户 / 告警 / 历史 / 别名页**

- [ ] **步骤 4：提交**

```bash
git commit -am "feat(demo): React 运维台 Demo 页面"
```

---

### 任务 11：本机一键说明 + smoke 脚本

**文件：**
- 创建：`README.md`（Demo 专节）、`scripts/smoke.sh`
- 可选：根目录 `Makefile` 或 npm scripts：`demo:up`、`demo:mock`、`demo:smoke`

**接口：**
- smoke：(1) 登录 admin (2) mock 灌库或夹具 Kafka 消息 (3) 列表设备数 ∈ [1,9] (4) readonly 下发 → 403 (5) operator 下发 → 200（mock）

- [ ] **步骤 1：写 README「5 分钟本地 Demo」**

顺序：
1. `docker compose up -d`
2. `cp .env.example .env`（保持 `DEMO_MODE=mock`）
3. `pnpm install` → api migrate/seed → `pnpm seed:mock`
4. `pnpm dev:api` & `pnpm dev:web`
5. 浏览器 `http://localhost:5173`，账号 `admin` / `ChangeMe123!`

live 补充：填涂鸦密钥、起 `pnpm dev:bridge`、真实设备 &lt;10 台。

- [ ] **步骤 2：实现并跑通 `scripts/smoke.sh`**

- [ ] **步骤 3：提交**

```bash
git commit -am "docs(demo): 本机启动说明与 smoke"
```

---

## 自检（Demo 需求覆盖）

| 需求 | 任务 |
| --- | --- |
| 本机可跑、无腾讯云 | 1、11 |
| 设备 &lt; 10 | 4、5、8、11 |
| 三 PID 白名单 | 4、6 |
| mock / live 双模式 | 4、7、11 |
| Pulsar→本地队列→落库 | 6、7 |
| 标准指令 + 别名 | 8、10 |
| 角色与审计 | 3、8 |
| 告警 | 9 |
| 无删除 | 5、10 |
| 对齐生产目录便于升级 | 全文 |

## 明确不做（本 Demo）

- 腾讯云 CVM / CKafka / TencentDB / COS / 域名
- 生产 Compose 多镜像打包与 CVM 运维手册（见生产计划任务 15）
- 千级设备分页压测、复杂告警引擎、SSO、多租户
- 设备删除 / 解绑

## 升级到生产计划的路径

Demo 跑通后，按生产计划增量即可：把 `KAFKA_BROKERS` 换成 CKafka、补齐 90 天保留与 15 分钟对账、增加 CVM Dockerfile，**无需重写业务模块**。
