# Deploy Lifecycle API Reference

> 面向用户的端点，用于部署创建、轮询、修改和拆除。所有写入端点均要求通过会话认证。所有权通过匹配 `userId` 与 `installSessions.userId` 进行强制执行。

## 认证

所有端点均使用 better-auth 会话 cookie：

```
Cookie: better-auth.session_token=<token>
```

例外情况：
- `/api/deploy/[sid]/complete` 使用 HMAC 完成令牌（由服务器调用，而非用户）
- `/api/deploy/availability` 和 `/api/deploy/preset-options` 为公开端点

---

## 部署创建

### `POST /api/deploy`

主部署端点。编排整个部署流程：Stripe 座席管理、Hetzner 服务器配置、cloud-init 注入、代理令牌生成、Telegram 令牌冲突检测。约 750 行。

**请求体：**

```json
{
  "tg_token": "<TELEGRAM_BOT_TOKEN>",
  "tg_allow": "user1,user2",
  "model_preset": "anthropic/claude-sonnet-4-6",
  "seat_plan": "seat-standard",
  "locale": "en",
  "server_name": "My Bot",
  "channel": "deploy",
  "promo_code": "LAUNCH20",
  "billing_interval": "month",
  "subscription_item_id": "si_abc123",
  "seat_id": "d_abc123",
  "source_sid": "d_xyz789",
  "target_runtime": "hermes"
}
```

| 字段 | 类型 | 必需 | 约束 |
|---|---|---|---|
| `tg_token` | string | 是 | Telegram 机器人令牌。如果之前已使用，则会被拒绝。 |
| `tg_allow` | string | — | Telegram 用户 ID，逗号/换行符分隔。至少需要 1 个数字 ID。 |
| `model_preset` | string | — | 被忽略（保留字段）。所有 AI 均为托管式。 |
| `seat_plan` | string | — | `"seat-standard"`（默认）或 `"seat-max"` |
| `locale` | string | — | BCP-47 标签（`en`、`zh-Hans`、`zh-Hant`、`ja`） |
| `server_name` | string | — | 用户可见的显示名称。以移除特殊字符的方式进行净化处理。 |
| `channel` | string | — | 来源渠道（默认：`"deploy"`） |
| `promo_code` | string | — | Stripe 促销代码。如果无效，则会静默忽略。 |
| `billing_interval` | string | — | `"month"`（默认）或 `"year"` |
| `subscription_item_id` | string | — | 在同一订阅下重新部署：复用现有的 Stripe 订阅项。 |
| `seat_id` | string | — | 在同一订阅下重新部署：复用现有的 installSessions 座席 ID。 |
| `source_sid` | string | — | 重新部署：此部署基于的原始 SID。 |
| `target_runtime` | string | — | `"hermes"` 或 `"openclaw"`。如果省略，则默认为 Hermes。 |

**环境变量：**

| 变量 | 默认值 | 描述 |
|---|---|---|
| `HCLOUD_SERVER_TYPE` | `cx23` | Hetzner 服务器类型 |
| `HCLOUD_LOCATION` | `nbg1` | Hetzner 数据中心 |
| `HCLOUD_IMAGE` | `ubuntu-24.04` | 服务器操作系统镜像 |
| `HCLOUD_SERVER_PREFIX` | `clawsimple` | 服务器名称前缀 |
| `HETZNER_LIMIT` | `0`（无限制） | 最大部署数 |
| `DEPLOY_OPENCLAW_VERSION` | — | 特定 OpenClaw 版本。如果未设置，则 runner 自行解析。 |
| `DEPLOY_OPENCLAW_SUDO_MODE` | — | OpenClaw 的 sudo 模式（`"nopasswd"` 或 `"all"`） |
| `DEPLOY_ALLOWED_ORIGINS` | — | 允许的来源，逗号分隔。如果设置，则对非匹配的 `Origin` header 强制执行 403。 |
| `DEPLOY_HETZNER_SERVER_TYPES` | `cx23,cpx22,cpx21,cpx32` | 全局服务器类型。可被按计划的环境变量覆盖。 |
| `DEPLOY_HETZNER_LOCATIONS` | `nbg1,hel1` | 全局位置。可被按计划的环境变量覆盖。 |
| `DEPLOY_CLAWSIMPLE_RESTART_POLICY` | `always` | systemd 重启策略 |
| `RUNNER_NOTIFY_URL` | `https://runner-notify.example.com` | 通知 WebSocket Worker URL |

**按计划的环境变量：**
- `DEPLOY_HETZNER_SERVER_TYPES_STANDARD` / `DEPLOY_HETZNER_SERVER_TYPES_MAX` — 覆盖每种座席计划的服务器类型
- `DEPLOY_HETZNER_LOCATIONS_STANDARD` / `DEPLOY_HETZNER_LOCATIONS_MAX` — 覆盖每种座席计划的位置

**流程：**

1. 验证会话和可选的来源白名单
2. 验证座席计划（必须是 `seat-standard` 或 `seat-max`）
3. 验证运行环境（`hermes` 或 `openclaw`）
4. 如果提供了 `subscription_item_id`：重新部署流程（复用 Stripe 项）
5. 否则：创建 Stripe customer → 如果有促销代码则验证 → 调用 `addSeatToSubscription`（创建或增加数量）
6. 检查 Hetzner 容量（通过带有 `pg_try_advisory_lock` 的 `acquireCapacityLock`）
7. 构建 cloud-init（安装脚本 + SSH 状态检查器公钥）
8. 创建 Hetzner 服务器（尝试服务器类型，如果不可用则故障转移到位置）
9. 生成代理令牌（部署代理、预设代理、完成、安装事件）
10. 令牌的哈希存储（`v1:hmac-sha256` 格式）
11. Telegram 令牌冲突检测和预留
12. 创建带有预生成 SID 的 installSessions 行
13. 释放容量锁
14. 返回 `sid`、服务器 IP、座席操作、付款状态

**响应 `200 OK`（新部署）：**

```json
{
  "sid": "d_abc123",
  "status": "started",
  "ai_source": "managed",
  "server": {
    "id": 12345678,
    "name": "clawsimple-d-abc123",
    "ipv4": "203.0.113.10",
    "server_type": "cx23",
    "location": "nbg1",
    "image": "ubuntu-24.04"
  },
  "seat_action": "created",
  "payment_status": "pending",
  "seat_status": "pending",
  "seat_plan": "seat-standard",
  "grace_until": "2026-06-24T01:00:00.000Z",
  "billing_interval": "month"
}
```

**响应 `200 OK`（重新部署）：**

除了上述内容外，额外包含：`reusing_subscription: true`、`reusing_seat_id: "d_xyz789"`。

**错误代码：**

| 状态码 | 错误 | 含义 |
|---|---|---|
| 400 | `custom_ai_provider_not_supported` | 座席计划不是 standard 或 max |
| 400 | `E_TELEGRAM_TOKEN_CONFLICT` | 令牌已被另一个部署使用 |
| 400 | `E_HCLOUD` | Hetzner API 错误（`token_conflict`、`no_server_type_available`、`no_location_available`、`no_ssh_keys`） |
| 400 | `E_NO_CAPACITY` | 已达到 Hetzner 限制 |
| 400 | `tg_token_is_required` | 缺少或为空的 tg_token |
| 400 | `tg_allow_must_contain_at_least_one_numeric_user_id` | 允许列表中没有数字 ID |
| 400 | `E_INVALID_RUNTIME` | target_runtime 既不是 "hermes" 也不是 "openclaw" |
| 400 | `source_sid_not_found` | source_sid 引用了不存在的部署 |
| 402 | `payment_required` | 在限期重新部署前需要付款方式 |
| 403 | `origin not allowed` | Origin header 与 `DEPLOY_ALLOWED_ORIGINS` 不匹配 |
| 409 | `E_NOT_UNIQUE_SEAT` | 座席 ID 已在不同的订阅项下使用 |

---

## 部署轮询与管理

### `GET /api/deploy/[sid]`

轮询部署状态。拥有权经过验证（`userId` 必须匹配）。

**如果状态为 `"started"` 且自创建以来已超过 3 分钟：** 尝试通过 SSH 强制命令（`status-check`）进行带外 SSH 状态检查，以检测云初始化可能漏掉事件的 completed/failed 部署。

**响应 `200 OK`：**

```json
{
  "sid": "d_abc123",
  "status": "started",
  "ai_source": "managed",
  "display_name": "My Bot",
  "seat_status": "pending",
  "seat_plan": "seat-standard",
  "seat_remove_at": null,
  "grace_until": "2026-06-24T01:00:00.000Z",
  "created_at": "2026-06-24T00:00:00.000Z",
  "completed_at": null,
  "error_code": null,
  "channel": "deploy",
  "telegram_username": "@my_bot",
  "server": { "server_ipv4": "203.0.113.10", "openclaw_version": "1.2.5" },
  "runner_script_version": "2.5.0",
  "runner_script_revision": "abc123def4567890",
  "upgrade_jobs": [],
  "active_job": null,
  "agents": []
}
```

**状态值：** `started`、`installing`、`completed`、`failed`、`terminated`。

---

### `PATCH /api/deploy/[sid]`

更新部署的显示名称。所有其他字段均为只读。

**请求体：**

```json
{ "display_name": "新机器人名称" }
```

**响应：** 包含更新后字段的完整部署对象（与 GET 相同）。

---

### `DELETE /api/deploy/[sid]`

终止部署。删除 Hetzner 服务器、释放 Telegram 令牌、将部署标记为 `terminated`。**保留 Stripe 座席**（座席通过 `/remove` 单独管理）。

**响应 `200 OK`：**

```json
{
  "ok": true,
  "removed_at": "2026-06-24T12:00:00.000Z",
  "server_deleted": true,
  "seat_retained": true
}
```

---

### `POST /api/deploy/[sid]/remove`

安排在计费周期结束时移除座席。这会更新 Stripe 订阅计划，以在 `current_period_end` 时减少座席数量。

**无请求体。**

**响应 `200 OK`：**

```json
{
  "ok": true,
  "seat_remove_at": "2026-07-24T00:00:00.000Z"
}
```

**错误：**

| 状态码 | 错误 | 含义 |
|---|---|---|
| 400 | `subscription not linked` | 部署没有 Stripe 订阅 |
| 500 | `schedule_removal_failed` | Stripe API 错误 |

**行为说明：** 通过 Stripe 的 `subscription_schedule` API 进行编排。如果座席移除在计费周期内被取消（DELETE 此端点），则该计划会被移除。

---

### `DELETE /api/deploy/[sid]/remove`

如有待处理的座席移除，则取消。移除 Stripe 订阅计划。

**响应 `200 OK`：**

```json
{ "ok": true }
```

---

### `POST /api/deploy/[sid]/upgrade`

更改座席计划（`seat-standard` ↔ `seat-max`）。通过 Stripe 的订阅计划安排在计费周期结束时生效。

**请求体：**

```json
{ "target_seat_plan": "seat-max" }
```

| 字段 | 类型 | 必需 | 约束 |
|---|---|---|---|
| `target_seat_plan` | string | 是 | `"seat-standard"` 或 `"seat-max"` |

**响应 `200 OK`：**

```json
{
  "ok": true,
  "sid": "d_abc123",
  "seat_plan": "seat-standard",
  "pending_seat_plan": "seat-max",
  "pending_effective_at": "2026-07-24T00:00:00.000Z",
  "billing_interval": "month"
}
```

**错误：**

| 状态码 | 错误 | 含义 |
|---|---|---|
| 400 | `target_seat_plan must be seat-standard or seat-max` | 无效的计划 |
| 409 | `only completed seats can change plan` | 部署未完成 |
| 409 | `seat is pending removal or removed` | 座席状态阻止计划更改 |
| 400 | `subscription not linked` | 没有 Stripe 订阅 |

**验证：**
- 部署必须为 `status: "completed"`
- `seatStatus` 不能是 `pending_remove` 或 `removed`
- 目标计划必须与当前计划不同
- 同一订阅下的同级座席必须具有匹配的计费间隔（月和年不能混用）

---

### `GET /api/deploy/[sid]/redeploy-check`

检查部署是否仍可重新部署（在过去 30 天内未重新部署超过 `REDEPLOY_LIMIT` 次）。

**查询参数：** 无。

**响应 `200 OK`：**

```json
{
  "redeploy_limit": 10,
  "redeploy_window_days": 30,
  "redeploy_count": 2,
  "can_redeploy": true
}
```

**环境变量：** `REDEPLOY_LIMIT`（默认：10），`REDEPLOY_WINDOW_DAYS`（默认：30）。

---

### `POST /api/deploy/[sid]/complete`

Webhook 端点。由已部署的服务器在 cloud-init 完成后调用。**通过 HMAC 令牌进行认证，而非会话。**

**请求体：**

```json
{ "token": "<completion-token>" }
```

**认证：** HMAC-SHA256 令牌，具有 24 小时有效期窗口。使用 `COMPLETION_TOKEN_SECRET` 进行签名。

**响应 `200 OK`：**

```json
{ "ok": true, "completed_at": "2026-06-24T00:05:00.000Z" }
```

**幂等性：** 如果已经是 `completed`，则返回 200 且无变化。如果已经是 `failed` 或 `terminated`，则返回 409。

**错误：**

| 状态码 | 错误 | 含义 |
|---|---|---|
| 400 | `token is required` / `invalid json` | 正文格式不正确 |
| 401 | `invalid token` | HMAC 验证失败 |
| 500 | `server misconfigured` | 未设置 `COMPLETION_TOKEN_SECRET` |

---

## 列表与发现

### `GET /api/deploy/list`

列出当前用户的所有非终止部署，按创建日期降序排列。

**响应 `200 OK`：**

```json
{
  "deployments": [
    {
      "sid": "d_abc123",
      "seat_id": "d_abc123",
      "status": "completed",
      "ai_source": "managed",
      "display_name": "My Bot",
      "seat_status": "active",
      "grace_until": null,
      "seat_remove_at": null,
      "created_at": "2026-06-24T00:00:00.000Z",
      "completed_at": "2026-06-24T00:05:00.000Z",
      "error_code": null,
      "telegram_username": "@my_bot",
      "server": { "server_ipv4": "203.0.113.10" }
    }
  ]
}
```

---

### `GET /api/deploy/latest`

返回最近 1 小时内的最新自动化部署（`channel = "deploy"`）。

**响应 `200 OK`：**

```json
{
  "sid": "d_abc123",
  "status": "completed",
  "display_name": "My Bot",
  "telegram_username": "@my_bot",
  "server": { "server_ipv4": "203.0.113.10" }
}
```

如果一小时窗口内没有部署：

```json
{
  "sid": null,
  "status": "idle"
}
```

---

### `GET /api/deploy/availability`

**公开。** 返回 Hetzner 容量状态。

**响应 `200 OK`：**

```json
{
  "hetzner_limit": 50,
  "hetzner_used": 42,
  "hetzner_available": 8,
  "can_deploy": true
}
```

**环境变量：** `HETZNER_LIMIT`（默认：0 = 无限制）。

---

### `GET /api/deploy/preset-options`

**公开。** 返回活跃的预设 AI 模型，以及 seat-standard 计划的已解析定价。用于在部署表单中填充模型选择器。

**响应 `200 OK`：**

```json
{
  "models": [
    {
      "id": "uuid",
      "model_id": "anthropic/claude-sonnet-4-6",
      "display_name": "Claude Sonnet 4.6",
      "provider": "Anthropic",
      "tier": "premium",
      "is_default": true,
      "sort_order": 0,
      "unit_price_usd": 0.015
    }
  ]
}
```

价格无法解析的模型将被过滤掉。

---

## 相关文档

- [运行器和代理 API 参考](deploy-api-runner.md) — 运行器任务声明、确认、代理
- [计费 API 参考](billing-api.md) — Stripe checkout、门户、使用量积分
