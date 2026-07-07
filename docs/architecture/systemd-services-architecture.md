# 服务器架构：两个 systemd 服务的职责与关系

## 项目背景

**OpenClaw** 是一个开源 AI Agent 框架（MIT），用户在 Telegram 里和自己的私有 AI Bot 对话。Bot 运行在用户自己的 VPS 上，数据不经过任何第三方服务器。

**ClawSimple** 是 OpenClaw 的托管部署服务。用户在 ClawSimple 网站上填写 Telegram Bot Token 和 AI API Key，ClawSimple 负责在云服务器上自动安装、配置并维持 OpenClaw 实例运行，用户无需懂服务器运维。

每台部署的服务器上运行**两个独立的 systemd 服务**，它们分工明确、互不重叠。

---

## 两个服务概览

```
服务器 /opt/clawsimple/
├── clawsimple.service          ← AI 对话网关（业务面）
└── clawsimple-jobs.service     ← ClawSimple 控制面 Runner（运维面）
```

---

## `clawsimple.service` — AI 对话网关

### 是什么

运行 `openclaw gateway`，即 OpenClaw 的核心进程。

### 做什么

接收来自 Telegram 的用户消息，路由给对应的 AI Agent，调用 LLM（OpenAI / Z.ai / Gemini 等），再把回复发回 Telegram。

```
用户发消息给 Telegram Bot
        │
        ▼
openclaw gateway (port 18789)
        │
        ├── 路由给 main agent
        ├── 路由给 extra agent A
        └── 路由给 extra agent B
                │
                ▼
         LLM API 调用
                │
                ▼
         Telegram 回复
```

### 关键配置

| 配置项 | 来源 | 说明 |
|--------|------|------|
| `TELEGRAM_BOT_TOKEN` | `.env.app` | 用户的 Bot Token，向 Telegram 标识机器人身份 |
| `TELEGRAM_ALLOWED_USER_IDS` | `.env.app` | 允许发消息的 Telegram 用户 ID 白名单 |
| `OPENAI_API_KEY` / `CUSTOM_OPENAI_API_KEY` | `.env.app` | AI 模型的 API Key（BYOM 用户自带） |
| `HOME` | systemd | 强制设为 `/opt/clawsimple`，所以 `~/.openclaw` → `/opt/clawsimple/.openclaw` |

### systemd 配置摘要

```ini
[Unit]
Description=ClawSimple Service
After=network.target

[Service]
Type=simple
User=clawsimple
ExecStart=/usr/bin/openclaw gateway --port 18789
Restart=always           # 正常退出或异常退出都重启
RestartSec=10
```

`Restart=always`：即使 gateway 为了升级/热重启而正常退出，systemd 也会把它重新拉起。

---

## `clawsimple-jobs.service` — 控制面 Runner

### 是什么

运行 `skill-jobs-runner.mjs`，一个由 ClawSimple 安装脚本 vendor 进服务器的 Node.js 脚本。

### 做什么

定期向 ClawSimple API 轮询待执行的"运维 job"，在本机执行后把结果回报。

```
ClawSimple API (example.com)
        │  GET /api/deploy/:sid/skills/jobs/next
        ▼
skill-jobs-runner.mjs（本机运行）
        │
        ├── install_app     → 安装/更新 openclaw 本体，重启网关
        ├── add_agent       → 写入 openclaw.json 添加 Agent，重启网关
        ├── remove_agent    → 从 openclaw.json 删除 Agent，重启网关
        ├── backup_export   → 压缩加密 workspace，上传 S3（用于 Relaunch keep-memory）
        ├── backup_restore  → 从 S3 下载并还原 workspace
        ├── lockdown        → 关闭服务，用于 OVH 服务器回收
        └── runner_refresh  → 自更新 runner 脚本本身
        │
        ▼
POST /api/deploy/:sid/skills/jobs/:jobId/ack
（回报 succeeded / failed）
```

### 关键配置

| 配置项 | 来源 | 说明 |
|--------|------|------|
| `SID` | systemd 注入 | 部署会话 ID，ClawSimple 系统内唯一标识 |
| `DEPLOY_AGENT_TOKEN` | `.env.app` | ClawSimple 颁发的 Bearer Token，用于向 API 认证身份 |
| `CLAWSIMPLE_API_BASE_URL` | `.env.app` | ClawSimple API 地址（默认 `https://example.com`） |

### systemd 配置摘要

```ini
[Unit]
Description=ClawSimple Agent Jobs Runner
After=network.target clawsimple.service
StartLimitIntervalSec=300
StartLimitBurst=10
OnFailure=clawsimple-jobs-failure@%n.service   # 崩溃时写日志

[Service]
Type=simple
User=clawsimple
ExecStart=/usr/bin/node /opt/clawsimple/bin/skill-jobs-runner.mjs
Restart=always           # 始终重启，轮询循环
RestartSec=10
Environment=SID=<sid>
Environment=CLAWSIMPLE_INSTALL_DIR=/opt/clawsimple
```

`Restart=always`：runner 本身就是一个无限轮询循环，正常退出（比如自更新 runner_refresh 后主动 `process.exit(0)`）也需要被 systemd 拉起。

`After=clawsimple.service`：控制启动顺序，但**不是**强依赖——网关宕机期间 runner 仍然可以工作（这在 relaunch 流程中是必要的：runner 需要在网关停掉的状态下完成备份导出）。

---

## 为什么必须是两个独立服务

**核心原因：runner 需要重启网关。**

`add_agent`、`remove_agent`、`install_app` 这类 job 执行后都需要 `systemctl restart clawsimple`。如果 runner 和网关是同一个进程（或同一个 service），就无法重启自己。

两个服务的分离让以下操作成为可能：

```
runner 执行 add_agent
    → 写 openclaw.json
    → systemctl restart clawsimple   ← 重启网关，不影响 runner 自身
    → ack 回报 succeeded
```

---

## 运维关系图（完整视角）

```
┌──────────────────────────────────────────────────────────────┐
│                   ClawSimple Control Plane                   │
│                                                              │
│  ┌────────────┐    API jobs    ┌──────────────────────────┐  │
│  │  Profile   │◄──────────────│  /api/deploy/:sid/skills  │  │
│  │  Dashboard │               │  (job queue)              │  │
│  └────────────┘               └──────────────────────────┘  │
└─────────────────────────────────────┬────────────────────────┘
                                      │ HTTPS (Bearer token)
                          ┌───────────▼───────────────┐
                          │      VPS 服务器             │
                          │  /opt/clawsimple/          │
                          │                            │
                          │  clawsimple-jobs.service   │  ←  控制面
                          │  (skill-jobs-runner.mjs)   │
                          │    │ 轮询 job               │
                          │    ├─ add_agent            │
                          │    ├─ remove_agent         │
                          │    ├─ backup_export/restore│
                          │    └─ systemctl restart ───┼──┐
                          │                            │  │
                          │  clawsimple.service        │  │  ←  业务面
                          │  (openclaw gateway)   ◄────┼──┘
                          │    │ Telegram Bot API  │   │
                          └────┼───────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Telegram 用户       │
                    └─────────────────────┘
```

---

## 崩溃保护机制

`clawsimple-jobs-failure@.service` 是一个 oneshot 模板 service，当 jobs runner 超出 StartLimit（300s 内崩溃 10 次）后触发：

1. 写入 `/opt/clawsimple/logs/clawsimple-jobs-failures.log`（带时间戳）
2. 通过 `logger(1)` 写入系统 syslog，可通过 `journalctl -t clawsimple-jobs` 查询

---

## 开发者常用命令

```bash
# 查看网关（AI 对话）日志
sudo journalctl -u clawsimple -f

# 查看 runner（运维操作）日志
sudo journalctl -u clawsimple-jobs -f

# 查看 runner 崩溃记录
cat /opt/clawsimple/logs/clawsimple-jobs-failures.log

# 手动重启网关（不影响 runner）
sudo systemctl restart clawsimple

# 手动重启 runner
sudo systemctl restart clawsimple-jobs

# 检查两个服务状态
sudo systemctl status clawsimple clawsimple-jobs
```

---

## 总结

| | `clawsimple.service` | `clawsimple-jobs.service` |
|--|--|--|
| **比喻** | 前台服务员（接待用户） | 后台管理员（执行内部指令） |
| **触发方** | Telegram 用户 | ClawSimple API（job 队列） |
| **操作对象** | LLM / Telegram | 本机文件系统、openclaw.json、systemd |
| **对外暴露** | Telegram Bot Token | DEPLOY_AGENT_TOKEN |
| **可独立运行** | 是 | 是（设计上必须如此） |
| **功能重叠** | ❌ 无 | ❌ 无 |
