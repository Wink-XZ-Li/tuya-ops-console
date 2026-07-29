# App 用户全量同步（独立入口）

## 目标

通过涂鸦 `GET /v1.0/apps/{schema}/users` 全量拉取 App 用户，upsert 本地 `EndUser`。与设备「触发同步」解耦。

（联调：本云项目对 `/v2.1/apps/.../users` 返回 `1108 uri path invalid`；`/v1.0` 可分页拿到全量。）

## 行为

- `POST /api/sync/reconcile-users`（admin）
- 环境变量 `TUYA_APP_SCHEMA` 未配置时返回明确错误
- 翻页：`page_no` + `page_size` 直到 `has_more=false`
- upsert：`tuyaUid` / `username` / `mobile` / `email` / `raw` / `syncedAt`；不覆盖 `remark`
- 不删除本地已有用户；不改设备绑定

## UI

用户页「同步用户」按钮；设备页逻辑不变。
