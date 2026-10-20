# 会前开发规划：故障按码记账

给 Cursor / 实现方直接执行。范围仅「会前」：修四条写入路径 + Alert 迁移回填 + 页面/接口口径改名。不做规则引擎、字典编辑页、周报、售后清单、webhook。

源码仓库：本机 `/Users/fgt/Developer/tuya-ops-console`（含未提交分析代码）。改完后本地跑通即可，是否提交由用户决定。

参考画布：`.cursor/projects/.../canvases/docking-system-changes.canvas.tsx` 的「会前」页。

---

## 0. 目标与验收

**目标**：故障告警按产品故障码（bitmap label）开/关/去重；离线不算故障；日汇总按真实 `faultCode` 记账；页面能区分「质量故障率」和「待处理台数」。

**验收（全部满足才算完成）**

1. 同一设备同一故障码反复上报：全程只有 1 条 `status != closed` 的告警，`occurrenceCount` 递增，`lastSeenAt` 更新。
2. bitmap 对应 bit 回到 0：该码告警自动关闭，`activeKey` 置 `NULL`，`closedReason=auto_clear`。
3. 离线告警：`category=connectivity`、`faultCode=offline`；不上 `DailyFaultStat`；不把 `Device.faultStatus` 标成 `fault`。
4. 设备上线：关闭该设备所有未关闭的 connectivity/offline 告警，并清空其 `activeKey`。
5. 热水器（`nohrp3vbmef7vxvx`）故障码顺序为 **E1、E3、E4、E2**（不是 E1–E4 顺排）。
6. 存量 open 的 `source=device` 垃圾告警：按指纹合并或无法解析则关闭（`closedReason=migration_dedupe`），库里每个 `(deviceId, fault label)` 最多一条 open。
7. `POST /api/alerts/:id/close` 可用，写入 `closedReason=manual`、`closedAt`、清空 `activeKey`，并写 `AuditLog`。
8. 故障分析页：柱状图按 `faultCode`；拆分「质量故障率」与「待处理台数」。设备使用页在线率标题为「当前快照」。用户分析页星象仪数字带来源标注。报表 CSV 列名与上述一致，不再导出裸 `source` 当故障码。

---

## 1. Prisma 变更

### 1.1 `Alert` 扩展字段

在 `apps/api/prisma/schema.prisma` 的 `Alert` 上增加（均可空或有默认值，便于迁移）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `category` | `String?` | `fault` \| `connectivity`（预留字符串，先不建 enum） |
| `faultCode` | `String?` | 如 `E1`、`offline` |
| `fingerprint` | `String?` | 稳定指纹，关闭后仍保留，便于复发查询（会后用） |
| `activeKey` | `String?` | **仅 open/acked 时非空**；`@@unique` |
| `conditionStartedAt` | `DateTime?` | 故障真正开始时间；缺省回退 `openedAt` |
| `occurrenceCount` | `Int` `@default(1)` | 同一活跃告警内重复上报次数 |
| `lastSeenAt` | `DateTime?` | 最近一次仍满足条件的时间 |
| `closedReason` | `String?` | `auto_clear` \| `manual` \| `migration_dedupe` \| `online` |

索引建议：

- `@@unique([activeKey])`（MySQL 下多个 `NULL` 不冲突，关闭必须置 `NULL`，禁止空字符串）
- `@@index([deviceId, faultCode, status])`
- `@@index([category, status])`

保留现有 `source`、`title`、`detail`，兼容旧代码；新写入同时填新字段。`source` 约定：
- 故障：`device_fault`（或继续 `device`，但 `faultCode` 必填；推荐改成 `device_fault` 以便和旧脏数据区分）
- 离线：继续 `local_offline`

### 1.2 新表 `FaultCodeDefinition`

```text
id, productId, code (DP code, 通常 "fault"), label (E1/E0/…),
sortOrder Int,
symptom String? , cause String? , suggestedAction String?,
countInQualityRate Boolean @default(true),
notifyAftersales Boolean @default(false),
createdAt, updatedAt
@@unique([productId, code, label])
```

会前 **只播种 label**，现象/原因/动作/两个勾选全空或默认；**不要做编辑 API/页面**（会后）。

播种数据来自 `apps/api/src/devices/product-fault-schemas.ts`：

| productId | labels（顺序必须一致） |
| --- | --- |
| `uhmj5b0ba31zpme6`（房车空调） | E1, E2, E3, E4 |
| `nohrp3vbmef7vxvx`（热水器） | **E1, E3, E4, E2** |
| `7sylzgrdnnq2w5mo`（壁挂炉） | E0…E9, EA, Eb, EF, EL |
| 一路开关 | 无故障 DP，不播种 |

### 1.3 迁移脚本要求

单次 migration 目录，例如 `apps/api/prisma/migrations/<ts>_fault_code_alerts/`：

1. `ALTER TABLE` 加列 + 唯一索引 + 建 `FaultCodeDefinition`。
2. **数据回填（SQL 或 `prisma/$executeRaw` + 小脚本均可，必须可重复跑或有明确 once 标记）**：
   - 所有 `source=local_offline` 且未关闭：设 `category=connectivity`、`faultCode=offline`、`fingerprint`/`activeKey`=`{deviceId}:connectivity:offline`、`conditionStartedAt=openedAt`；同一设备多条 open 离线只留最早一条，其余 `closed` + `closedReason=migration_dedupe`。
   - 所有 `source=device`（或标题含故障）且未关闭：
     - 读该设备当前 `statusJson`，对每个 fault 类 DP 用 `decodeBitmapLabels` 得到当前置位 labels。
     - 每个 label 保留/创建 一条 survivor：`category=fault`、`faultCode=label`、`activeKey={deviceId}:fault:{dpCode}:{label}`、`fingerprint` 同值、`conditionStartedAt=min(openedAt of merged)`、`occurrenceCount=合并条数`。
     - 同指纹多余行关闭，`closedReason=migration_dedupe`。
     - **若设备当前 bitmap 为 0 / 无法解析**：将该设备全部旧 `source=device` open 告警关闭（`migration_dedupe`），**不要臆造 faultCode**。
3. Seed：`FaultCodeDefinition` upsert 22 个 label。
4. 迁移后跑一遍自检查询（见 §6）。

---

## 2. 四条写入路径（核心）

### 2.1 `kafka/event-handler.service.ts` → `handleProperty`

**删除** 当前逻辑：

```ts
if (collectFaultEntries(updates).length > 0) {
  await this.prisma.alert.create({ source: 'device', title: '设备上报故障/告警', ... });
}
```

**改为**（建议抽私有方法 `reconcileFaultAlerts(deviceId, productId, prevStatus, nextStatus)`）：

1. 合并 `statusJson` 仍按现有 `extractStatusUpdates`。
2. 对每个在 `getFaultBitmapLabels(productId, dpCode)` 有定义的 fault DP：
   - `prevLabels = decodeBitmapLabels(prev[dpCode], labels)`
   - `nextLabels = decodeBitmapLabels(next[dpCode], labels)`
   - `opened = next - prev`：对每个 label `upsertActiveFaultAlert`
   - `cleared = prev - next`：关闭对应 `activeKey` 的告警
   - `still = intersection`：`occurrenceCount += 1`，`lastSeenAt = now`（若本次 updates 里该 DP 有变化；若仅其它 DP 变化可不加次数——**约定：仅当该 fault DP 出现在本次 updates 且 bit 仍置位时 +1**）
3. 无 schema 的 fault DP（稀有）：可退化为单个 `faultCode=dpCode` 或 `unknown`，会前优先只处理有 schema 的三款产品。
4. `deriveFaultFields` 调用改为传入 **category=fault 的 open 告警**（或直接只信 bitmap，见 2.2），不再传 offline 标题。
5. `handleOnline`：`updateMany` 关闭 offline 时增加 `activeKey: null`、`closedReason: 'online'`、`closedAt`。

`upsertActiveFaultAlert` 伪代码：

```
activeKey = `${deviceId}:fault:${dpCode}:${label}`
fingerprint = activeKey
find unique activeKey
if exists: occurrenceCount++, lastSeenAt=now; return
else create: category=fault, faultCode=label, source=device_fault,
  title=`故障 ${label}`, detail={ dpCode, label, value },
  conditionStartedAt=now, occurrenceCount=1, lastSeenAt=now,
  activeKey, fingerprint
```

关闭：

```
status=closed, closedAt=now, closedReason=auto_clear, activeKey=null
```

**并发**：同一设备消息串行即可（现有消费者若已按分区保证同 device 有序则够用）；`create` 若撞唯一约束则改为 update（catch P2002）。

### 2.2 `devices/device-derived.ts` → `deriveFaultFields`

**改签名建议**（保持向后兼容也可）：

```ts
deriveFaultFields(
  status,
  opts?: {
    productId?: string | null;
    openFaultAlerts?: Array<{ faultCode: string | null; title: string }>; // 仅 category=fault
  }
)
```

规则：

1. 若 bitmap / `collectFaultEntries` 显示有活跃故障 → `faultStatus=fault`，`faultInfo` 用 `formatFaultEntry`（现有）。
2. **否则不要**因为 offline 告警标题把设备标成 fault。
3. 可选：若传入的 `openFaultAlerts.length > 0` 且 bitmap 暂空（状态未到）→ 仍可标 fault（防止状态丢失）；**禁止**把 connectivity 告警传进来。
4. 无 status 且无 fault 告警 → `unknown`；否则 `normal`。

同步修改调用方（必须全改）：

- `event-handler.service.ts`
- `devices/devices.service.ts`
- `sync/sync.service.ts`

用 `grep deriveFaultFields` 确认无遗漏。

### 2.3 `alerts/offline-rule.job.ts`

保留「已有 open 则 skip」逻辑，创建 时补全：

```
source: 'local_offline'
category: 'connectivity'
faultCode: 'offline'
title: '设备长时间离线'
fingerprint / activeKey: `${device.id}:connectivity:offline`
conditionStartedAt: device.lastSeenAt ?? now
occurrenceCount: 1
lastSeenAt: now
```

查找 existing 时改为按 `activeKey` 或 `(deviceId, category, faultCode, status not closed)`，不要只靠 `source`（兼容迁移后数据）。

阈值仍 `OFFLINE_ALERT_MINUTES`。

### 2.4 `analytics/rollup.job.ts`

1. 删除或改写 `faultCodeOf(source, title)`：改为 `row.faultCode ?? 'unknown'`。
2. `rollupFaultStats` 的三个查询 `select` 增加 `faultCode`、`category`、`conditionStartedAt`；**过滤** `category = 'connectivity'`（或 `faultCode = 'offline'`）不进入 `DailyFaultStat`。
3. MTTR/持续时长：`closedAt - (conditionStartedAt ?? openedAt)`，分钟数；页面文案后续改为「持续时长」（会前故障分析页改名即可）。
4. **不要**在本任务重写 `rollupDeviceMetrics` 的「昨天覆盖」问题；仅确保 `faultCount` 依赖的 `Device.faultStatus` 在 2.2 修完后变准。
5. 更新 `analytics.service` / 前端若仍按 `source` 聚合，一并改为 `faultCode`。

---

## 3. API 与页面（会前最小集）

### 3.1 Alerts API

- `GET` 列表 DTO 增加：`category`、`faultCode`、`conditionStartedAt`、`occurrenceCount`、`lastSeenAt`、`durationMinutes`（计算字段）。
- `POST /api/alerts/:id/close`（operator/admin）：
  - body 可选 `{ reason?: string }`
  - 置 `status=closed`、`closedAt`、`closedReason=manual`、`activeKey=null`
  - 写 `AuditLog`
- 现有 ack 若有，ack 不要清空 `activeKey`。

### 3.2 前端

| 页面 | 改动 |
| --- | --- |
| `FaultsAnalyticsPage` | 柱状图 X 轴用 `faultCode`；KPI 拆成「质量故障率」（fault 类、且日后可按字典 `countInQualityRate`；会前可先 = 当日有 fault 告警的设备数/在网数）和「待处理台数」（未关闭 fault 告警涉及的设备数）。MTTR 文案改为「平均持续时长」。 |
| `DevicesAnalyticsPage` / Dashboard | 在线率标题改为「当前快照在线率」或等价文案。 |
| `UsersAnalyticsPage` | 星象仪数字旁标注来源「涂鸦数据星象仪」；若易加，补「有绑定的用户占比」= 至少一条 DeviceBinding 的 EndUser / EndUser 总数。 |
| `AlertsPage` | 列表展示 faultCode、持续时长、次数；提供关闭按钮走新 API。 |
| 报表 CSV | 列名与上述口径一致，禁止把 `source` 当成故障码列。 |

**会前不要**：字典编辑页、产品周报模板、售后清单改版、webhook。

---

## 4. 测试

在 `apps/api` 现有 jest 风格下补充/修改：

1. **bitmap 开码**：prev=0 → next=bit0 → 创建 1 条 E1（按产品 label）。
2. **重复上报**：再次 next 含同一 bit → 仍 1 条，`occurrenceCount=2`。
3. **清码**：next=0 → 关闭，`activeKey` 为 null。
4. **多码同时**：壁挂炉两 bit → 两条告警；清其中一个只关一条。
5. **热水器顺序**：bit1 → **E3**（不是 E2）。
6. **offline**：job 创建 connectivity；`deriveFaultFields` 后 `faultStatus` 仍为 normal（无 bitmap 时）。
7. **online**：关闭 offline 且 `activeKey` null。
8. **rollup**：只出现 `E1` 等，不出现 `device` / `local_offline` 作为 faultCode。
9. **close API**：手动关闭清 activeKey。

前端可不加 E2E；改完手动点开故障分析/告警页看一眼即可。

---

## 5. 实现顺序（建议 commit 粒度）

1. Prisma schema + migration 结构（空回填）+ `FaultCodeDefinition` seed。
2. 回填脚本 + 自检 SQL。
3. `device-derived` + 所有调用方。
4. `event-handler` reconcile + `handleOnline` 清 activeKey。
5. `offline-rule.job`。
6. `rollup.job` + analytics 读路径。
7. Alerts API close + 列表字段。
8. 前端四页文案/字段。
9. 跑测试 + `pnpm demo:smoke`（若环境可用）。

---

## 6. 自检 SQL（迁移后执行）

```sql
-- 不应存在：未关闭却没有 activeKey 的告警（新逻辑写入后）
-- 迁移刚完成时允许短暂不一致，回填结束应满足：
SELECT COUNT(*) FROM Alert WHERE status <> 'closed' AND activeKey IS NULL;
-- 期望 0

-- 同一 activeKey 不应重复（唯一约束已保证）

-- 未关闭离线必须是 connectivity/offline
SELECT COUNT(*) FROM Alert
WHERE status <> 'closed' AND source = 'local_offline'
  AND (category <> 'connectivity' OR faultCode <> 'offline');
-- 期望 0

-- DailyFaultStat 不应再出现 source 风格码（rollup 跑完后）
SELECT DISTINCT faultCode FROM DailyFaultStat;
-- 期望只有 E0/E1/.../offline 不应出现；offline 也不应出现
```

---

## 7. 明确不做（本任务拒绝范围）

- 通用 `AlertRule` / 规则引擎 / 水压越限 / 频繁上下线 / OTA / 无上报
- 通知渠道、outbox、静默、升级
- 云端对账、Kafka DLQ、eventTs 改造
- 时间加权在线率、`DailyDeviceAvailability`、DP 日统计
- 字典编辑 UI、产品周报模板、售后清单改版
- 修改 GitHub 远程或强推；密钥进仓库

---

## 8. 给实现方的注意句

- 关闭告警时 **`activeKey` 必须 SQL NULL**，不要 `''`。
- 存量合并解不出码就关，不要猜。
- 热水器 label 顺序写进测试。
- 只信 bitmap + `category=fault` 决定 `faultStatus`。
