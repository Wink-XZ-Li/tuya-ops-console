# 用户详情页（全屋用户管理 · 运维只读）

## 范围

- 做：`GET /v1.0/users/{uid}/infos`、`/devices`、`/homes`
- 不做：预删除/取消删除、同步账号、授权登录

## 行为摘要

- 进页：先读本地 `EndUser` + 本地绑定；再拉 `GET /api/end-users/:uid/cloud-snapshot`
- 云端设备默认按 `TUYA_PRODUCT_IDS` 过滤，可开「显示全部」
- `local_key` 后端剥离；不自动改 `DeviceBinding`
- 未入库白名单设备：operator/admin「同步入库」→ `POST /api/sync/reconcile-device`
- `EndUser` 升列：nickName / countryCode / timeZoneId / tempUnit / avatar / cloudCreatedAt / cloudUpdatedAt
