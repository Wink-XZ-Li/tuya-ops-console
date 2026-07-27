# 涂鸦运维台（Tuya Ops Console）实现计划

> **给代理执行者：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步实现。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 在腾讯云上搭建内部运维后台，镜像涂鸦（中国区）OEM App 的终端用户与设备数据，经 Pulsar→CKafka 接入设备事件，并对三款产品 PID 下发标准指令集指令。

**架构：** pnpm monorepo，三个 Node 进程：`apps/api`（NestJS + Prisma/MySQL REST + JWT 角色）、`apps/bridge`（消费涂鸦 Pulsar 并转发到 CKafka）、`apps/web`（Vite React 管理端）。设备状态/事件由消息队列驱动落库；终端用户与绑定关系由绑定类 MQ 消息更新，并辅以定时任务调用涂鸦 OpenAPI 对账。指令一律走涂鸦标准指令集 API；结果与上报再经 MQ 管道回写。

**技术栈：** pnpm workspaces、NestJS 10、Prisma 5、MySQL 8（TencentDB）、React 18 + Vite + React Router 6、kafkajs、pulsar-client、`@tuya/tuya-connector-nodejs`、Docker Compose、bcrypt + JWT。

## 全局约束

- 一期产品白名单仅限：`uhmj5b0ba31zpme6`、`qxjzruuqz40bty7e`、`nohrp3vbmef7vxvx`
- 涂鸦数据中心：一期仅中国区（多区域存在，其它区域忽略）
- 接入路径：OEM App + 涂鸦云项目（非仅公版智能生活）
- 数据策略：混合——状态/事件靠 MQ；用户/绑定靠 API 同步（MQ 触发 + 定时对账）
- 消息链路：涂鸦 Pulsar → 腾讯云 CKafka → `apps/api`（或同进程内消费者）消费
- 部署：CVM + Docker Compose（不做 TKE / SSO）
- 角色：`readonly` | `operator` | `admin`（本地 JWT 账号）
- 历史保留：事件、指令日志、告警 **90 天**
- 一期不做设备删除 / 解绑的 UI 或 API
- 告警：设备上报故障/告警类事件 + 本地规则（如离线超过 N 分钟）
- 指令 UI：通用标准指令面板 + 可配置 DP 别名
- 量级假设：1,000～10,000 台设备
- 一期不要做多租户 SaaS、TKE、SSO

---

## 目录结构

```
tuya-ops-console/
├── package.json                          # pnpm workspace 根
├── pnpm-workspace.yaml
├── docker-compose.yml                    # mysql、（可选本地 kafka）、api、bridge、web
├── .env.example
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/seed.ts
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── prisma/prisma.service.ts
│   │       ├── auth/                     # 登录、JWT、角色守卫
│   │       ├── admin-users/
│   │       ├── devices/
│   │       ├── end-users/
│   │       ├── commands/                 # 标准指令下发 + 日志
│   │       ├── events/                   # 历史查询
│   │       ├── alerts/
│   │       ├── dp-aliases/
│   │       ├── tuya/                     # OpenAPI 客户端封装
│   │       ├── kafka/                    # CKafka 消费 → 落库
│   │       ├── sync/                     # 绑定对账定时任务
│   │       └── retention/                # 90 天清理定时任务
│   ├── bridge/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── pulsar.ts
│   │       └── kafka-producer.ts
│   └── web/
│       ├── package.json
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/client.ts
│           ├── auth/
│           ├── pages/
│           │   ├── LoginPage.tsx
│           │   ├── DevicesPage.tsx
│           │   ├── DeviceDetailPage.tsx
│           │   ├── UsersPage.tsx
│           │   ├── AlertsPage.tsx
│           │   ├── CommandHistoryPage.tsx
│           │   └── SettingsAliasesPage.tsx
│           └── components/
│               ├── DeviceTable.tsx
│               ├── CommandPanel.tsx
│               └── RoleGate.tsx
└── docs/superpowers/plans/
```

---

### 任务 1：Monorepo 脚手架 + Docker Compose MySQL

**文件：**
- 创建：`package.json`、`pnpm-workspace.yaml`、`.env.example`、`docker-compose.yml`、`apps/api/package.json`、`apps/bridge/package.json`、`apps/web/package.json`、`.gitignore`

**接口：**
- 产出：可用 `pnpm install` 的 workspace；Compose 提供 `localhost:3306` MySQL

- [ ] **步骤 1：编写根目录 workspace 文件**

`package.json`：
```json
{
  "name": "tuya-ops-console",
  "private": true,
  "scripts": {
    "dev:api": "pnpm --filter @tuya-ops/api dev",
    "dev:bridge": "pnpm --filter @tuya-ops/bridge dev",
    "dev:web": "pnpm --filter @tuya-ops/web dev",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "engines": { "node": ">=20" }
}
```

`pnpm-workspace.yaml`：
```yaml
packages:
  - "apps/*"
```

`.gitignore`：
```
node_modules
dist
.env
*.log
coverage
apps/api/prisma/*.db
```

`.env.example`：
```bash
# MySQL
DATABASE_URL=mysql://ops:ops@127.0.0.1:3306/tuya_ops

# JWT
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=12h

# 涂鸦中国区云项目
TUYA_BASE_URL=https://openapi.tuyacn.com
TUYA_ACCESS_ID=
TUYA_ACCESS_SECRET=
TUYA_PROJECT_CODE=

# 一期产品白名单（逗号分隔）
TUYA_PRODUCT_IDS=uhmj5b0ba31zpme6,qxjzruuqz40bty7e,nohrp3vbmef7vxvx

# 涂鸦 Pulsar（bridge）
TUYA_PULSAR_URL=pulsar+ssl://mqe.tuyacn.com:7285/
TUYA_PULSAR_ACCESS_ID=
TUYA_PULSAR_ACCESS_KEY=
TUYA_PULSAR_TOPIC=event

# CKafka
KAFKA_BROKERS=127.0.0.1:9092
KAFKA_TOPIC_DEVICE_EVENTS=tuya.device.events
KAFKA_GROUP_ID=tuya-ops-api

# 告警
OFFLINE_ALERT_MINUTES=30

# API
API_PORT=3000
WEB_ORIGIN=http://localhost:5173
```

`docker-compose.yml`：
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
volumes:
  mysql_data:
```

最小 package 桩：

`apps/api/package.json`：
```json
{
  "name": "@tuya-ops/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "ts-node prisma/seed.ts"
  }
}
```

`apps/bridge/package.json`：
```json
{
  "name": "@tuya-ops/bridge",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "jest"
  }
}
```

`apps/web/package.json`：
```json
{
  "name": "@tuya-ops/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  }
}
```

- [ ] **步骤 2：启动 MySQL 并验证**

```bash
cp .env.example .env
docker compose up -d mysql
docker compose ps
```

预期：`mysql` 为 up/healthy；`docker compose exec mysql mysqladmin ping -h 127.0.0.1 -uops -pops` 返回 `mysqld is alive`。

- [ ] **步骤 3：提交**

```bash
git add package.json pnpm-workspace.yaml .env.example docker-compose.yml .gitignore apps/api/package.json apps/bridge/package.json apps/web/package.json
git commit -m "chore: 脚手架 monorepo 与 MySQL Compose"
```

---

### 任务 2：Prisma 模型 + 种子管理员

**文件：**
- 创建：`apps/api/prisma/schema.prisma`、`apps/api/prisma/seed.ts`、`apps/api/src/prisma/prisma.service.ts`
- 测试：可通过 seed 做集成冒烟

**接口：**
- 产出模型：`AdminUser`、`EndUser`、`Device`、`DeviceBinding`、`DeviceEvent`、`CommandLog`、`AuditLog`、`Alert`、`DpAlias`
- 枚举：`AdminRole` = `readonly|operator|admin`；`DeviceOnlineStatus` = `online|offline|unknown`；`AlertStatus` = `open|acked|closed`

- [ ] **步骤 1：编写 `schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum AdminRole {
  readonly
  operator
  admin
}

enum DeviceOnlineStatus {
  online
  offline
  unknown
}

enum AlertStatus {
  open
  acked
  closed
}

model AdminUser {
  id           String    @id @default(cuid())
  username     String    @unique
  passwordHash String
  role         AdminRole
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  auditLogs    AuditLog[]
  commandLogs  CommandLog[]
}

model EndUser {
  id          String          @id @default(cuid())
  tuyaUid     String          @unique
  username    String?
  mobile      String?
  email       String?
  raw         Json?
  syncedAt    DateTime        @default(now())
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  bindings    DeviceBinding[]
}

model Device {
  id            String             @id @default(cuid())
  deviceId      String             @unique
  productId     String
  name          String?
  onlineStatus  DeviceOnlineStatus @default(unknown)
  statusJson    Json?
  activatedAt   DateTime?
  lastSeenAt    DateTime?
  syncedAt      DateTime           @default(now())
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  bindings      DeviceBinding[]
  events        DeviceEvent[]
  commandLogs   CommandLog[]
  alerts        Alert[]

  @@index([productId])
  @@index([onlineStatus])
}

model DeviceBinding {
  id         String   @id @default(cuid())
  deviceId   String
  endUserId  String
  boundAt    DateTime?
  syncedAt   DateTime @default(now())
  device     Device   @relation(fields: [deviceId], references: [id])
  endUser    EndUser  @relation(fields: [endUserId], references: [id])

  @@unique([deviceId, endUserId])
  @@index([endUserId])
}

model DeviceEvent {
  id        String   @id @default(cuid())
  deviceId  String
  bizCode   String
  payload   Json
  eventTime DateTime
  createdAt DateTime @default(now())
  device    Device   @relation(fields: [deviceId], references: [id])

  @@index([deviceId, eventTime])
  @@index([bizCode, eventTime])
  @@index([eventTime])
}

model CommandLog {
  id           String   @id @default(cuid())
  deviceId     String
  adminUserId  String
  productId    String
  code         String
  value        Json
  tuyaResponse Json?
  success      Boolean  @default(false)
  createdAt    DateTime @default(now())
  device       Device   @relation(fields: [deviceId], references: [id])
  adminUser    AdminUser @relation(fields: [adminUserId], references: [id])

  @@index([deviceId, createdAt])
  @@index([createdAt])
}

model AuditLog {
  id          String   @id @default(cuid())
  adminUserId String
  action      String
  resource    String
  detail      Json?
  createdAt   DateTime @default(now())
  adminUser   AdminUser @relation(fields: [adminUserId], references: [id])

  @@index([createdAt])
}

model Alert {
  id         String      @id @default(cuid())
  deviceId   String
  source     String
  title      String
  detail     Json?
  status     AlertStatus @default(open)
  openedAt   DateTime    @default(now())
  closedAt   DateTime?
  device     Device      @relation(fields: [deviceId], references: [id])

  @@index([status, openedAt])
  @@index([deviceId, status])
}

model DpAlias {
  id        String   @id @default(cuid())
  productId String
  code      String
  alias     String
  groupName String?
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([productId, code])
  @@index([productId])
}
```

- [ ] **步骤 2：编写 seed，创建 admin / operator / readonly**

`apps/api/prisma/seed.ts`：
```typescript
import { PrismaClient, AdminRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
  for (const [username, role] of [
    ['admin', AdminRole.admin],
    ['operator', AdminRole.operator],
    ['readonly', AdminRole.readonly],
  ] as const) {
    await prisma.adminUser.upsert({
      where: { username },
      update: { passwordHash, role },
      create: { username, passwordHash, role },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **步骤 3：安装 api 依赖、迁移、seed**

```bash
cd apps/api && pnpm add @nestjs/common @nestjs/core @nestjs/platform-express @prisma/client bcryptjs reflect-metadata rxjs
pnpm add -D prisma typescript ts-node @types/node @types/bcryptjs jest @types/jest ts-jest @nestjs/testing
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
```

预期：迁移成功；三个管理员账号存在。

- [ ] **步骤 4：提交**

```bash
git add apps/api/prisma apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): 增加 Prisma 模型与角色种子数据"
```

---

### 任务 3：鉴权模块（JWT + 角色）

**文件：**
- 创建：`apps/api/src/auth/auth.module.ts`、`auth.service.ts`、`auth.controller.ts`、`jwt.strategy.ts`、`roles.decorator.ts`、`roles.guard.ts`、`dto/login.dto.ts`
- 测试：`apps/api/src/auth/auth.service.spec.ts`

**接口：**
- 产出：`POST /api/auth/login` → `{ accessToken, role, username }`；守卫 `JwtAuthGuard`、`RolesGuard`；装饰器 `@Roles('operator','admin')`
- 消费：Prisma `AdminUser`

- [ ] **步骤 1：编写失败用例（错误密码）**

```typescript
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  it('rejects bad password', async () => {
    const prisma = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: '1',
          username: 'admin',
          passwordHash: '$2a$10$invalid',
          role: 'admin',
        }),
      },
    } as any;
    const jwt = { signAsync: jest.fn() } as any;
    const svc = new AuthService(prisma, jwt);
    await expect(svc.login('admin', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **步骤 2：跑测试——预期 FAIL（模块尚不存在）**

```bash
pnpm --filter @tuya-ops/api test -- auth.service.spec.ts
```

预期：FAIL（找不到模块 / AuthService 未定义）。

- [ ] **步骤 3：实现 AuthService + Controller + Guard**

`login` 校验 bcrypt，签发 JWT payload `{ sub, username, role }`。

`RolesGuard` 读取 `@Roles(...)` 元数据，与 `request.user.role` 比较。

`POST /api/auth/login` 请求体：`{ username: string, password: string }`。

- [ ] **步骤 4：再跑测试——预期 PASS**

- [ ] **步骤 5：提交**

```bash
git commit -am "feat(api): JWT 登录与角色守卫"
```

---

### 任务 4：涂鸦 OpenAPI 客户端封装

**文件：**
- 创建：`apps/api/src/tuya/tuya.module.ts`、`tuya.config.ts`、`tuya.client.ts`、`tuya.client.spec.ts`

**接口：**
- 产出：
  - `TuyaClient.getDevice(deviceId: string): Promise<TuyaDeviceDetail>`
  - `TuyaClient.getDeviceStatus(deviceId: string): Promise<Array<{ code: string; value: unknown }>>`
  - `TuyaClient.getStandardFunctions(deviceId: string): Promise<StandardFunction[]>`
  - `TuyaClient.sendStandardCommand(deviceId: string, commands: Array<{ code: string; value: unknown }>): Promise<unknown>`
  - `TuyaClient.listDevicesByProduct(productId: string, page: number): Promise<{ list: TuyaDeviceSummary[]; total: number }>`
  - `TuyaClient.getDeviceUsers(deviceId: string): Promise<TuyaUid[]>`（OEM 绑定查询——封装云项目中已开通的对应 API）
- 消费：`TUYA_BASE_URL`、`TUYA_ACCESS_ID`、`TUYA_ACCESS_SECRET`
- 约束：`product_id` 不在 `TUYA_PRODUCT_IDS` 内的设备一律忽略

- [ ] **步骤 1：编写产品白名单单元测试**

```typescript
import { isAllowedProduct } from './tuya.client';

describe('isAllowedProduct', () => {
  const allowed = new Set([
    'uhmj5b0ba31zpme6',
    'qxjzruuqz40bty7e',
    'nohrp3vbmef7vxvx',
  ]);
  it('allows whitelisted pid', () => {
    expect(isAllowedProduct('uhmj5b0ba31zpme6', allowed)).toBe(true);
  });
  it('blocks unknown pid', () => {
    expect(isAllowedProduct('other', allowed)).toBe(false);
  });
});
```

- [ ] **步骤 2：用 `@tuya/tuya-connector-nodejs` 实现客户端**

中国区 Base URL：`https://openapi.tuyacn.com`。方法映射：
- 设备详情：`GET /v1.0/devices/{device_id}`
- 状态：`GET /v1.0/devices/{device_id}/status`
- 标准功能（指令集）：`GET /v1.0/devices/{device_id}/functions`（若云项目开通的是其它「标准指令集」路径，优先用已开通路径）
- 下发指令：`POST /v1.0/devices/{device_id}/commands`，body `{ commands: [{ code, value }] }`

导出 `isAllowedProduct(productId, allowedSet)`。

- [ ] **步骤 3：测试通过后提交**

```bash
git commit -am "feat(api): 涂鸦 OpenAPI 客户端与产品白名单"
```

---

### 任务 5：设备 + 终端用户查询 API

**文件：**
- 创建：`apps/api/src/devices/*`、`apps/api/src/end-users/*`
- 测试：`apps/api/src/devices/devices.service.spec.ts`

**接口：**
- 产出：
  - `GET /api/devices?q&productId&onlineStatus&page&pageSize`
  - `GET /api/devices/:deviceId`（含绑定用户、最新 statusJson、未关闭告警）
  - `GET /api/end-users?q&page&pageSize`
  - `GET /api/end-users/:tuyaUid/devices`
- **不提供 DELETE 路由**

- [ ] **步骤 1：失败用例——按 productId 过滤**

```typescript
it('filters devices by productId', async () => {
  const prisma = {
    device: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  } as any;
  const svc = new DevicesService(prisma);
  await svc.list({ productId: 'uhmj5b0ba31zpme6', page: 1, pageSize: 20 });
  expect(prisma.device.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ productId: 'uhmj5b0ba31zpme6' }),
    }),
  );
});
```

- [ ] **步骤 2：实现 Service/Controller，GET 使用 `@Roles('readonly','operator','admin')`**

详情 DTO 必须包含：`deviceId`、`productId`、`name`、`onlineStatus`、`statusJson`、`bindings: [{ tuyaUid, username, mobile }]`、`openAlertCount`。

- [ ] **步骤 3：测试通过后提交**

```bash
git commit -am "feat(api): 设备与终端用户只读查询 API"
```

---

### 任务 6：Kafka 消费者——落库事件、更新设备、产生告警

**文件：**
- 创建：`apps/api/src/kafka/kafka.module.ts`、`kafka.consumer.ts`、`event-handler.service.ts`、`event-handler.service.spec.ts`

**接口：**
- 消费：CKafka topic `KAFKA_TOPIC_DEVICE_EVENTS`，消息形状：
```typescript
type DeviceBusMessage = {
  bizCode: string;          // 如 deviceOnline、deviceOffline、devicePropertyMessage 等
  ts: number;               // 毫秒
  productId?: string;
  deviceId: string;
  payload: Record<string, unknown>;
};
```
- 产出：白名单内设备 upsert `Device`；插入 `DeviceEvent`；更新 `onlineStatus`/`statusJson`/`lastSeenAt`；开闭 `Alert`

- [ ] **步骤 1：编写 handler 规则失败/通过用例**

```typescript
describe('EventHandlerService', () => {
  it('ignores non-whitelisted product', async () => {
    const prisma = { device: { upsert: jest.fn() } } as any;
    const handler = new EventHandlerService(prisma, new Set(['uhmj5b0ba31zpme6']));
    await handler.handle({
      bizCode: 'deviceOnline',
      ts: Date.now(),
      deviceId: 'd1',
      productId: 'not-allowed',
      payload: {},
    });
    expect(prisma.device.upsert).not.toHaveBeenCalled();
  });

  it('sets online on deviceOnline', async () => {
    const prisma = {
      device: {
        upsert: jest.fn().mockResolvedValue({ id: 'local1', deviceId: 'd1' }),
        update: jest.fn(),
      },
      deviceEvent: { create: jest.fn() },
      alert: { updateMany: jest.fn() },
    } as any;
    const handler = new EventHandlerService(prisma, new Set(['uhmj5b0ba31zpme6']));
    await handler.handle({
      bizCode: 'deviceOnline',
      ts: Date.now(),
      deviceId: 'd1',
      productId: 'uhmj5b0ba31zpme6',
      payload: {},
    });
    expect(prisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ onlineStatus: 'online' }),
      }),
    );
  });
});
```

- [ ] **步骤 2：实现 handler 映射**

| bizCode（按涂鸦实际名称归一） | 动作 |
| --- | --- |
| online / deviceOnline | `onlineStatus=online`；关闭 `source=local_offline` 的未关闭告警 |
| offline / deviceOffline | `onlineStatus=offline` |
| property / 状态上报 | 合并进 `statusJson`；若 payload 含故障/告警类 DP，则 `Alert` 开启 `source=device` |
| bindUser / unbindUser（以项目文档为准） | upsert/删除 `DeviceBinding`，并确保 `EndUser` 存在 |

未知 bizCode：若设备已知且在白名单内，仍写入 `DeviceEvent`；不得导致进程崩溃。

- [ ] **步骤 3：在 `onModuleInit` 中接入 kafkajs 消费者**

订阅 `KAFKA_TOPIC_DEVICE_EVENTS`，JSON.parse 后调用 `handler.handle`。毒消息打日志并继续（避免整分区卡死；至少落错误日志）。

- [ ] **步骤 4：测试通过后提交**

```bash
git commit -am "feat(api): CKafka 消费者落库事件与告警"
```

---

### 任务 7：Pulsar → CKafka 桥接服务

**文件：**
- 创建：`apps/bridge/src/index.ts`、`pulsar.ts`、`kafka-producer.ts`、`normalize.ts`、`normalize.spec.ts`
- 修改：`docker-compose.yml`（可选本地 Redpanda/Kafka 便于开发）

**接口：**
- 消费：涂鸦 Pulsar 消息（按涂鸦 MQ 文档 AES 解密）
- 产出：Kafka 消息，形状与任务 6 的 `DeviceBusMessage` 一致

- [ ] **步骤 1：编写 normalize 单元测试**

```typescript
import { normalizeTuyaMessage } from './normalize';

it('maps Tuya online payload to DeviceBusMessage', () => {
  const out = normalizeTuyaMessage({
    bizCode: 'deviceOnline',
    dataId: 'x',
    ts: 1710000000000,
    productKey: 'uhmj5b0ba31zpme6',
    devId: 'vdevo1',
  });
  expect(out).toEqual({
    bizCode: 'deviceOnline',
    ts: 1710000000000,
    productId: 'uhmj5b0ba31zpme6',
    deviceId: 'vdevo1',
    payload: expect.any(Object),
  });
});
```

- [ ] **步骤 2：实现 Pulsar 消费 + Kafka 生产**

中国区 Pulsar：`pulsar+ssl://mqe.tuyacn.com:7285/`，accessId/accessKey 鉴权。每条消息：解密 → `normalizeTuyaMessage` → `producer.send` 到 `KAFKA_TOPIC_DEVICE_EVENTS`。

仅在 Kafka 发送成功后 ack Pulsar；失败则 nack/重消费。

- [ ] **步骤 3：Compose 增加本地 Kafka（Redpanda）开发配置**

```yaml
  redpanda:
    image: redpandadata/redpanda:v24.2.4
    command:
      - redpanda start --overprovisioned --smp 1 --memory 512M
      - --kafka-addr internal://0.0.0.0:9092,external://0.0.0.0:19092
      - --advertise-kafka-addr internal://redpanda:9092,external://127.0.0.1:19092
    ports: ["19092:19092"]
```

生产环境：将 `KAFKA_BROKERS` 指向腾讯云 CKafka。

- [ ] **步骤 4：测试通过后提交**

```bash
git commit -am "feat(bridge): Pulsar 到 CKafka 转发"
```

---

### 任务 8：绑定对账定时任务 + 手动同步触发

**文件：**
- 创建：`apps/api/src/sync/sync.module.ts`、`sync.service.ts`、`sync.controller.ts`、`sync.service.spec.ts`

**接口：**
- 产出：
  - 每 15 分钟 cron：按白名单产品分页拉设备，upsert `Device`，拉用户/绑定，upsert `EndUser`/`DeviceBinding`，更新 `syncedAt`
  - `POST /api/sync/reconcile`（`@Roles('admin')`）立即跑一次
  - 写 `AuditLog`，`action=sync.reconcile`

- [ ] **步骤 1：测试白名单外设备被跳过**

- [ ] **步骤 2：用 `TuyaClient` 实现对账**

伪代码：
```typescript
async reconcileAll() {
  for (const productId of this.productIds) {
    let page = 1;
    for (;;) {
      const { list, total } = await this.tuya.listDevicesByProduct(productId, page);
      for (const d of list) {
        const device = await this.upsertDevice(d);
        const users = await this.tuya.getDeviceUsers(d.deviceId);
        await this.replaceBindings(device.id, users);
      }
      if (page * pageSize >= total) break;
      page++;
    }
  }
}
```

- [ ] **步骤 3：测试通过后提交**

```bash
git commit -am "feat(api): 绑定对账定时任务与管理员触发"
```

---

### 任务 9：标准指令下发 + 指令历史 + 审计 + DP 别名

**文件：**
- 创建：`apps/api/src/commands/*`、`apps/api/src/dp-aliases/*`
- 测试：`apps/api/src/commands/commands.service.spec.ts`

**接口：**
- 产出：
  - `GET /api/devices/:deviceId/functions` —— 涂鸦标准功能 + 关联 `DpAlias`
  - `POST /api/devices/:deviceId/commands` body `{ code: string, value: unknown }` —— `@Roles('operator','admin')`
  - `GET /api/commands?deviceId&page`
  - `GET/PUT/DELETE /api/dp-aliases` —— 写操作 `@Roles('admin')`；GET 所有已登录角色可用
- 下发流程：调涂鸦 → 写 `CommandLog` → 写 `AuditLog`（`action=device.command`）

- [ ] **步骤 1：失败用例——设备不存在抛 NotFound**

```typescript
it('throws NotFound for unknown device', async () => {
  const prisma = { device: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
  const tuya = { sendStandardCommand: jest.fn() } as any;
  const svc = new CommandsService(prisma, tuya);
  await expect(
    svc.send('missing', 'admin1', { code: 'switch_1', value: true }),
  ).rejects.toBeInstanceOf(NotFoundException);
});
```

- [ ] **步骤 2：实现下发与别名 CRUD**

调用涂鸦前校验 `device.productId` 在白名单内。

- [ ] **步骤 3：测试通过后提交**

```bash
git commit -am "feat(api): 标准指令、历史与 DP 别名"
```

---

### 任务 10：告警 API + 本地离线规则任务

**文件：**
- 创建：`apps/api/src/alerts/alerts.module.ts`、`alerts.service.ts`、`alerts.controller.ts`、`offline-rule.job.ts`、`offline-rule.job.spec.ts`

**接口：**
- 产出：
  - `GET /api/alerts?status=open&page`
  - `POST /api/alerts/:id/ack`（`operator|admin`）
  - 每 5 分钟 cron：查找 `onlineStatus=offline` 且 `lastSeenAt < now - OFFLINE_ALERT_MINUTES` 的设备，upsert 未关闭 `Alert`（`source=local_offline`，`title=设备长时间离线`）

- [ ] **步骤 1：单元测试——已有未关闭 local_offline 告警时不重复创建**

```typescript
it('does not duplicate open local_offline alerts', async () => {
  const prisma = {
    device: { findMany: jest.fn().mockResolvedValue([{ id: '1', deviceId: 'd1', lastSeenAt: new Date(0) }]) },
    alert: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
      create: jest.fn(),
    },
  } as any;
  const job = new OfflineRuleJob(prisma, 30);
  await job.run();
  expect(prisma.alert.create).not.toHaveBeenCalled();
});
```

- [ ] **步骤 2：实现；测试通过后提交**

```bash
git commit -am "feat(api): 告警列表与离线本地规则"
```

---

### 任务 11：90 天历史清理任务

**文件：**
- 创建：`apps/api/src/retention/retention.job.ts`、`retention.job.spec.ts`

**接口：**
- 每日 cron：删除 `DeviceEvent`、`CommandLog`，以及已关闭且超过 90 天的 `Alert`（按 `createdAt` / `eventTime` / `openedAt`）
- `AuditLog` 一期同样按 **90 天**清理

- [ ] **步骤 1：测试删除条件使用正确 cutoff 日期**

- [ ] **步骤 2：实现后提交**

```bash
git commit -am "feat(api): 90 天历史保留清理任务"
```

---

### 任务 12：React 应用壳——登录 + 角色门控 + 路由

**文件：**
- 创建：`apps/web/src/**` 下 Vite React 应用
- 测试：`apps/web/src/auth/auth.test.ts`（token 存储辅助函数）

**接口：**
- 产出路由：`/login`、`/devices`、`/devices/:deviceId`、`/users`、`/users/:tuyaUid`、`/alerts`、`/commands`、`/settings/aliases`
- API 客户端附带 `Authorization: Bearer <token>`；401 跳转登录

- [ ] **步骤 1：脚手架 Vite React + React Router**

```bash
pnpm --filter @tuya-ops/web add react react-dom react-router-dom
pnpm --filter @tuya-ops/web add -D vite typescript @types/react @types/react-dom vitest
```

- [ ] **步骤 2：实现 LoginPage，调用 `POST /api/auth/login`**

token 与角色存 `localStorage`：`ops_token`、`ops_role`。

- [ ] **步骤 3：`RoleGate`——仅 `operator`/`admin` 显示下发按钮；别名设置仅 `admin`**

- [ ] **步骤 4：提交**

```bash
git commit -am "feat(web): 登录壳与角色门控路由"
```

---

### 任务 13：设备列表 + 详情 + 指令面板

**文件：**
- 创建：`DevicesPage.tsx`、`DeviceDetailPage.tsx`、`DeviceTable.tsx`、`CommandPanel.tsx`
- 测试：`CommandPanel.test.tsx`——有别名时渲染别名文案

**接口：**
- 消费：任务 5、9 的设备列表/详情/功能/指令 API
- UX：表格列——deviceId / 名称 / productId / 在线状态 / 绑定用户 / 未关闭告警 / lastSeenAt；行点击进详情
- 详情：status JSON、绑定用户、未关闭告警、`CommandPanel`（按功能类型动态渲染 bool/enum/integer/string）；**无删除按钮**

- [ ] **步骤 1：实现列表与筛选（q、productId、onlineStatus）**

- [ ] **步骤 2：实现 CommandPanel**

对 `/functions` 返回的每一项，展示 `alias ?? code`。提交调用 `POST /commands`。`readonly` 整面板禁用。

- [ ] **步骤 3：提交**

```bash
git commit -am "feat(web): 设备列表、详情与指令面板"
```

---

### 任务 14：用户、告警、指令历史、别名设置页

**文件：**
- 创建：`UsersPage.tsx`、`AlertsPage.tsx`、`CommandHistoryPage.tsx`、`SettingsAliasesPage.tsx`

**接口：**
- 用户：搜索 → 列表；点击 → 该用户下设备
- 告警：未关闭列表 + 确认（ack）按钮
- 指令历史：可按 deviceId 筛选
- 别名：admin 按 productId/code CRUD 表格

- [ ] **步骤 1：页面接通对应 API**

- [ ] **步骤 2：手工冒烟清单（写入提交说明）**

1. 以 readonly 登录——可查看，不可下发  
2. 以 operator 登录——可下发  
3. 以 admin 登录——可改别名 + 触发同步  

- [ ] **步骤 3：提交**

```bash
git commit -am "feat(web): 用户、告警、历史与别名设置"
```

---

### 任务 15：面向 CVM 的 Compose 打包

**文件：**
- 修改：`docker-compose.yml`
- 创建：`apps/api/Dockerfile`、`apps/bridge/Dockerfile`、`apps/web/Dockerfile`、`apps/web/nginx.conf`、`README.md`

**接口：**
- 产出：`docker compose up -d` 拉起 `mysql`、`api`、`bridge`、`web`（nginx 托管静态资源并反代 `/api`）
- README 说明：腾讯云 CVM 端口、`.env` 密钥、CKafka broker、涂鸦中国区 Pulsar URL、产品白名单、默认种子账号

- [ ] **步骤 1：编写 Dockerfile（多阶段 Node 20 alpine）**

Web 的 nginx.conf 将 `/api/` 反代到 `http://api:3000/api/`。

- [ ] **步骤 2：在 compose 中增加 api/bridge/web，依赖 mysql**

- [ ] **步骤 3：编写 README 运维手册（启动顺序：mysql → api migrate → bridge → web）**

- [ ] **步骤 4：提交**

```bash
git commit -am "chore: 腾讯云 CVM 用 Docker Compose 部署"
```

---

### 任务 16：本地端到端冒烟脚本

**文件：**
- 创建：`scripts/smoke.sh`、`scripts/fixtures/sample-kafka-event.json`

**接口：**
- 产出脚本：(1) 登录；(2) 向 Kafka 写入白名单 PID 的夹具消息；(3) 断言设备可通过 API 查到；(4) 断言 readonly 下发指令返回 403

- [ ] **步骤 1：编写夹具**

```json
{
  "bizCode": "deviceOnline",
  "ts": 1710000000000,
  "productId": "uhmj5b0ba31zpme6",
  "deviceId": "smoke-device-001",
  "payload": {}
}
```

- [ ] **步骤 2：编写 `scripts/smoke.sh`（curl + kafkajs 一次性生产者）**

- [ ] **步骤 3：对本地 compose 跑冒烟；有缺口则修补**

- [ ] **步骤 4：提交**

```bash
git commit -am "test: 增加 MQ 入库与角色冒烟脚本"
```

---

## 自检（需求覆盖）

| 需求项 | 对应任务 |
| --- | --- |
| 内部运维后台 | 12–14 |
| OEM 终端用户 + 设备 | 5、8 |
| 混合数据（MQ + API 同步） | 6–8 |
| Pulsar → CKafka → 消费 | 6–7 |
| 标准指令 + 别名 | 9、13 |
| 三款 PID 白名单 | 4–6、8 |
| 中国区环境 | `.env.example`、任务 4/7 |
| 角色 readonly/operator/admin | 3、9、12 |
| 设备告警 + 离线规则 | 6、10 |
| 90 天保留 | 11 |
| 不做删除 | 5、13（无路由/无 UI） |
| CVM Compose 部署 | 1、15 |
| MySQL | 1–2 |
| Node + React | 全部 |
| 1k–10k 量级假设 | schema 索引；分页 API |

无故意 TBD 占位。OEM 绑定相关 OpenAPI 精确路径以云项目已开通接口为准——统一封装在 `TuyaClient.getDeviceUsers`，联调时只改该方法实现，不改调用方。

---

## 一期明确不做

- 设备删除 / 解绑
- 多租户 SaaS
- SSO / 企微登录
- TKE
- 非中国区涂鸦数据中心
- 白名单外产品
- 超出「离线时长 + 设备上报故障」的复杂告警规则引擎
