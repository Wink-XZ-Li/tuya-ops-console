# 系统健康监测页 · 设计（v1 只读）

> 日期：2026-10-22 Asia/Shanghai  
> 仓库：`/Users/fgt/Developer/tuya-ops-console`  
> 决策：运维台 Web 页；**v1 = 看板 + 故障清单 + 解决方案（runbook）**；一键重启/自愈 **不做**（以后再说）。  
> 与「设备故障看板 / 售后待办」正交：那边是产品 E 码；这边是运维台自身链路是否在写数据。

---

## 1. 目标与非目标

### 目标
- 一眼看清：API / MySQL / Redpanda / Kafka 消费 / Bridge / DeviceEvent 新鲜度是否健康。
- 出故障时：清单列出故障码、影响、开始时间、**可执行解决步骤**（复制命令即可，不在页面杀进程）。
- 覆盖已踩坑：bridge 假活（TCP 在但不 produce）、DeviceEvent 停更但 Device.lastSeenAt 仍更新、bridge 未启动。

### 非目标（v1）
- 页面一键重启 bridge / docker / 任意远程命令
- Prometheus/Grafana 全家桶
- 多渠道通知 / 自动 webhook（可后接；密钥须子恂审）
- 设备质量故障分析、售后工单（二阶段另做）
- 修改涂鸦云订阅（只检测并提示去控制台勾 PID）

---

## 2. 信息架构（页面）

路由建议：`/system-health`（或 `/ops/health`）  
导航文案：**系统健康**（admin/operator 可见；readonly 可看不可改——v1 无改）

### 2.1 顶栏
- 整体状态：`healthy` | `degraded` | `critical`（取最差组件）
- 最后探测时间、探测耗时
- 「立即探测」按钮 → `POST /api/system-health/check`（只读聚合，不副作用）

### 2.2 组件卡片（红黄绿）
| 组件 key | 绿 | 黄 | 红 |
| --- | --- | --- | --- |
| `api` | 进程可响应 `/health` 或本接口自检 | 高延迟 | 无响应 |
| `mysql` | `SELECT 1` 成功 | 慢查询阈值（可选） | 连接失败 |
| `redpanda` | broker 可达 | — | 不可达 |
| `kafka_consumer` | group Stable 且 lag≤阈值 | lag 超软阈值 | lag 超硬阈值或无 member |
| `bridge` | 心跳新鲜且 lastForward/DeviceEvent 新鲜 | 心跳在但消息偏旧 | 无心跳 / 假活判定 |
| `device_event_freshness` | max(eventTime) 在阈值内 | 偏旧 | 严重过期且 Device.lastSeen 仍新 → 指向 bridge/订阅 |
| `demo_mode` | `live` | — | `mock`（live 期望时） |

### 2.3 故障清单
列：故障码、标题、严重级别、开始时间、持续、影响说明、**解决方案**（多步，可复制）、状态（open/resolved）

### 2.4 解决步骤区
每条故障展开 runbook；提供「复制全部命令」；**不**提供执行按钮。

---

## 3. 探针与故障码目录

### 3.1 探针实现位置
- Nest 模块：`apps/api/src/system-health/`
- 按需探测（打开页面 / 点立即探测）；可选轻量 cron 每 1～5 分钟写快照（v1 可先按需）
- Bridge 心跳：bridge 进程定期写文件或 HTTP 旁路 **或** 仅用「Kafka 末条 ts + DeviceEvent.max」推断（v1 推荐后者，少改 bridge；bridge 加固后可再加 `BRIDGE_HEARTBEAT` 文件/端点）

### 3.2 故障码 → 解决方案（写进代码常量表 `system-health.catalog.ts`）

| code | 判定 | 影响 | 解决方案（展示给用户） |
| --- | --- | --- | --- |
| `BRIDGE_DOWN` | 无法确认 bridge 存活，且 DeviceEvent 停更 | 设备日志/实时故障告警停写 | 1. 仓库根目录执行 `pnpm dev:bridge` 2. 确认日志有 `Tuya MQ WebSocket open` 与 `Forwarded` 3. 刷新本页 |
| `BRIDGE_STALE` | Kafka 末条/DeviceEvent 超过 `STALE_MS`（默认 15min）无增长，且 Device.max(lastSeenAt) 仍新 | 假活：连着但不写 | 1. 终端 Ctrl+C 停掉假活 bridge 2. `pnpm dev:bridge`（建议 `2>&1 \| tee -a logs/bridge.log`）3. 确认 Kafka HW / 本页新鲜度恢复 4. 建议合入 bridge pong/看门狗加固 |
| `KAFKA_UNREACHABLE` | broker `127.0.0.1:19092` 不可达 | 整条 MQ 链路断 | `docker compose ps` / 启动 redpanda |
| `KAFKA_LAG` | consumer group `tuya-ops-demo` lag > 阈值 | 延迟入库 | 查 API 日志 KafkaConsumer；必要时重启 api |
| `EVENT_GAP` | DeviceEvent 旧但 lastSeen 新（与 BRIDGE_STALE 可合并展示） | 同步正常、事件路径断 | 同 BRIDGE_*；勿只点「同步设备」 |
| `MYSQL_DOWN` | DB ping 失败 | 后台不可用 | 启动 mysql 容器 |
| `API_DEMO_MOCK` | `DEMO_MODE=mock` 而运维期望 live | 无真实 MQ | 改 `.env` 为 live 并重启 api/bridge |
| `TUYA_SUBSCRIPTION_HINT` | （可选人工/半自动）事件长期空且 bridge 正常 | 云侧未勾 PID | 打开涂鸦云开发订阅规则，勾选产品 PID |

阈值建议 env：
```bash
SYSTEM_HEALTH_STALE_EVENT_MS=900000
SYSTEM_HEALTH_KAFKA_LAG_WARN=100
SYSTEM_HEALTH_KAFKA_LAG_CRIT=1000
```

---

## 4. 数据模型（v1 尽量薄）

### 方案 A（推荐 v1）：无新表
- `GET /api/system-health` 每次现场探测，返回 JSON（components + openIssues 由判定函数生成）
- 不持久化历史；实现最快

### 方案 B（若需要历史）：`SystemHealthSnapshot` + `SystemIncident`
- snapshot：json 结果 + createdAt
- incident：code、openedAt、resolvedAt、detail
- v1.1 再加

**v1 采用方案 A。**

---

## 5. API

```
GET  /api/system-health          # 聚合状态 + components[] + issues[]
POST /api/system-health/check    # 强制刷新（同 GET，可记 audit「手动探测」）
GET  /api/system-health/catalog  # 故障码与 runbook 文案（前端也可静态打包）
```

`issues[]` 项：
```ts
{
  code: string
  severity: 'warn' | 'crit'
  title: string
  since?: string  // 若可知（如最后 eventTime）
  impact: string
  steps: string[]  // 解决方案步骤
  related?: { deviceEventMaxAt?: string; kafkaHw?: number; lag?: number }
}
```

权限：登录用户可读；无需写权限。

---

## 6. 前端

- 新页 `SystemHealthPage.tsx`
- `AppLayout` 增加「系统健康」
- 组件：StatusBadge、ComponentGrid、IssueTable（展开 runbook + 复制）
- 自动每 60s 轻量刷新（可关）

---

## 7. 与现有模块边界

| 现有 | 关系 |
| --- | --- |
| 故障看板 / Alert faultCode | 不混用；系统健康不展示 E1/E3 |
| 售后待办 | 不混用 |
| bridge 加固（pong/看门狗） | 互补：加固减少假活；本页负责发现与 runbook |
| RetentionJob | 仅作说明：停写过久 + 保留天数会导致表空，探针用「新鲜度」而非「条数为 0」单独定严重级 |

---

## 8. 分阶段

| 阶段 | 内容 |
| --- | --- |
| **v1（本设计）** | GET 聚合 + 页面看板 + 清单 + runbook；无动作按钮 |
| v1.1 | 可选 cron 快照；bridge 暴露 lastMsgAgo 心跳文件供探针 |
| v1.2 | 受控动作（OpsAction 队列 + 本机执行器 + 审计）；默认关 |
| 以后 | webhook 到测试群（须审密钥） |

---

## 9. 验收（v1）

1. 正常 live：整体绿；DeviceEvent 新鲜。
2. 停 bridge：出现 `BRIDGE_DOWN` 或 `BRIDGE_STALE`/`EVENT_GAP`，步骤含 `pnpm dev:bridge`。
3. 假活模拟（或历史）：Device lastSeen 新、Event 旧 → 清单提示勿只靠同步。
4. readonly/operator 能打开页面；无「重启」按钮。
5. 与故障看板导航文案不混淆。

---

## 10. Cursor 可粘贴开工指令

见同目录或聊天下发的粘贴块；严格按 v1，禁止做一键重启。
