# 阶段 D · 容量证据（不宣称稳态 3000）

阶段 D 把生产剖面、同步限流和资料单源收干净。容量结论只写已经跑过的范围。

## 不能写的话

对外材料、README、交接说明里都不要写「已支持 3000」或「已通过 3000 台 30 分钟稳态」。下面没有这项试验。

## 这次新跑的

在实现阶段 D 的环境里跑的是单元测试和两个静态检查，不连涂鸦云，不灌 30 分钟流量：

```bash
pnpm --filter @tuya-ops/api test
pnpm --filter @tuya-ops/bridge test
pnpm --filter @tuya-ops/web test
node scripts/check-fault-meanings-source.mjs
node scripts/check-demo-isolation.mjs
```

这些测试证明的是：生产剖面拒绝 mock 客户端、演示分析不会在 live 失败时顶上、同步页大小和页间停顿按配置走、地理编码失败仍写入设备、故障释义从根目录 JSON 读取、生产模块不再内嵌 `uid-demo-` 清洗。

2026-11-04 在本环境跑过一次（无涂鸦凭据、无 30 分钟灌流）：

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @tuya-ops/api exec jest --no-coverage` | 40 suites，207 tests，通过 |
| `pnpm --filter @tuya-ops/bridge exec jest --no-coverage` | 3 suites，8 tests，通过 |
| `pnpm --filter @tuya-ops/web test` | 22 files，50 tests，通过 |
| `node scripts/check-fault-meanings-source.mjs` | 通过（25 条 symptom 指纹，没有第三份全文） |
| `node scripts/check-demo-isolation.mjs` | 通过 |
| `tsc --noEmit`（api / web / bridge） | 通过 |

这只说明关键路径单测和两个静态检查是绿的，不是容量试验。

## 仓库里已经有、但不是 30 分钟稳态的记录

| 记录 | 实际跑了什么 | 没有跑什么 |
| --- | --- | --- |
| `docs/runbooks/phase-b-ingest.md` 与 `ingest-load-result.json` | 2026-11-04，本机 MySQL + Redpanda，**50 条/秒 × 约 120 秒**，6000 条全部入库，P95 17ms，结束 lag 0。topic 为自动创建的 **1** 个分区 | 不是 3000 台设备持续上报，不是 30 分钟，没有把分区扩到 12 |
| `docs/runbooks/phase-c-query.md` 与 `phase-c-query-result.json` | 本机 MySQL 写入 3000 台 `qload-*` 设备、近 7 天每天一条事件、一台更密的设备，然后计时。列表 + 故障看板 SQL 29ms，7 天详情 52ms，一批 `DELETE ... LIMIT 1000` 38ms。跑完已删 `qload-*` | 不是消息链路稳态，不是 90 天明细，不是生产库 P95 |

重跑方式仍是那两份 runbook 里的 `pnpm ingest:load` 与 `pnpm query:load`。

## 规划规格（假设，不是测量）

与 IT 说明对齐、供容量对话使用，不作为验收通过的证据：

- 在管设备目标约 3000（热水器 / 壁挂炉）
- 明细保留约 90 天（`RETENTION_DAYS`）
- 上报约 0.2～1 条/台/分钟
- 部署默认：2C4G + 托管 MySQL
- 按 0.2 条/台/分钟估算 90 天约 7780 万行事件；按 1 条/台/分钟约 3.89 亿行。热表默认只留 14 天

同步停顿的下限也可以心算：页大小 20、停顿 200ms 时，3000 台大约 150 页，仅翻页停顿约 30 秒，还不包含每台的状态和地理编码请求。这不是压测结果。

## 以后补上 30 分钟证据时要记下的内容

1. 设备数、消息速率、持续时间、分区数、API 副本数（带 job 的只能有一个）。
2. `DeviceEvent.createdAt - eventTime` 的 P95 / P99。
3. `/api/system-health` 的 lag 采样，以及是否低于黄线 100。
4. 列表 / 故障看板 / 详情的反代 P95。
5. 磁盘增量。

四项都有记录之前，材料里仍只写「目标规格」和「某次试验的实测范围」。
