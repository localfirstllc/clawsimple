# Billing API Reference

> Stripe 集成的 checkout、订阅管理和使用量积分端点。座席订阅和一次性积分购买均使用 Stripe Checkout Sessions。所有写入端点均要求通过会话认证。

## 认证

除 `/validate-promo` 和 cron-secured 座席生命周期端点外，所有端点均使用 better-auth 会话。

Cron 端点使用 header 密钥：
```
x-cron-secret: <CRON_SECRET>
```

---

## 订阅

### `POST /api/billing/checkout`

为首次订阅者创建 Stripe Checkout Session。付款后，用户被重定向回带有 `action=complete-deploy` 的应用，以便前端自动触发部署。

**请求体：**

```json
{
  "seat_plan": "seat-standard",
  "locale": "en",
  "promo_code": "LAUNCH20",
  "billing_interval": "month",
  "return_path": "/deploy",
  "return_action": "complete-deploy",
  "attribution": { "utm_source": "twitter", "utm_medium": "social" }
}
```

| 字段 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `seat_plan` | string | `"seat-standard"` | 已解析为 `"seat-standard"` 或 `"seat-max"` |
| `locale` | string | — | 用于重定向 URL 的 BCP-47 标签 |
| `promo_code` | string | — | Stripe 促销代码。如果无效，则静默忽略。 |
| `billing_interval` | string | `"month"` | `"month"` 或 `"year"` |
| `return_path` | string | — | 付款后的应用内路径（附加到 `success_url`） |
| `return_action` | string | — | 附加到 `success_url` 的操作参数 |
| `attribution` | object | — | 用于分析的 UTM/来源归因元数据 |

**响应 `200 OK`：**

```json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_abc123"
}
```

**行为说明：**
- 确保 Stripe customer（如果不存在则创建）
- 验证促销代码（如果提供，包括活跃、货币和适用限制）
- 按数量 1 创建 Stripe Checkout Session，使用 `seatPlan` + `billingInterval` 的 Price ID
- 如果 Stripe 不支持，则回退到 `billing_interval = "month"`
- 在 session metadata 上设置归因信息
- 如果已配置，应用品牌颜色（`CHECKOUT_BRANDING`）

---

### `POST /api/billing/portal`

创建 Stripe Customer Portal 会话以管理现有订阅。

**请求体：**

```json
{ "returnUrl": "/profile" }
```

| 字段 | 类型 | 描述 |
|---|---|---|
| `returnUrl` | string | 门户退出后返回的路径。相对于配置的应用 origin 进行解析。 |

**响应 `200 OK`：**

```json
{
  "url": "https://billing.stripe.com/p/session/test_abc123"
}
```

**URL 解析：** 如果以 `/` 开头，则相对于应用 origin 解析。否则，如果与当前 origin 匹配，则按提供的 URL 使用。回退到应用 origin。

---

### `GET /api/billing/status`

返回订阅状态和付款详情。可选择性地检查特定座席计划的座席可用性。

**查询参数：**

| 参数 | 类型 | 描述 |
|---|---|---|
| `seat_plan` | string | 如果提供，解析座席可用性（容量与有效部署数对比） |
| `billing_interval` | string | 与 `seat_plan` 一起使用。`"month"` 或 `"year"`。 |

**响应 `200 OK`：**

```json
{
  "active": true,
  "payment_ready": true,
  "subscription": {
    "subscription_id": "sub_abc123",
    "subscription_item_id": "si_abc123",
    "status": "active",
    "price_id": "price_abc123",
    "seat_plan": "seat-standard",
    "billing_interval": "month",
    "current_period_end": "2026-07-24T00:00:00.000Z",
    "cancel_at_period_end": false,
    "cancel_at": null,
    "created_at": "2026-01-15T00:00:00.000Z"
  },
  "seat_availability": {
    "seat_plan": "seat-standard",
    "billing_interval": "month",
    "price_id": "price_abc123",
    "seat_capacity": 5,
    "active_deployments": 2,
    "needs_new_seat": false,
    "subscription_id": "sub_abc123",
    "subscription_item_id": "si_abc123"
  }
}
```

**座席可用性逻辑：**
- 从 `billingSubscriptionItem` 读取 `quantity`（购买的座席数）
- 统计 `installSessions` 中状态为 `active != false` 且 `stripeSubscriptionItemId` 匹配的活跃部署数
- 如果 `active_deployments >= seat_capacity`，则 `needs_new_seat = true`
- 如果用户没有匹配的订阅项，则回退到 `create_subscription`（表示需要新订阅）

**付款就绪：** 检查 Stripe customer 是否有 `default_payment_method`。回填那些 Stripe 有但本地缓存没有的情况。

---

## 促销代码

### `POST /api/billing/validate-promo`

**公开（无需认证）。** 验证 Stripe 促销代码。在结账前使用，用于显示折扣信息。

**请求体：**

```json
{ "code": "LAUNCH20" }
```

**响应 `200 OK`（有效）：**

```json
{
  "valid": true,
  "code": "LAUNCH20",
  "id": "promo_abc123",
  "discount": {
    "percent_off": 20,
    "amount_off": null,
    "currency": null,
    "duration": "forever",
    "duration_in_months": null
  }
}
```

**响应 `200 OK`（无效）：**

```json
{ "valid": false, "message": "Invalid or expired code" }
```

**注意：** 即使验证失败，端点也会返回 200。只有在 Stripe API 错误或 JSON 格式不正确时，才返回 400/500。

---

## 使用量积分

### `POST /api/billing/usage-credits/checkout`

为使用量积分创建一次性付款结账。积分在 AI 代理请求超出月度上限时使用。

**请求体：**

```json
{
  "pack": "pack_25",
  "locale": "en",
  "attribution": { "utm_source": "dashboard" }
}
```

| 字段 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `pack` | string | `"pack_10"` | `"pack_5"`、`"pack_10"`、`"pack_25"` 或 `"pack_50"` |
| `locale` | string | `"en"` | 成功/取消重定向 URL 的语言 |
| `attribution` | object | — | UTM/归因元数据 |

**积分包：**

| 包 | 美元 | 环境变量 |
|---|---|---|
| `pack_5` | $5.00 | `STRIPE_USAGE_CREDIT_PRICE_ID_5` |
| `pack_10` | $10.00 | `STRIPE_USAGE_CREDIT_PRICE_ID_10` |
| `pack_25` | $25.00 | `STRIPE_USAGE_CREDIT_PRICE_ID_25` |
| `pack_50` | $50.00 | `STRIPE_USAGE_CREDIT_PRICE_ID_50` |

**响应 `200 OK`：**

```json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_abc123",
  "pack": "pack_25",
  "credits_usd": 25
}
```

**错误：**

| 状态码 | 错误 | 含义 |
|---|---|---|
| 400 | `invalid_pack` | 包未识别 |
| 400 | `pack_unavailable` | 包存在但未配置 Price ID（环境变量缺失） |

**Stripe session metadata：** `purchase_type: "usage_credits"`、`user_id`、`credits_usd`、`credit_pack`、`credit_expiration_days: "365"`（积分自购买起 365 天后过期）。

**重定向：** 成功 → `/{locale}/profile?credits=success&session_id={CHECKOUT_SESSION_ID}`。取消 → `/{locale}/profile?credits=cancel`。

---

### `POST /api/billing/usage-credits/confirm`

确认 Stripe 结账 session 并应用使用量积分。在用户从 Stripe checkout 重定向回来后调用。

**请求体：**

```json
{ "session_id": "cs_test_abc123" }
```

**验证：**
1. 从 Stripe 检索 checkout session
2. 验证 `purchase_type === "usage_credits"`
3. 验证 `user_id` 匹配已认证的用户
4. 检查 `payment_status` 是否为 `paid` 或 `complete`
5. 确保 `credits_usd` 为正且有限
6. 通过 `addPurchasedUsageCredits` 应用积分（基于 `source_type + source_id` 的幂等性）

**响应 `200 OK`：**

```json
{
  "ok": true,
  "applied": true,
  "balance_usd": 35.0,
  "expires_at": "2027-06-24T00:00:00.000Z"
}
```

如果已经应用（幂等性）：

```json
{
  "ok": true,
  "applied": false,
  "balance_usd": 35.0,
  "expires_at": "2027-06-24T00:00:00.000Z"
}
```

---

### `GET /api/billing/usage-credits/confirm`

返回当前的使用量积分余额和下次过期信息。

**响应 `200 OK`：**

```json
{
  "balance_usd": 35.0,
  "next_expires_at": "2027-06-24T00:00:00.000Z",
  "next_expiring_usd": 10.0
}
```

`next_expires_at` 为最早到期的授予的过期时间。`balance_usd` 为所有未到期授予的总和。

---

## Cron：座席生命周期

### `POST /api/billing/seats/grace`

Cron 端点。处理付款宽限期已过期的待处理座席。对于每个已过期的座席：

1. 检查 Stripe 中最新发票是否已付款
2. 如果已付款 → 将座席和会话状态标记为 `active`
3. 如果未付款 → 取消座席：拆除 Hetzner 服务器、释放 Telegram 令牌、作废未付款发票、从订阅中移除座席、将会话标记为 `terminated`

**环境变量：** `CRON_SECRET`（如果配置了必填）、`GRACE_MINUTES_DEFAULT`（默认：60）。

**行为说明：** `seatStatus = "pending"` 且 `graceUntil < now` 的会话将被处理。如果座席的 Stripe 订阅已经具有 `status = "active"`，则会跳过（假设已通过 webhook 处理）。

---

### `POST /api/billing/seats/period-end`

Cron 端点。在计费周期结束时处理待处理的座席移除。对于 `seatStatus = "pending_remove"` 且 `seatRemoveAt < now` 的会话：

1. 验证 Stripe 订阅计划已执行座席减少（`quantity` 低于已移除的座席数）
2. 如果计划正在运行 → 等待（跳过本次运行）
3. 拆除 Hetzner 服务器、释放 Telegram 令牌、将座席标记为 `removed`、将会话标记为 `terminated`

**环境变量：** `CRON_SECRET`（如果配置了必填）。

**按订阅分组：** `(subscriptionId, subscriptionItemId)` 组合键相同的座席会被批量处理。在继续之前，会整体验证每个组的预期座席数量。

---

## 环境变量模板

```bash
# Stripe (required for all billing endpoints)
STRIPE_SECRET_KEY=                    # Stripe API 密钥
STRIPE_WEBHOOK_SECRET=                # Webhook 签名验证

# 订阅价格 ID（至少填写一个）
PRICE_ID_STANDARD=                    # seat-standard 月度
PRICE_ID_STANDARD_YEARLY=            # seat-standard 年度（可选）
PRICE_ID_STANDARD_YEARLY_2=          # seat-standard 年度备用（逗号/换行符分隔）
PRICE_ID_STANDARD_YEARLY_3=          # seat-standard 年度备用
PRICE_ID_MAX=                        # seat-max 月度
PRICE_ID_MAX_YEARLY=                 # seat-max 年度（可选）

# 使用量积分价格 ID
STRIPE_USAGE_CREDIT_PRICE_ID_5=      # $5 积分包
STRIPE_USAGE_CREDIT_PRICE_ID_10=     # $10 积分包
STRIPE_USAGE_CREDIT_PRICE_ID_25=     # $25 积分包
STRIPE_USAGE_CREDIT_PRICE_ID_50=     # $50 积分包

# Cron 认证
CRON_SECRET=                          # 座席生命周期 cron 端点必需
```

---

## 相关文档

- [部署生命周期 API 参考](deploy-api-lifecycle.md) — POST /deploy 中的座席创建
