# Runner and Proxy API Reference

> 部署后的 API，部署在每台已配置服务器上的 runner 代理调用这些端点来声明任务、确认结果、同步配置和代理 AI 请求。所有运行器端点使用部署代理令牌（`Authorization: Bearer <token>`）进行认证。预设代理端点使用预设代理令牌和可选的 IP 检查。

---

## 认证

每个端点使用两种令牌方案之一：

| 方案 | 头部 | 用途 |
|---|---|---|
| 部署代理令牌 | `Authorization: Bearer <token>` | 所有 `/runner/*` 端点。通过 `verifyDeployAgentAccess(sid, auth)` 进行验证，该函数使用 HMAC-SHA256 比对令牌与 `installSessions.deployAgentTokenHash` 中的存储哈希。 |
| 预设代理令牌 | `Authorization: Bearer <token>` | `/preset-proxy/v1/*`。通过 `verifyPresetProxyToken(token, sid)` 进行验证，该函数使用 `PRESET_PROXY_TOKEN_SECRET` 进行 HMAC 签名。 |

所有运行器端点还会通过 `logRunnerApiEvent` 记录结构化 API 事件，便于审计。

---

## 任务生命周期

### `POST /api/deploy/[sid]/runner/jobs/claim`

运行器每 30 分钟轮询一次以声明下一个待处理任务。在声明新任务之前，清除过时的运行中任务。

**请求体：** 无（或为空）。

**响应 `200 OK`（任务可用）：**

```json
{
  "job": {
    "id": "job-uuid",
    "type": "openclaw_upgrade",
    "payload": {
      "service_name": "clawsimple",
      "version": "1.3.0",
      "runner_version": "2.5.0"
    },
    "created_at": "2026-06-24T00:00:00.000Z"
  },
  "next_claim_after_ms": 0
}
```

**响应 `200 OK`（无任务）：**

```json
{
  "job": null,
  "next_claim_after_ms": 1800000
}
```

**行为说明：** 当无任务可用时，`next_claim_after_ms` 为 30 分钟。当声明了一个任务时，为 0 毫秒（处理完后立即轮询）。声明使用原子 SQL `FOR UPDATE SKIP LOCKED` 来防止重复声明。过时任务清理将运行中任务标记为 `failed`，如果它们超过了按任务类型的超时时间（对于 `openclaw_upgrade` 和 `hermes_upgrade` 为 15 分钟，其他类型为 60 分钟）。

---

### `POST /api/deploy/[sid]/runner/jobs/[jobId]/ack`

运行器报告任务状态并提交结果。**大约 700 行。** 每种任务类型在成功时都有不同的副作用。

**请求体：**

```json
{
  "status": "succeeded",
  "error_message": "",
  "result": {
    "openclaw_version": "1.3.0",
    "requested_version": "1.3.0",
    "strategy": "direct"
  }
}
```

| 字段 | 类型 | 约束 |
|---|---|---|
| `status` | string | 必需。`"running"`、`"succeeded"` 或 `"failed"` |
| `error_message` | string | 启动时可选；失败时使用（截断至 1000 字符） |
| `result` | object | 成功时可选。各个任务类型的字段含义不同。 |

**任务类型与副作用：**

| 任务类型 | 成功时 (`succeeded`) | 失败时 (`failed`) |
|---|---|---|
| `runner_refresh` | 将 `runner_revision`、`runner_label`、`runner_version` 写入服务器指纹 | 无特殊清理 |
| `openclaw_upgrade` | 将 `openclaw_version`、`openclaw_requested_version`、`openclaw_upgrade_strategy`、`openclaw_last_upgraded_at` 写入服务器指纹 | 将 `openclaw_release_blocked_version` 写入指纹 |
| `hermes_upgrade` | 将 `hermes_agent_version`、`hermes_agent_installed: true` 写入指纹 | 无特殊清理 |
| `install_app` | 如果提供了 `install_sid`，则调用 `resolveTelegramDisplayNameFromToken` 来解析 Telegram 个人资料信息。更新 `telegramUsername`。 | 通过 `releaseTelegramBotTokenAssignments({sid})` 释放任何被占用的 Telegram 令牌 |
| `add_agent` | 在 `deploymentAgents` 表中创建包含 `agent_id`、`displayName`、`telegramUsername` 等的代理行。触发 `mergeAgentRuntimeUpdate`。 | 释放代理的 Telegram 令牌赋值 |
| `remove_agent` | 触发 `mergeAgentRuntimeUpdate`，将 `removed` 标志设为 true。将 `deploymentAgents.active` 设回 `true`（支持重新添加）。 | 无特殊清理 |
| `backup_export` | 更新 `deploymentBackups` 状态为 `ready`，将 `completedAt` 和时间戳存入 `backup_runtime`。解密并重新加密备份密码（重新生成包装）。 | 更新备份状态为 `failed` |
| `backup_restore` | 更新备份状态为 `restored`。 | 更新备份状态为 `restore_failed` |
| 其他 | 仅更新任务状态 | 仅更新任务状态 |

**状态转换：**
- `running`：设置 `startedAt` 并将任务标记为 `running`。同时递增唤醒版本。
- `succeeded`：设置 `completedAt`、`status = "succeeded"`。触发特定任务类型的副作用（见上表）。
- `failed`：设置 `errorMessage`（截断）、`completedAt`、`status = "failed"`。触发特定任务类型的清理。递增唤醒版本。

**响应 `200 OK`：**
```json
{ "ok": true }
```

---

## 认证与脚本

### `GET /api/deploy/[sid]/runner/auth/verify`

运行器用于验证其部署代理令牌仍然有效的健康检查端点。

**无请求体。** 无查询参数。

**响应 `200 OK`：**
```json
{ "ok": true, "sid": "d_abc123" }
```

**响应 `401`：**
```json
{ "ok": false, "error": "unauthorized" }
```

---

### `GET /api/deploy/[sid]/runner/script`

返回运行时脚本（`agent-jobs-runner.mjs`），包含版本和修订版元数据。运行器在启动时下拉此内容。

**响应 `200 OK`：**

```json
{
  "runner_revision": "abc123def4567890",
  "runner_label": "2.5.0",
  "runner_version": "2.5.0",
  "script": "#!/usr/bin/env node\n..."
}
```

版本从脚本源中的 `const RUNNER_VERSION = "..."` 解析。修订版为脚本源 SHA-256 的前 16 个十六进制字符。

---

### `POST /api/deploy/[sid]/runner/token/rotate`

生成新的部署代理令牌，更新存储的哈希，并使现有会话（递增唤醒版本）失效。

**请求体：** 无。

**响应 `200 OK`：**

```json
{
  "ok": true,
  "sid": "d_abc123",
  "deploy_agent_token": "base64url-encoded-24-byte-random-token",
  "rotated_at": "2026-06-24T00:00:00.000Z"
}
```

**安全说明：** 此调用后，先前的令牌立即失效。运行器必须存储新令牌，否则下一次 claim/ack 将返回 401。

---

## 配置同步

### `POST /api/deploy/[sid]/runner/config/sync`

运行器将配置值同步回控制平面。运行器端配置（Mailgun API 密钥、预设代理设置）会在此处持久化。敏感值（Mailgun API 密钥）使用 `DEPLOY_SESSION_SECRET_KEY` 进行 AES-256-GCM 加密。

**请求体（所有字段可选；缺失 vs null vs 空字符串的行为不同）：**

```json
{
  "mailgun_api_key": "<MAILGUN_API_KEY>",
  "mailgun_backup_email": "user@example.com",
  "mailgun_inbox_address": "inbox@example.com",
  "mailgun_domain": "mail.example.com",
  "mailgun_agent_id": "agent-1",
  "mailgun_telegram_target": "123456789",
  "preset_proxy_base_url": "https://api.openai.com/v1",
  "preset_proxy_model": "gpt-4o",
  "preset_proxy_models": "gpt-4o,gpt-4o-mini",
  "preset_proxy_api_key": "<OPENAI_API_KEY>"
}
```

| 字段 | 行为 |
|---|---|
| 字段缺失（`undefined`） | 无变化 |
| `null` | 清除存储的值 |
| 空字符串（`""`） | 清除存储的值 |
| 非空字符串 | 更新存储的值 |

**加密：** `mailgun_api_key` 使用 `sealSessionSecret()`（AES-256-GCM，以 `v1:iv:tag:ct` 格式存储）进行密封。如果密封失败（密钥配置错误），返回 500。

**proxy_api_key 说明：** 预设代理 API 密钥是临时的——不持久化到数据库。仅存在于部署机器上。控制平面可以通过 `generatePresetProxyToken(sid)` 按需重新生成。

**响应 `200 OK`：**

```json
{ "ok": true, "updated": true }
```

如果没有字段导致改变：

```json
{ "ok": true, "updated": false }
```

---

### `POST /api/deploy/[sid]/runner/telegram/sync`

运行器将 Telegram 代理个人资料信息同步回控制平面。填充 `deploymentAgents` 表，包含每个代理的显示名称、用户名和账户 ID。

**请求体：**

```json
{
  "profiles": [
    {
      "account_id": "main",
      "agent_id": "main",
      "first_name": "MyBot",
      "username": "@my_bot"
    },
    {
      "account_id": "agent-2",
      "agent_id": "agent-2",
      "first_name": "SupportBot",
      "username": "support_bot"
    }
  ]
}
```

| 字段 | 类型 | 描述 |
|---|---|---|
| `profiles` | array | 必需（非空数组）。每个条目更新或插入一个 `deploymentAgent` 行。 |
| `profiles[].agent_id` | string | 必需。"main" 用于主部署代理；其他值为附加代理。 |
| `profiles[].account_id` | string | 代理的账户标识符 |
| `profiles[].first_name` | string | 代理的显示名称 |
| `profiles[].username` | string | Telegram 用户名（去除 `@` 前缀） |

**行为说明：**
- `agent_id === "main"`：更新 `installSessions.telegramUsername` 并作为主代理更新/插入 `deploymentAgents`。将 `isPrimary` 设为 `true`。
- 其他代理 ID：更新/插入 `deploymentAgents`，`isPrimary = false`。
- 两者均使用 `ON CONFLICT DO UPDATE`（针对 `sid, agentId`）。更新仅适用于 `active = true` 的代理。

**响应 `200 OK`：**

```json
{ "ok": true, "updated": 2 }
```

---

## 密钥

### `GET /api/deploy/[sid]/runner/jobs/[jobId]/secret`

获取与任务关联的一次性加密密钥（例如，备份密码）。**一次性读取**——密钥在返回后被删除，以最小化暴露。

**响应 `200 OK`：**

```json
{
  "kind": "backup_password",
  "value": "decrypted-secret-value"
}
```

| 字段 | 类型 | 描述 |
|---|---|---|
| `kind` | string | 密钥类型（例如，`"backup_password"`） |
| `value` | string | 解密后的明文密钥 |

**错误：**

| 状态码 | 错误 | 含义 |
|---|---|---|
| 404 | `secret_not_found` | 此 jobId 不存在密钥（或已被读取） |
| 500 | `secret_decrypt_failed` | 解密失败——密钥配置错误或密文损坏 |

---

## 技能（官方）

### `GET /api/deploy/[sid]/runner/official-skills/manifest`

返回带签名的官方技能清单。运行器用它来验证和安装官方技能。

**响应 `200 OK`：**

```json
{
  "manifest": {
    "skills": [...],
    "signature": "..."
  }
}
```

清单的签名和格式由 `getSignedOfficialSkillsManifest()` 处理。

---

## 预设代理（AI 模型代理）

### `ANY /api/deploy/preset-proxy/v1/[...path]`

**约 950 行。** 代理 AI 模型请求从已部署的代理到上游 AI 提供商。这是 ClawSimple 的核心基础设施——所有托管式 AI 流量都通过此端点。需要预设代理令牌（bearer）和可选的 IP 检查。

**方法：** GET、POST、OPTIONS。POST 是 chat/completions 的标准方法。

**路径：** 任何路径段。`preset-proxy/v1/chat/completions` 是规范路径。

**认证层：**
1. **预设代理令牌**（必需）——从 `Authorization: Bearer` 头部提取，然后使用 `verifyPresetProxyToken(token, sid)` 进行验证。用 401 拒绝无效令牌。
2. **发送 IP 验证**（如果 `SENDER_IP_HEADER` 已配置）——将发件人的 IP 与 `installSessions.senderIp` 中的存储 IP 进行比较。用 403 拒绝不匹配的 IP。
3. **基于路径的 SID 解析**——从 `x-clawsimple-sid` 头部或请求体中提取 SID。

**上游重写：**
- 从 `DEPLOY_PRESET_BASE_URL` 读取基础 URL
- 提示词中的 `provider/model` 格式被规范化和排序（`economy` 提供者排在前面以降低成本）
- 如果无法解析模型定价，则回退模型（`PRESET_FALLBACK_MODEL` 环境变量）
- 如果配置了，则注入前缀匹配（`PRESET_PREFIX_MATCH_ENABLED` 环境变量）

**使用量计量和计费：**
- 每请求令牌成本：`prompt_tokens * unit_price_usd + completion_tokens * unit_price_usd`
- 每请求成本：从环境变量（`MANAGED_EXA_REQUEST_PRICE_USD`，`MANAGED_SEARCH_CRAWL_REQUEST_PRICE_USD`）读取
- 每日汇总写入 `deployPresetUsageSeatDaily` 表
- 如果超出月度上限 → 额外费用从 `usageCreditBalance` 中消耗
- 如果积分不足 → 返回 **402 Payment Required**

**环境变量：**

| 变量 | 默认值 | 描述 |
|---|---|---|
| `DEPLOY_PRESET_BASE_URL` | — | 必需。上游 AI API 基础 URL。 |
| `DEPLOY_PRESET_API_KEY` | — | 必需。上游 AI API 的 API 密钥。 |
| `PRESET_PROXY_TOKEN_SECRET` | — | 必需。代理令牌签名的 HMAC 密钥。 |
| `SENDER_IP_HEADER` | — | 如果设置，用于拉取发送方 IP 的头部名称（例如，`cf-connecting-ip`）。 |
| `PRESET_FALLBACK_MODEL` | — | 如果为 null，则使用价格解析的回退模型。 |
| `PRESET_CAP_DIAGNOSTICS` | — | 设为 `"1"` 以启用上限诊断日志记录。 |
| `PRESET_CAP_FAIL_OPEN` | — | 设为 `"1"` 以在上限检查失败时允许请求通过（不拒绝）。 |
| `COST_CAP_USD` / `COST_CAP_MAX_USD` | — | 每种方案的月度信用上限（分别用于 standard 和 max）。 |
| `MANAGED_EXA_REQUEST_PRICE_USD` | `0.01` | 每次 Exa 搜索请求的价格。 |
| `MANAGED_SEARCH_CRAWL_REQUEST_PRICE_USD` | `0.02` | 每次搜索爬取请求的价格。 |

**响应（正常）：** 上游响应按原样流式传输。应用了逐跳头部过滤。`x-request-id` 被注入，以用于跟踪。

**响应 `402`（超出上限 + 无积分）：**

```json
{
  "error": {
    "message": "Credit cap exceeded",
    "type": "insufficient_credits",
    "code": "insufficient_credits"
  }
}
```

**响应 `403`（IP 不匹配）：**

```json
{ "error": "ip_check_failed" }
```

---

## 传统技能端点

以下端点保留了与传统技能运行器后端的兼容性。除了路径中的 `/skills/` 前缀外，它们在功能上与其 `/runner/` 对应端点相同：

- `GET /api/deploy/[sid]/skills/auth/verify`
- `POST /api/deploy/[sid]/skills/config/sync`
- `POST /api/deploy/[sid]/skills/jobs/claim`
- `POST /api/deploy/[sid]/skills/jobs/[jobId]/ack`
- `GET /api/deploy/[sid]/skills/jobs/[jobId]/secret`
- `GET /api/deploy/[sid]/skills/official/manifest`
- `GET /api/deploy/[sid]/skills/runner-script`
- `POST /api/deploy/[sid]/skills/telegram/sync`
- `POST /api/deploy/[sid]/skills/token/rotate`
- `GET /api/deploy/[sid]/skills`（根端点，返回 `{status: "ok"}`）

**注意：** 新的 runner 应使用 `/runner/` 端点。这些是兼容性层，可能在未来被移除。

---

## 相关文档

- [部署生命周期 API 参考](deploy-api-lifecycle.md) — 用户端部署端点
- [Runner 通知通道计划](../architecture/runner-notify-channel-plan.md) — push-vs-poll 架构
- [部署代理令牌哈希说明](../architecture/deploy-agent-token-hash-explained.md) — 令牌设计原理
