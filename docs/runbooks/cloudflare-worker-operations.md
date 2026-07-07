# Cloudflare Worker 运维手册

本文记录 ClawSimple 仓库中新建、修改、部署独立 Cloudflare Worker 的流程。

这里的"独立 Worker"指 `runner-notify` 这类服务，有自己的 `wrangler.<name>.jsonc`、自己的入口文件和自己的部署命令。

## 当前 Worker

当前仓库已有一个独立 Worker：

| Worker | 配置文件 | 入口 | 域名 | 作用 |
| --- | --- | --- | --- | --- |
| `clawsimple-runner-notify` | `wrangler.runner-notify.jsonc` | `workers/runner-notify/src/index.js` | 按部署环境配置 | 接收 runner WebSocket，向在线 runner 推送任务通知 |

相关 npm script：

```bash
pnpm notify:dev
pnpm notify:deploy
pnpm notify:tail
```

这些 script 本质上只是指定了独立配置文件：

```bash
wrangler dev --config wrangler.runner-notify.jsonc
wrangler deploy --config wrangler.runner-notify.jsonc
wrangler tail --config wrangler.runner-notify.jsonc
```

## 新建 Worker

### 1. 建目录

建议目录结构：

```text
workers/<worker-name>/src/index.js
wrangler.<worker-name>.jsonc
```

例如：

```text
workers/runner-notify/src/index.js
wrangler.runner-notify.jsonc
```

入口文件使用 module Worker：

```js
const worker = {
  async fetch(request, env, ctx) {
    return new Response("ok");
  },
};

export default worker;
```

如果需要 Durable Object，在同一个入口文件中导出 class：

```js
export class ExampleRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    return new Response("ok");
  }
}
```

### 2. 写 Wrangler 配置

最小配置：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": "workers/<worker-name>/src/index.js",
  "name": "clawsimple-<worker-name>",
  "compatibility_date": "2026-05-03",
  "routes": [
    {
      "pattern": "<subdomain>.example.com",
      "custom_domain": true
    }
  ],
  "vars": {
    "CONTROL_PLANE_URL": "https://example.com"
  }
}
```

有 Durable Object 时加入：

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "EXAMPLE_ROOM",
        "class_name": "ExampleRoom"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["ExampleRoom"]
    }
  ]
}
```

规则：

- `name` 是 Cloudflare Worker 服务名，部署后会出现在 Cloudflare Workers 页面。
- `main` 指向 Worker 入口文件。
- `compatibility_date` 不要写未来日期。
- `routes[].custom_domain: true` 表示使用 Cloudflare Workers 自定义域名。
- 普通非敏感配置放 `vars`。
- secret 不写进配置文件，使用 `wrangler secret put`。

### 3. 加 package script

在 `package.json` 增加：

```json
{
  "scripts": {
    "<worker-name>:dev": "wrangler dev --config wrangler.<worker-name>.jsonc",
    "<worker-name>:deploy": "wrangler deploy --config wrangler.<worker-name>.jsonc",
    "<worker-name>:tail": "wrangler tail --config wrangler.<worker-name>.jsonc"
  }
}
```

### 4. 设置 secret

单个 secret：

```bash
printf '%s' "$SECRET_VALUE" | wrangler secret put SECRET_NAME --config wrangler.<worker-name>.jsonc
```

如果这个 secret 也需要给 Vercel 控制面使用，要同步 Vercel 生产环境变量：

```bash
printf '%s' "$SECRET_VALUE" | vercel env add SECRET_NAME production
```

如果 Vercel 已经有同名变量，先删再加：

```bash
vercel env rm SECRET_NAME production --yes
printf '%s' "$SECRET_VALUE" | vercel env add SECRET_NAME production
```

注意：

- 不要把 secret 写进 `wrangler.<name>.jsonc`。
- 不要在命令输出或文档里贴 secret 明文。
- 更新 Vercel 环境变量后，需要重新部署控制面，线上函数才会读到新值。

### 5. Dry run

首次部署前先 dry-run：

```bash
wrangler deploy --config wrangler.<worker-name>.jsonc --dry-run
```

确认输出里包含预期绑定，例如：

```text
env.EXAMPLE_ROOM (ExampleRoom) Durable Object
env.CONTROL_PLANE_URL Environment Variable
```

dry-run 只检查构建和上传包，不创建新版本。

### 6. 部署

```bash
pnpm <worker-name>:deploy
```

或直接：

```bash
wrangler deploy --config wrangler.<worker-name>.jsonc
```

部署成功后记录：

- Worker 名称
- custom domain
- Current Version ID
- 本次修改的 commit

### 7. 健康检查

每个 Worker 建议提供 `/health`：

```js
if (new URL(request.url).pathname === "/health") {
  return Response.json({ ok: true });
}
```

部署后验证：

```bash
curl -fsS https://<subdomain>.example.com/health
```

如果有鉴权接口，也要做一次不含 secret 的负向检查：

```bash
curl -i https://<subdomain>.example.com/protected-route
```

预期应返回 `401` 或 `403`，而不是 `200`。

## 修改已有 Worker

### 普通代码修改

1. 修改 `workers/<worker-name>/src/index.js`。
2. 本地语法检查：

```bash
node --check workers/<worker-name>/src/index.js
```

3. dry-run：

```bash
wrangler deploy --config wrangler.<worker-name>.jsonc --dry-run
```

4. 部署：

```bash
pnpm <worker-name>:deploy
```

5. 健康检查：

```bash
curl -fsS https://<subdomain>.example.com/health
```

6. 如有实时日志需要观察：

```bash
pnpm <worker-name>:tail
```

### 修改 vars

普通配置改 `wrangler.<worker-name>.jsonc` 的 `vars`。

改完后必须重新部署：

```bash
wrangler deploy --config wrangler.<worker-name>.jsonc --dry-run
pnpm <worker-name>:deploy
```

### 修改 secret

secret 不需要改代码，但需要用 Wrangler 写入：

```bash
printf '%s' "$NEW_SECRET_VALUE" | wrangler secret put SECRET_NAME --config wrangler.<worker-name>.jsonc
```

Cloudflare 会生成一个新 Worker 版本。写入后做一次依赖该 secret 的接口检查。

如果控制面也需要同一个 secret，同步 Vercel production env，并重新部署控制面。

### 修改 Durable Object class

如果只是修改 class 内部逻辑，不需要改 migration。

如果新增 Durable Object class：

```jsonc
{
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["OldRoom"]
    },
    {
      "tag": "v2",
      "new_sqlite_classes": ["NewRoom"]
    }
  ]
}
```

规则：

- migration 只能追加，不能改已经部署过的 tag。
- class 名改名相当于新 class，必须新增 migration。
- 绑定名可以按用途命名，例如 `RUNNER_NOTIFY_ROOM`。

### 修改 custom domain

改 `routes[].pattern`：

```jsonc
{
  "routes": [
    {
      "pattern": "new-subdomain.example.com",
      "custom_domain": true
    }
  ]
}
```

部署后检查：

```bash
curl -fsS https://new-subdomain.example.com/health
```

如果业务代码、Vercel env 或部署机器配置里保存了旧域名，也要同步更新。

## runner-notify 的实际部署过程

这次 `runner-notify` Worker 的流程是：

1. 新增入口文件：

```text
workers/runner-notify/src/index.js
```

2. 新增配置文件：

```text
wrangler.runner-notify.jsonc
```

关键配置：

```jsonc
{
  "main": "workers/runner-notify/src/index.js",
  "name": "clawsimple-runner-notify",
  "durable_objects": {
    "bindings": [
      {
        "name": "RUNNER_NOTIFY_ROOM",
        "class_name": "RunnerNotifyRoom"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["RunnerNotifyRoom"]
    }
  ],
  "routes": [
    {
      "pattern": "runner-notify.example.com",
      "custom_domain": true
    }
  ],
  "vars": {
    "CONTROL_PLANE_URL": "https://example.com"
  }
}
```

3. 加 npm script：

```json
{
  "notify:dev": "wrangler dev --config wrangler.runner-notify.jsonc",
  "notify:deploy": "wrangler deploy --config wrangler.runner-notify.jsonc",
  "notify:tail": "wrangler tail --config wrangler.runner-notify.jsonc"
}
```

4. 生成 `RUNNER_NOTIFY_SECRET`，并写入三处：

- `.env.production`
- Vercel production env
- Cloudflare Worker secret

Cloudflare 写入命令：

```bash
printf '%s' "$RUNNER_NOTIFY_SECRET" \
  | wrangler secret put RUNNER_NOTIFY_SECRET --config wrangler.runner-notify.jsonc
```

5. dry-run：

```bash
wrangler deploy --config wrangler.runner-notify.jsonc --dry-run
```

6. 部署：

```bash
pnpm notify:deploy
```

7. 健康检查：

```bash
curl -fsS https://runner-notify.example.com/health
```

8. notify endpoint 检查：

```bash
curl -fsS -X POST https://runner-notify.example.com/notify/codex-health-check \
  -H "authorization: Bearer ${RUNNER_NOTIFY_SECRET}" \
  -H "content-type: application/json" \
  -d '{"type":"job_available","job_id":"codex-health-check"}'
```

没有在线 runner 时，预期返回：

```json
{"ok":true,"delivered":0}
```

## 常见问题

### `wrangler secret put` 看起来没输出

如果使用管道输入 secret，命令可能没有明显交互输出。等命令结束后继续执行部署或接口检查即可。

### dry-run 成功但线上接口 404

dry-run 不部署。需要执行：

```bash
pnpm <worker-name>:deploy
```

### Worker 能部署，但控制面调用失败

检查三件事：

- 控制面的 env 是否有正确的 Worker URL。
- 控制面的 secret 是否和 Worker secret 一致。
- 控制面是否已经重新部署，读取到了新的 env。

### Durable Object 找不到 class

检查：

- 入口文件是否 `export class ClassName`。
- `wrangler.<name>.jsonc` 的 `class_name` 是否完全一致。
- migrations 是否包含该 class。

### 修改 Worker 后 runner 没变化

Worker 修改只影响 notify 通道。runner 本身的代码要通过控制面的 runner refresh 或安装脚本更新到部署机器上。

## 推送前检查

提交前至少运行：

```bash
node --check workers/<worker-name>/src/index.js
wrangler deploy --config wrangler.<worker-name>.jsonc --dry-run
pnpm lint
```

如果修改了控制面或安装脚本，再运行：

```bash
pnpm build
```
