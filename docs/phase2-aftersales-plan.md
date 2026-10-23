# 二阶段：售后作业系统 — 闸门核验与可执行切片

> 核验时间：2026-10-21 18:02–18:10 Asia/Shanghai  
> 仓库：本机 `/Users/fgt/Developer/tuya-ops-console`（machineId `e3816454-5cb3-44e9-94fa-9f528d902604`）  
> 一阶段表述：页面叫「故障看板」（代码/导航里仍有「故障分析」字样，见下）  
> 本轮只读：`git status` / `git diff --stat`、关键路径阅读、本地 MySQL 只读自检。未 restart 服务、未写库、未跑破坏性命令。

---

## A. 一阶段闸门状态

### 总判：**有条件过**

依据：

- 本地 `main` 已落在 `92f365d`（`feat(alerts): 按故障码记账并区分质量故障与离线`），相对 `gitea/main` 同步；未提交改动主要是 taste/设备同步等，**不回滚**一阶段告警逻辑。
- 八条验收在**代码 + 单测 + 本地库只读自检**层面均「看起来有了」；本轮**未重跑** `pnpm test` / Kafka 端到端，也未勾 Notion「完成故障告警 demo 优化」。
- **无挡住二阶段开工的硬缺口**；下列软缺口建议顺手修或在二阶段开头补一句验收，但不应用来阻塞字典/待办切片。

软条件（建议二阶段开工前 30 分钟内做完，或并入 D 的「先补」可选分支）：

1. 导航/文案：`AppLayout` 仍写「故障分析」，产品口径是「故障看板」。
2. 本轮未执行：`cd apps/api && pnpm test`（相关 spec 已在仓库内）。
3. Notion 进展日志「完成故障告警 demo 优化」仍 `完成=否`（与代码状态脱节）。
4. `countInQualityRate` 字段已种子化，但质量故障率 KPI **尚未按字典过滤**（会前计划允许；二阶段字典页落地后应接上）。

### 8 条验收表

| # | 验收项 | 状态 | 证据（路径 / 符号） | 缺口 |
| --- | --- | --- | --- | --- |
| 1 | 同设备同故障码反复上报：仅 1 条 `status!=closed`，`occurrenceCount` 递增，`lastSeenAt` 更新 | **已实现** | `apps/api/src/kafka/event-handler.service.ts` → `reconcileFaultAlerts` / `upsertActiveFaultAlert`（`activeKey` 命中则 increment）；`event-handler.service.spec.ts`「opens one E3… counts a repeat」 | 本轮未重跑 jest；未做真实 MQ 压测 |
| 2 | bitmap bit 回 0：自动关，`activeKey=NULL`，`closedReason=auto_clear` | **已实现** | 同文件 `clearFaultAlert`；spec「clears the alert when the bitmap returns to 0」 | 同上 |
| 3 | 离线：`category=connectivity`、`faultCode=offline`；不上 `DailyFaultStat`；不标 `Device.faultStatus=fault` | **已实现** | `offline-rule.job.ts` 创建字段；`rollup.job.ts` → `rollupFaultCode` 对 connectivity/offline 返回 `null`；`deriveFaultFields` 注释要求只传 `category=fault`；调用方 `event-handler` / `devices.service` / `sync.service` 均 `category: 'fault'`；库自检 `DailyFaultStat` 仅见 `E3/E4/E5` | 若历史日汇总仍有脏码，需重跑 rollup（当前库无 offline 码） |
| 4 | 设备上线：关所有未关闭 connectivity/offline，清 `activeKey` | **已实现** | `handleOnline`：`closedReason='online'`，`activeKey: null`；spec「closes offline alerts…」 | — |
| 5 | 热水器 `nohrp3vbmef7vxvx` 码序 E1、E3、E4、E2 | **已实现** | `product-fault-schemas.ts`；migration INSERT `fcd_wh_*`；库内 `FaultCodeDefinition` sortOrder 0..3 = E1,E3,E4,E2；spec bit1→E3 | — |
| 6 | 存量 open `source=device`：指纹合并或 `migration_dedupe`；每 `(deviceId, fault label)` 最多一条 open | **已实现** | `backfill-fault-alerts.ts` + `prisma/backfill-fault-alerts.ts`；migration SQL 只处理 offline，device 行靠脚本；库自检：`open source=device = 0`，按 `(deviceId,faultCode)` 重复 open = 空 | 自检是当前库快照；换环境需再跑 `pnpm backfill:fault-alerts` |
| 7 | `POST /api/alerts/:id/close`：`closedReason=manual`、`closedAt`、清 `activeKey`、`AuditLog` | **已实现** | `alerts.controller.ts` `@Post(':id/close')` + `@Roles('operator','admin')`；`alerts.service.ts` `close`；`alerts.service.spec.ts`；前端 `AlertsPage` 关闭按钮 | — |
| 8 | 故障看板：柱按 `faultCode`；质量故障率 vs 待处理台数；设备页「当前快照」；用户页星象仪来源；CSV 列名一致 | **部分** | `FaultsAnalyticsPage` KPI「质量故障率」「待处理台数」+ histogram `faultCode`；`DevicesAnalyticsPage`「当前快照在线率」；`UsersAnalyticsPage`「来源：涂鸦数据星象仪」；`analytics.service.ts` `buildReportCsv` 列：`质量故障率`/`待处理台数`/`当前快照在线率`/`users.star,来源,涂鸦数据星象仪` | 导航仍写「故障分析」非「故障看板」；质量率未读 `countInQualityRate`（会前允许） |

### 本地库只读自检（2026-10-21 Asia/Shanghai）

| 检查 | 结果 |
| --- | --- |
| `status<>closed AND activeKey IS NULL` | **0** |
| 未关闭 `local_offline` 但非 connectivity/offline | **0** |
| 热水器字典顺序 | **E1 → E3 → E4 → E2** |
| `FaultCodeDefinition` 行数 | **36**（含后续 WX2 等种子） |
| open 且 `source=device` | **0** |
| open fault 同 `(deviceId,faultCode)` 重复 | **无** |
| `DailyFaultStat` distinct faultCode | **E3, E4, E5**（无 offline / device） |

### 挡住二阶段的硬缺口列表

**无。** 一阶段核心写入路径、close API、字典表种子、看板口径均已在本机落地；二阶段可直接开切片。  
可选非阻塞：改导航文案、勾 Notion、跑一遍 `apps/api` jest。

---

## B. 二阶段 Cursor 可执行任务清单

**主题**：售后作业系统（字典 → 待办清单 → 关单接入 → webhook/outbox）  
**明确 Out**（本阶段拒绝范围）：

- 通用规则引擎 / 水压越限 / 频繁上下线 / OTA / 无上报
- 多渠道通知矩阵、静默、升级策略完整版
- 完整工单系统（派单、SLA、外部 CRM）
- 时间加权在线率、`DailyDeviceAvailability`、TopN/复发分析产品化
- IoT Core 深度对账 / DLQ / eventTs 改造
- **离线默认进质量待办**（connectivity 永不进售后质量清单）

建议 commit 粒度 = 下列 4 条；每条可单独 PR。

### 任务 1 — 故障码字典 API / 页（CRUD，保护热水器码序）

| 项 | 内容 |
| --- | --- |
| **目标** | 对 `FaultCodeDefinition` 提供列表/详情/更新（及受控创建）；运营可填 symptom/cause/suggestedAction、`countInQualityRate`、`notifyAftersales`；**禁止**把热水器 `nohrp3vbmef7vxvx` 的 label 顺序改成 E1–E4 顺排，或删除位图已定义的 label |
| **改哪些文件** | 新建 `apps/api/src/fault-codes/fault-codes.module.ts` / `fault-codes.service.ts` / `fault-codes.controller.ts` / `dto/*`；在 `app.module` 注册；前端新建 `apps/web/src/pages/FaultCodeDictionaryPage.tsx`，`AppLayout` 加「故障字典」入口（admin/operator）；可选：更新 `analytics.service` 质量故障率过滤 `countInQualityRate=true` |
| **不做边界** | 不改 bitmap 解码源 `PRODUCT_FAULT_BITMAP_LABELS` 的运行时真源（字典 sortOrder 与 schemas **应对齐**；改顺序走受保护 API 或禁止改 label 集合）；不做多语言；不做批量 Excel 导入 |
| **本地如何验** | ① `GET /api/fault-codes?productId=nohrp3vbmef7vxvx` 返回顺序 E1,E3,E4,E2；② 尝试把 sortOrder 调成 E1–E4 顺排应 400 或被拒绝；③ 更新 E3 的 symptom 后刷新待办/详情可见；④ jest：热水器顺序保护 |
| **依赖一阶段** | §5 码序种子；`FaultCodeDefinition` 表（migration `20261010103000_fault_code_alerts`） |

### 任务 2 — 售后待办清单 API / 页（category=fault 未关闭 + 字典 join）

| 项 | 内容 |
| --- | --- |
| **目标** | 售后视角列表：仅 `category='fault' AND status != closed`；join `FaultCodeDefinition`（productId+code+label）展示现象/建议动作；支持按 productId、faultCode、设备名筛选；**排除** connectivity/offline |
| **改哪些文件** | `alerts.service.ts` 增 `listAftersalesTodos`（或独立 `aftersales` 模块）；`alerts.controller.ts` 增 `GET /api/aftersales/todos`（或 `/api/alerts/todos`）；DTO 含字典字段；前端 `AftersalesTodosPage.tsx` + 导航「售后待办」；复用现有 Alerts 列表样式 |
| **不做边界** | 不把 offline 默认并入；不做指派/评论线程；不做「已关闭历史」大报表（可后续） |
| **本地如何验** | ① 造一条 open `device_fault` E3 → 待办可见且带字典文案；② 造一条 open offline → 待办**不可见**；③ readonly 可看、字段齐全 |
| **依赖一阶段** | §1 去重 open 告警；§3 离线分类；字典种子（任务 1 的读模型可先用表直读，CRUD 可并行） |

### 任务 3 — 关单接入待办清单（复用 close API + 角色）

| 项 | 内容 |
| --- | --- |
| **目标** | 待办行上「关单」走现有 `POST /api/alerts/:id/close`；operator/admin 可关，readonly 隐藏按钮；成功后列表移除该行；AuditLog 已有则不改语义 |
| **改哪些文件** | `AftersalesTodosPage.tsx`（关单按钮）；必要时 `AlertsPage` 与待办共用 `closeAlert` hook；**尽量不改** `alerts.service.close`（已满足 manual/activeKey/AuditLog） |
| **不做边界** | 不在关单时改设备 bitmap（关单是作业动作，清码仍靠上报）；不做批量关单 v1 |
| **本地如何验** | ① operator 关单 → status=closed、activeKey null、AuditLog `alert.close`；② readonly 403；③ 若 bitmap 仍置位，后续上报会按一阶段逻辑重新 upsert（文档注明预期） |
| **依赖一阶段** | §7 close API；§1 activeKey 语义 |

### 任务 4 — webhook + outbox（新开质量故障；密钥开关默认关；测试群）

| 项 | 内容 |
| --- | --- |
| **目标** | 新开 `category=fault` 且字典 `notifyAftersales=true`（无字典行则默认 false）时，事务内写 outbox；dispatcher job 投递企业微信/通用 webhook；**环境变量/开关默认关闭**；仅打测试群 URL |
| **改哪些文件** | Prisma：`AlertNotification`（或 `NotifyOutbox`）表 migration；`apps/api/src/notify/*`（`notify.service.ts` enqueue、`notify-dispatcher.job.ts`、`webhook.adapter.ts`）；在 `upsertActiveFaultAlert` **create 成功路径**调用 enqueue（occurrence 递增不通知）；`.env.example`：`AFTERSALES_WEBHOOK_ENABLED=false`、`AFTERSALES_WEBHOOK_URL=`；密钥只进 env |
| **不做边界** | 不多渠道并行、不做升级/静默完整策略、不做恢复通知（可 stub 字段）；不把 webhook URL 写入仓库；offline 不入 outbox |
| **本地如何验** | ① 开关 false：开故障无 outbox 发送；② 开关 true + mock URL：新开 E3 且 `notifyAftersales=true` 出现 pending→sent；③ 重复上报只增 occurrence：**不再**新通知；④ 关码 auto_clear 不误发「新开」 |
| **依赖一阶段** | §1 upsert/create 路径；§2 auto_clear；任务 1 的 `notifyAftersales` |

---

## C. 二阶段过闸验收 5 条（可测步骤）

> Notion 侧暂无单独成文的「二阶段 5 条」正文；以下按产品移交的四块能力细化为可测过闸项（与 B 对齐）。

1. **字典可维护且热水器码序受保护**  
   - 步骤：打开故障字典页 → 选热水器 PID → 确认顺序 E1,E3,E4,E2 → 编辑某码 symptom 并保存 → 尝试非法重排或删除位图 label → 应失败。  
   - 通过：顺序不变；合法字段可更新；非法变更被拒。

2. **售后待办 = 未关闭质量故障 + 字典信息**  
   - 步骤：准备 1 条 open fault、1 条 open offline → 打开售后待办。  
   - 通过：仅见 fault；列含 faultCode、设备、持续/次数、字典建议动作；offline 不出现。

3. **待办关单闭环**  
   - 步骤：operator 在待办点关单 → 查库 Alert + AuditLog；readonly 尝试关单。  
   - 通过：`closedReason=manual`、`activeKey IS NULL`、有 AuditLog；readonly 无权限。

4. **webhook/outbox 默认关，打开后仅新开质量故障通知测试群**  
   - 步骤：默认配置下新开故障 → 无外发；设 `AFTERSALES_WEBHOOK_ENABLED=true` 与测试 URL，且该码 `notifyAftersales=true` → 新开一条 → outbox sent；再重复上报同一码。  
   - 通过：仅首次 create 通知；重复只加次数；密钥不在 git。

5. **离线与未勾选通知的故障不进入售后质量通知/待办主路径**  
   - 步骤：offline 告警、`notifyAftersales=false` 的故障各造一条。  
   - 通过：均不进待办主列表（或 false 可进待办但**不**发 webhook——产品二选一，推荐：**待办看全部 open fault，webhook 只看 notify 开关**）；offline 两者皆否。

---

## D. 给 Cursor 的可粘贴开工指令

```text
你在本机仓库 /Users/fgt/Developer/tuya-ops-console 工作（必要读文件时用用户 machineId）。

背景：一阶段「故障按码记账」本地已有条件过闸（commit 92f365d + 库自检通过）。二阶段做「售后作业系统」。页面口径称「故障看板」不叫故障分析。

【可选：先补一阶段软缺口 — 若导航/文案未改再做】
1) AppLayout 将「故障分析」改为「故障看板」（路由可仍指向 FaultsAnalyticsPage）。
2) 在 apps/api 跑：pnpm test（关注 event-handler / offline-rule / alerts.close / backfill / rollup / device-derived）。
不要 restart 无关键服务；不要强推远程。

【一阶段已有条件过 → 直接做二阶段，严格按序】
阅读：docs/pre-meeting-dev-plan.md；/workspace/tuya-ops-alerting/phase2-aftersales-plan.md（本文件）B/C 节。

切片顺序：
1. FaultCodeDefinition CRUD API + 字典页；保护 nohrp3vbmef7vxvx 顺序 E1,E3,E4,E2；允许改 symptom/cause/suggestedAction/countInQualityRate/notifyAftersales。
2. 售后待办 API/页：仅 category=fault 且未关闭；join 字典；offline 永不进入。
3. 待办关单：复用 POST /api/alerts/:id/close（operator/admin）+ 现有 AuditLog。
4. webhook + outbox：仅新开质量故障且 notifyAftersales=true；AFTERSALES_WEBHOOK_ENABLED 默认 false；URL 只放 .env；测试群。

Out：规则引擎、多渠道、完整工单、时间加权在线率、TopN/复发、IoT Core 深度、离线默认进质量待办。

每片结束对照 phase2-aftersales-plan.md §C 五条写自检结果。改完本地可跑通即可，是否提交由用户决定。
```

若主助手判定需强制「未过」分支，将上块「可选先补」改为必做，并追加：

```text
【一阶段未过时】先修硬缺口后再进二阶段。当前核验未发现硬缺口；若复验失败，优先查：
- event-handler upsert/clear activeKey
- offline-rule category/faultCode
- handleOnline 清 activeKey
- rollupFaultCode 过滤 connectivity
- close API + AuditLog
- 热水器 schemas/种子顺序
- backfill 后 open source=device 是否清零
```

---

## 附录：本轮核验快照

| 项 | 值 |
| --- | --- |
| HEAD | `92f365d` on `main` = `gitea/main` |
| 未提交 | devices/sync/tuya + web taste（与告警闸门无冲突） |
| Docker | mysql Up、redpanda Up |
| 建议单测（未跑） | `cd apps/api && pnpm test` |
| 草稿参考 | `demo-opt-2026-10-14/15/15-ui` + `demo-opt-2026-10-16-apply-order.md`（历史粘贴包；一阶段已合入 commit，勿重复盲贴） |

