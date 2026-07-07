# Runner Notify Channel Plan

本文记录 runner notify 的设计背景、迁移计划和实现边界。

## 当前实现状态

当前 `upstream/main` 已经完成 notify 主路径，本文档保留设计背景，同时记录当前事实：

- runner 会建立并维持 `connectRunnerNotifyChannel()` 出站 WebSocket 连接。
- 控制面入列 job 后调用 `notifyRunnerJobAvailable()`，向 `RUNNER_NOTIFY_URL/notify/{sid}` POST `job_available` hint。
- Worker 代码位于 `workers/runner-notify/src/index.js`，部署配置见 `wrangler.runner-notify.jsonc`。
- runner 收到 `job_available` 后调用 `claimAndDrainJobs("notify")`，通过 `POST /api/deploy/{sid}/runner/jobs/claim` 原子 claim job。
- runner 在 notify 未连接时按 `FALLBACK_JOB_CLAIM_INTERVAL_MS` 做 fallback claim，默认 30 分钟。
- runner 在 notify 已连接时只保留低频安全检查，默认 6 小时一次远端同步和一次 safety claim，可通过 `RUNNER_NOTIFY_CONNECTED_REMOTE_SYNC_INTERVAL_MS`、`RUNNER_NOTIFY_CONNECTED_SAFETY_CLAIM_INTERVAL_MS` 调整。
- `/api/deploy/{sid}/skills/*` 仍保留薄兼容层给旧 runner；新 runner 使用 `/api/deploy/{sid}/runner/*`。

## 背景

当前 ClawSimple 控制面使用 pull 模式向部署机器下发任务。控制面把任务写入 `deployment_agent_jobs`，部署机器上的 runner 通过固定节拍请求控制面，发现任务后拉取、执行并上报状态。

这个模式安全，部署机器不需要开放入站端口，控制面也不需要保存用户机器的 SSH 凭证。但它有一个成本问题：即使没有任务，每台活跃部署机器也会定期请求控制面。当前无任务间隔约为 60 秒，多台机器叠加后会持续触发 Vercel 函数和 Neon 查询，使 Neon 难以进入 5 分钟无活动后的 scale to zero 状态。

本文档记录修改前逻辑、目标逻辑、Cloudflare Worker + Durable Object 的作用，以及迁移时需要保留的安全边界。

## 当前逻辑

### 数据模型

控制面使用三类表和字段组织 runner 任务：

- `deployment_agent_jobs`
  保存任务队列。字段包括 `sid`、`user_id`、`job_type`、`payload`、`status`、`started_at`、`completed_at`、`created_at`、`updated_at`。

- `deployment_agent_wake`
  保存每个 `sid` 的 wake version。控制面下发新任务后递增 version，runner 通过 wake 接口知道是否有新任务。

- `install_sessions.server_fingerprint`
  保存部署机器软状态，例如 runner 版本、OpenClaw 版本等。

runner 访问控制面时使用 `deploy_agent_token`。控制面只保存 token hash，通过 `install_sessions.deploy_agent_token_hash` 做验证。

### 下发任务

控制面通过 `enqueueAgentJob()` 写入任务：

1. 插入一条 `deployment_agent_jobs`，状态为 `pending`。
2. 调用 `bumpAgentWakeVersion(sid)`。
3. 等待 runner 下次请求 wake 接口。

任务入列只发生在控制面。runner 的轮询不会创建任务。

### runner 轮询

runner 主循环当前是：

```text
loop:
  如果没有 sid/token:
    尝试 claim 或等待

  GET /api/deploy/{sid}/skills/wake
    验证 token
    清理超时 pending/running job
    更新 runner/gateway 状态
    查询 deployment_agent_wake
    查询是否存在 pending job
    返回 { has_update, version, next_poll_after_ms }

  如果 has_update:
    GET /api/deploy/{sid}/skills/jobs/next
    返回最早的一条 pending job
    runner ack running
    runner 执行任务
    runner ack succeeded 或 failed

  sleep(next_poll_after_ms + jitter)
```

当前服务端在无任务时返回 `next_poll_after_ms: 60000`，有任务时返回 `1000`。

### 状态上报

任务状态已经是主动上报。runner 执行前调用 ack，把状态改为 `running`；执行成功或失败后再调用 ack，把结果写回控制面。

`POST /api/deploy/{sid}/runner/jobs/{jobId}/ack` 还承担业务副作用：

- `openclaw_upgrade` 成功后写回 OpenClaw 版本、磁盘信息等。
- `runner_refresh` 成功后写回 runner 版本。
- `install_app` 成功后把 install session 标记为 completed。
- `backup_export` / `backup_restore` 更新 backup 状态。

因此，本次改造的重点不是状态上报，而是任务发现。

## 当前任务类型

runner 当前支持这些主线任务：

| job type | 作用 | 是否需要通知 |
| --- | --- | --- |
| `install_app` | 在已有机器上执行安装脚本 | 需要，通常发生在部署或 relaunch 流程 |
| `backup_export` | 导出部署数据 | 需要，但可接受分钟级兜底 |
| `backup_restore` | 恢复部署数据 | 需要，但可接受分钟级兜底 |
| `update_ai_config` | 更新模型、provider、API key 配置 | 需要，用户通常在 UI 等待结果 |
| `add_agent` | 添加 OpenClaw 或 Hermes agent、Telegram 账号和 workspace | 需要 |
| `remove_agent` | 移除 agent 配置 | 需要 |
| `runner_refresh` | 更新 runner 脚本并重启 runner | 需要，但不必秒级 |
| `openclaw_upgrade` | 升级 OpenClaw 并回传版本 | 需要，但不必秒级 |
| `hermes_upgrade` | 升级 Hermes Agent 并回传版本 | 需要，但不必秒级 |
| `telegram_profile_sync` | 同步 Telegram profile | 可低频或改为后台同步 |

生产库里还出现过一些历史任务：`remove_install`、`gateway_service_repair`、`telegram_policy_migrate`、`local_agent_install`、`local_agent_login_start`、`local_agent_login_poll`。这些是旧路径或一次性流程，不应该成为新通知机制的核心设计对象。

## 问题

### 数据库无法空闲

Neon 的 scale to zero 依赖一段时间内没有数据库活动。只要 runner 每分钟请求 wake，控制面就会查询或更新数据库。多台机器叠加后，Neon 很难出现连续 5 分钟无查询。

### wake 接口承担太多职责

`/skills/wake` 同时做四件事：

1. 验证 runner token。
2. 更新 runner/gateway 心跳。
3. 清理超时任务。
4. 判断是否有 pending job。

其中只有第 4 项和任务发现直接相关。心跳写入不需要每分钟发生；超时清理也可以由 cron 或 claim/ack 路径处理。

### `jobs/next` 不是原子 claim

当前 `/jobs/next` 返回最早 pending job，runner 随后再 ack `running`。如果同一台机器上意外跑了两个 runner，或 notify 和兜底轮询同时触发，就可能让两个执行器看到同一条 pending job。

实际重复执行概率不高，但通知化后需要把这个边界收紧。

## 目标逻辑

目标是把任务发现改成通知优先：

```text
平时:
  runner 与 Cloudflare notify channel 保持一条出站 WebSocket
  runner 不再每分钟请求控制面
  Neon 不被 runner 空闲轮询唤醒

下发任务:
  控制面写入 deployment_agent_jobs
  控制面调用 notify service
  notify service 向对应 sid 的在线 runner 推送 job_available
  runner 收到通知后向控制面 claim job
  runner 执行 job
  runner ack 状态和结果

兜底:
  runner 启动时主动 claim 一次
  notify 未连接时每 30 分钟低频 claim 一次
  notify 已连接时每 6 小时 safety claim 一次
  WebSocket 断线后自动重连
```

通知消息只需要告诉 runner：`sid 有任务可取`。通知消息不携带任务 payload，不携带 secret，不直接改变任务状态。

## 为什么使用 Cloudflare Worker

Vercel Serverless 不适合做长期 WebSocket 连接中枢。控制面可以继续部署在 Vercel，但 runner 的长期在线连接应放到更适合边缘长连接的服务上。

Cloudflare Worker 适合承担 notify service 的入口：

- 支持 WebSocket upgrade，可以接收 runner 建立的长连接。
- 离用户和服务器网络近，延迟低。
- 不要求部署机器开放入站端口。runner 只需要主动发起出站 HTTPS/WebSocket 连接。
- 可以独立于 Vercel 控制面部署。控制面只需要在下发任务后调用 Worker 的 HTTP notify endpoint。
- 可以和 Durable Object 配合，按 `sid` 保存在线连接。

Cloudflare 官方文档中，Workers 支持 WebSockets；Durable Objects 经常与 WebSockets 一起用于协调多个客户端和连接。参考：

- Cloudflare Workers WebSockets: https://developers.cloudflare.com/workers/runtime-apis/websockets/
- Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Durable Objects overview: https://developers.cloudflare.com/durable-objects/

## Durable Object 是什么

Cloudflare Worker 默认是无状态的。一次请求可能在不同边缘节点、不同 isolate 中执行。普通 Worker 不适合保存“某个 sid 当前有哪些在线 runner WebSocket”这种状态。

Durable Object 是 Cloudflare 提供的有身份、有状态的协调单元。可以把它理解为：

- 一个按名称或 id 寻址的状态对象。
- 同一个对象 id 的请求会路由到同一个 Durable Object 实例。
- 它可以保存内存状态，也可以使用 Durable Object storage。
- 它适合处理需要串行协调、连接管理、实时广播、房间状态、限流计数、会话状态的场景。

在当前场景里，我们不需要把任务存进 Durable Object。Neon 仍是任务队列的 source of truth。Durable Object 只负责保存在线 WebSocket 连接，并把通知发给对应 runner。

## Durable Object 的常见应用场景

Durable Object 适合这些类型的问题：

- 聊天房间：每个 room 一个 Durable Object，管理房间内连接和消息广播。
- 协作文档：每个 document 一个 Durable Object，协调编辑事件顺序。
- 多人游戏房间：每个 match 一个 Durable Object，保存当前连接和房间状态。
- 实时通知：每个 user、team、device 或 deployment 一个 Durable Object，保存在线连接并推送事件。
- 分布式锁和串行协调：每个资源一个 Durable Object，避免多个 Worker 并发修改同一份状态。
- 速率限制：每个用户、IP、API key 一个 Durable Object，集中计数。
- presence 状态：记录谁在线、最后连接时间、连接数。

ClawSimple 当前属于“实时通知”和“presence 状态”这类场景：

- 每个 `sid` 是一个自然协调边界。
- 每个 `sid` 通常只有一个 runner 在线，偶尔可能有重启期间的新旧连接重叠。
- 控制面只需要通知这个 `sid` 有新任务。
- Durable Object 不需要执行任务，不需要存业务 secret。

## 新架构

### 组件

```text
Vercel 控制面
  - 写 deployment_agent_jobs
  - 提供 job claim API
  - 提供 ack API
  - 下发任务后调用 notify Worker

Cloudflare Worker
  - 接收 runner WebSocket 连接
  - 接收控制面的 notify 请求
  - 按 sid 路由到 Durable Object

Durable Object
  - 每个 sid 一个对象实例
  - 保存当前 sid 的 WebSocket 连接
  - 收到 notify 后向在线 runner 发送 job_available

runner
  - 主动连接 Worker
  - 收到 job_available 后 claim job
  - 执行 job
  - ack 结果到 Vercel 控制面

Neon
  - 保存任务和状态
  - 不再被空闲 runner 每分钟唤醒
```

### 连接模型

新机器部署完成后，runner 启动并连接：

```text
runner -> wss://runner-notify.example.com/connect?sid=...
```

认证不把长期 token 放 URL query。第一版 runner 使用 WebSocket subprotocol 传递 token：

- WebSocket upgrade 请求带 `Sec-WebSocket-Protocol: clawsimple.runner, token.<deploy_agent_token>`。
- Worker 可选择只做轻量格式检查，然后调用控制面的验证接口。
- 或者 Worker 使用控制面签发的短期 notify token，只用于连接 notify channel。

第一版复用 `deploy_agent_token`，但要避免在日志中记录 token。更长期的设计是控制面给 runner 发一个短期 notify token，过期后 runner 重新换取。

### 下发任务流程

```text
用户或 cron 触发控制面操作
  -> 控制面调用 enqueueAgentJob()
  -> deployment_agent_jobs 写入 pending
  -> 控制面调用 POST https://runner-notify.example.com/notify/{sid}
  -> Worker 路由到 sid 对应 Durable Object
  -> Durable Object 向该 sid 的 WebSocket 发送 {"type":"job_available"}
  -> runner 收到通知
  -> runner 调用 POST /api/deploy/{sid}/runner/jobs/claim
  -> runner 执行任务
  -> runner 调用 /ack 上报 running/succeeded/failed
```

### claim 替代 next

应新增原子 claim API，替代当前 `/jobs/next` 的读后 ack：

```text
POST /api/deploy/{sid}/runner/jobs/claim
```

语义：

1. 验证 runner token。
2. 在数据库内选择该 `sid` 最早的 `pending` job。
3. 原子更新为 `running`，写入 `started_at`、`updated_at`。
4. 返回这条 job 的 `id`、`type`、`payload`、`created_at`。
5. 如果没有 pending job，返回 `{ job: null }`。

这样即使出现重复通知、重连、低频兜底轮询、双 runner 进程，也只有一个请求能 claim 到同一条任务。

Neon HTTP mode 不支持 `db.transaction(...)`，实现时不要依赖 Drizzle transaction。可以使用单条 SQL 的 `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED ...) RETURNING ...`，或使用 Postgres CTE 做原子 claim。

### runner 主循环

新 runner 逻辑：

```text
start:
  connectNotifyWebSocket()
  claimAndDrainJobs("startup")
  scheduleFallbackClaim(30 min when notify is unavailable)

on websocket message job_available:
  claimAndDrainJobs("notify")

claimAndDrainJobs(reason):
  loop:
    POST /jobs/claim
    if no job:
      break
    execute job
    ack succeeded/failed

fallback:
  when notify is unavailable, every 30 min:
    claimAndDrainJobs("fallback")

notify-connected safety:
  every 6 hours:
    remote sync
    claimAndDrainJobs("safety")

on websocket close/error:
  reconnect with backoff
```

`claimAndDrainJobs()` 应一次性取完当前 pending 队列。这样批量下发 `runner_refresh` 或 `openclaw_upgrade` 时，不需要每个 job 单独等待下一次 notify。

### 低频兜底

不能完全依赖 WebSocket 通知。需要保留低频兜底：

- runner 刚启动时 claim 一次。
- WebSocket 连接成功后 claim 一次，处理断线期间积压的任务。
- WebSocket 断线时继续按低频 claim。
- WebSocket 已连接时保留 6 小时 safety claim，防止 notify 丢失。

低频 claim 会触发 Neon，但频率远低于每台机器每分钟 wake。以 9 台机器为例，notify 已连接后 safety claim 默认约每 6 小时 9 次；notify 不可用时 fallback 仍是每小时约 18 次。

### release-check 与活性判断

OpenClaw release-check 不应把旧 wake heartbeat 当作发布验证的硬门槛。notify 模式下 runner 不再频繁调用旧 `/wake`；notify 已连接后的 safety claim 默认 6 小时一次，长于旧 release-check 的 20 分钟 stale 阈值。

新的判断标准：

- **升级是否执行成功**：以 `openclaw_upgrade` job 的 claim / ack / result 为事实源；成功 ack 会写回 `openclaw_version`、`openclaw_last_upgraded_at` 等字段。
- **通知是否可用**：以 Telegram bot `getMe` 等发布通知前置条件为硬校验。
- **runner/gateway 是否在线**：后续如需要实时在线性，应通过 notify Worker / Durable Object presence 查询；在 presence API 落地前，不因旧 DB heartbeat stale 自动 rollback。
- **旧 heartbeat 字段**：不要继续写入或展示旧 wake heartbeat 字段。它们不参与 release-check 的 rollback 判定。

## Worker / Durable Object 路由设计

一个 Worker 服务所有部署，不是每台机器一个 Worker。

```text
runner-notify Worker
  -> Durable Object: sid=KYLGXT7UISKV
  -> Durable Object: sid=XT6K5KUIDE7X
  -> Durable Object: sid=8BPBX375U3WE
```

### Worker endpoints

建议第一版暴露三个端点：

```text
GET /connect
  runner WebSocket 连接入口
  header: Authorization: Bearer <token>
  query: sid=<sid>

POST /notify/{sid}
  控制面通知入口
  header: Authorization: Bearer <control-plane-notify-secret>
  body: { reason?: string, job_id?: string }

GET /health
  Worker 健康检查
```

### Durable Object state

每个 Durable Object 需要保存：

- 当前 WebSocket 连接集合。
- 最近连接时间。
- 最近通知时间。
- 可选：最近一次通知序号，用于调试。

它不保存：

- job payload。
- provider secret。
- deploy agent token 明文。
- 用户数据。

### 重复连接处理

同一个 `sid` 可能出现多个连接：

- runner 重启时旧连接还没完全断开。
- systemd 意外启动了两个 runner。
- 网络抖动导致重连重叠。

第一版可以向所有在线连接广播 `job_available`。因为 claim API 是原子的，重复收到通知不会重复执行同一条任务。

后续可以在连接消息中加入 `runner_instance_id`，让 Durable Object 保留最新连接，关闭旧连接。

## 安全边界

### 不开放部署机器入站端口

runner 主动连接 Cloudflare。控制面不需要访问用户机器公网 IP，也不需要用户机器开放 webhook 端口。

### Cloudflare 只做门铃

Cloudflare 不保存任务内容。通知内容只包含：

```json
{ "type": "job_available" }
```

最多加上非敏感字段：

```json
{ "type": "job_available", "job_id": "..." }
```

runner 仍必须向控制面 claim 任务。任务 payload 和 secret 仍由现有控制面鉴权。

### notify endpoint 要有控制面鉴权

`POST /notify/{sid}` 只能由控制面调用。建议使用独立的 `RUNNER_NOTIFY_SECRET`，不要复用 `CRON_SECRET`。

### runner 连接要有设备鉴权

runner 连接 WebSocket 时必须证明自己属于该 `sid`。可以分两阶段：

- 第一版：复用 `deploy_agent_token`，Worker 调控制面验证。
- 后续：控制面签发短期 notify token，runner 用短期 token 连接 Worker。

### 日志不要写 token

Worker、Vercel 和 runner 日志都不能输出 Authorization header、query token、secret payload。

## 与 Neon 成本的关系

当前每分钟 wake 会持续访问控制面数据库。只要请求频率高于 Neon scale to zero 的空闲窗口，compute 就不会停。

通知化后，空闲期只有 WebSocket 连接留在 Cloudflare，不访问 Neon。Neon 只在这些情况下工作：

- 用户访问网站或 API。
- 控制面创建任务。
- runner claim 任务。
- runner ack 状态。
- 低频兜底 claim。
- 后台 cron 做真实检查。

这样可以让 Neon 在没有用户访问、没有任务、没有状态上报时进入 idle。

## 迁移计划

### 阶段 1：止血

- 把 `/skills/wake` 的心跳写入降频。
- 把无任务轮询从 60 秒调整为 5 到 15 分钟。
- 保留当前 `/jobs/next` 和 ack。

这个阶段不依赖 Cloudflare 改造，可以先降低 Neon 活跃度。

### 阶段 2：原子 claim

- 新增 `POST /api/deploy/{sid}/runner/jobs/claim`。
- runner 改为 claim 后执行，不再先 `jobs/next` 再 ack `running`。
- `/jobs/next` 保留一段时间兼容旧 runner。

### 阶段 3：Cloudflare notify channel

- 新增 `runner-notify` Worker 和 Durable Object。
- runner 启动时连接 notify channel。
- 控制面在 `enqueueAgentJob()` 后调用 Worker notify。
- runner 收到 `job_available` 后调用 claim。
- notify 不可用时保留 30 分钟兜底 claim；notify 已连接时只保留 6 小时 safety claim。

### 阶段 4：清理旧 wake

- `/api/deploy/{sid}/skills/*` 只保留薄兼容层给旧 runner。
- 超时任务清理由独立 cron 或 claim/ack 流程处理。
- Dashboard runner 在线状态改为读取低频 heartbeat 或 notify presence。

## 风险和处理

### Cloudflare 通道断线

处理：runner 自动重连；保留低频 claim。

### notify 发送成功但 runner 没收到

处理：任务已写入 Neon，不会丢。低频 claim 会补偿。

### notify 重复发送

处理：claim API 原子化。重复通知只会导致 runner 多 claim 几次，拿不到 job 就结束。

### 控制面写 DB 成功但 notify 调用失败

处理：任务留在 pending。控制面可以记录 notify failure，runner 低频 claim 会补偿。

顺序必须保持为先写入 `deployment_agent_jobs`，再调用 notify Worker。Worker 只发送 `job_available` hint，不保存任务，也不读取 payload。runner 收到 hint 后仍然通过控制面的 claim API 取任务；notify 失败时，后续 fallback/safety claim 会取到同一条 pending job。

### 多 runner 同时在线

处理：第一版广播通知；原子 claim 保证单 job 只执行一次。后续可按 `runner_instance_id` 淘汰旧连接。

### Worker 鉴权调用控制面增加延迟

处理：第一版可接受。后续改短期 notify token，Worker 本地验证签名。

## 本次采用的参数

- Notify channel 域名：`runner-notify.example.com`。
- 控制面调用 Worker：使用独立 `RUNNER_NOTIFY_SECRET`。
- Worker 验证 runner：复用 deploy agent token，Worker 调用控制面的 `/runner/auth/verify` 校验。
- runner 任务获取：使用 `POST /api/deploy/{sid}/runner/jobs/claim`。
- `/jobs/next`：保留兼容旧 runner，但行为改为 claim。
- `/skills/*`：只保留薄兼容层给旧 runner。
- 兜底 claim 间隔：notify 不可用时 30 分钟；notify 已连接时 safety claim 默认 6 小时。
- 旧 pending/running 历史任务：做一次性清理；运行时只保留超时保护，不做历史任务常态扫描。预览命令：`pnpm agent-jobs:cleanup:preview`，执行命令：`pnpm agent-jobs:cleanup:apply`。

## 推荐结论

推荐采用 Cloudflare Worker + Durable Object 做通知通道，同时保留低频 claim 兜底。

这个方案保留现有安全模型：部署机器只出站连接，任务内容仍由控制面和 Neon 管理，状态仍由 runner 主动 ack。Cloudflare 只负责实时通知在线 runner，不保存任务内容。

第一版最重要的工程边界是：先做原子 claim，再接 notify。这样即使通知重复、runner 重连、低频兜底同时发生，也不会重复执行任务。
