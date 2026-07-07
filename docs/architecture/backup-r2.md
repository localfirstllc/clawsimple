# 加密备份至 Cloudflare R2（基于密码）

实现了一套实用的"重新部署前备份，重新部署后恢复"流程。

## 备份内容
- `/opt/clawsimple/data`（tar.gz）

## 加密方式
- Runner 使用用户提供的密码，通过 `openssl` 对压缩包进行加密：
  - `AES-256-CBC`
  - `PBKDF2`，参数 `-iter 200000` 和 `-salt`

## 所需环境变量
### R2（S3 兼容）
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

### Job Secret 封装（数据库静态存储）
- `DEPLOY_JOB_SECRET_KEY`
  - Base64 编码的 32 字节。
  - 用于加密存储在 `deployment_agent_job_secrets` 中的 job secret。

## 备注
- 这不是端到端加密：后端可以解密 job secret 并将其传递给 runner。
- 备份密码由 runner 通过一次性 API 获取，随后从数据库中删除。
