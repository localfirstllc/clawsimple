#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let sid = process.env.SID || "";
let token = process.env.DEPLOY_AGENT_TOKEN || "";
const apiBase = (process.env.CLAWSIMPLE_API_BASE_URL || "").replace(/\/+$/, "");
const installDir = process.env.CLAWSIMPLE_INSTALL_DIR || "/opt/clawsimple";
const hermesAgentDir = path.join(installDir, ".hermes-agent", "hermes-agent");
const hermesPythonPath = path.join(hermesAgentDir, "venv", "bin", "python");
const hermesNodeBinDir = path.join(hermesAgentDir, "node_modules", ".bin");
const clawsimpleAgentDir = path.join(installDir, ".clawsimple-agent");
const RUNNER_VERSION = "2026-06-10-runtime-hetzner-v1";
const RUNNER_LABEL = RUNNER_VERSION;
const RUNNER_CAPABILITIES = ["install_app", "backup_export", "backup_restore", "add_agent", "remove_agent", "runner_refresh", "telegram_profile_sync", "openclaw_upgrade", "hermes_upgrade"];
const runnerScriptPath = process.argv[1] || path.join(installDir, "bin", "skill-jobs-runner.mjs");
const GATEWAY_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
const FALLBACK_JOB_CLAIM_INTERVAL_MS = (() => {
  const raw = (process.env.RUNNER_FALLBACK_CLAIM_INTERVAL_MS || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
})();
const NOTIFY_CONNECTED_REMOTE_SYNC_INTERVAL_MS = (() => {
  const raw = (process.env.RUNNER_NOTIFY_CONNECTED_REMOTE_SYNC_INTERVAL_MS || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6 * 60 * 60 * 1000;
})();
const NOTIFY_CONNECTED_SAFETY_CLAIM_INTERVAL_MS = (() => {
  const raw = (process.env.RUNNER_NOTIFY_CONNECTED_SAFETY_CLAIM_INTERVAL_MS || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6 * 60 * 60 * 1000;
})();
const NOTIFY_RECONNECT_MAX_DELAY_MS = 5 * 60 * 1000;
const RUNNER_NOTIFY_URL = (process.env.RUNNER_NOTIFY_URL || defaultRunnerNotifyUrl(apiBase))
  .trim()
  .replace(/\/+$/, "");
const TELEGRAM_PROFILE_SYNC_INTERVAL_MS = (() => {
  const raw = (process.env.TELEGRAM_PROFILE_SYNC_INTERVAL_MS || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 1000;
})();
const PROVIDER_CONFIG_SYNC_INTERVAL_MS = (() => {
  const raw = (process.env.PROVIDER_CONFIG_SYNC_INTERVAL_MS || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10 * 60 * 1000;
})();
let gatewayHeartbeatLastCheckedAt = 0;
let gatewayHeartbeatRestartPolicy = "";
let gatewayHeartbeatServiceActive = null;
let gatewayHeartbeatLastSeenAt = "";
let telegramProfileSyncedAt = 0;
let providerConfigSyncedAt = 0;
let providerConfigSyncedHash = "";
let notifyConnectedRemoteSyncedAt = 0;
let notifyConnectedSafetyClaimedAt = 0;
const managedGatewayServiceName = (process.env.CLAWSIMPLE_SERVICE_NAME || "clawsimple").trim() || "clawsimple";

if (!apiBase) {
  process.exit(0);
}

function defaultRunnerNotifyUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === "clawsimple.com" || url.hostname.endsWith(".clawsimple.com")) {
      return "https://runner-notify.clawsimple.com";
    }
  } catch {
    return "";
  }
  return "";
}

function getDefaultPrimaryModel(config) {
  const defaultsModel = config?.agents?.defaults?.model;
  return typeof defaultsModel === "string"
    ? defaultsModel
    : defaultsModel && typeof defaultsModel === "object" && typeof defaultsModel.primary === "string"
      ? defaultsModel.primary
      : "";
}

function getManagedProviderId() {
  return (process.env.DEPLOY_PRESET_PROVIDER_ID || "clawsimple").trim().toLowerCase() || "clawsimple";
}

function resolveAgentModel(config, payload) {
  const explicit = typeof payload.model === "string" ? payload.model.trim() : "";
  if (explicit) {
    if (explicit.includes("/")) return explicit;
    const primary = getDefaultPrimaryModel(config);
    if (!primary.includes("/")) return `${getManagedProviderId()}/${explicit}`;
    const provider = primary.split("/")[0];
    if (!provider) return `${getManagedProviderId()}/${explicit}`;
    return `${provider}/${explicit}`;
  }

  const preset = typeof payload.model_preset === "string" ? payload.model_preset.trim() : "";
  if (!preset) return "";
  if (payload?.ai_source === "managed") {
    const payloadProvider =
      typeof payload.managed_openai_provider === "string"
        ? payload.managed_openai_provider.trim().toLowerCase()
        : "";
    const managedProvider = payloadProvider || getManagedProviderId();
    if (preset.startsWith(`${managedProvider}/`)) return preset;
    return `${managedProvider}/${preset}`;
  }

  const primary = getDefaultPrimaryModel(config);
  if (!primary.includes("/")) return preset;
  const provider = primary.split("/")[0];
  if (!provider) return preset;
  if (preset.startsWith(`${provider}/`)) return preset;
  return `${provider}/${preset}`;
}

function buildAuthHeaders() {
  const runnerRevision = getLocalRunnerRevisionSync();
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-clawsimple-agent": "deploy-agent",
    "x-clawsimple-runner-revision": runnerRevision,
    "x-clawsimple-runner-label": RUNNER_LABEL,
    "x-clawsimple-runner-version": RUNNER_VERSION,
    "x-clawsimple-runner-capabilities": RUNNER_CAPABILITIES.join(","),
  };
  if (gatewayHeartbeatLastSeenAt) {
    headers["x-clawsimple-gateway-last-seen-at"] = gatewayHeartbeatLastSeenAt;
  }
  if (gatewayHeartbeatRestartPolicy) {
    headers["x-clawsimple-gateway-restart-policy"] = gatewayHeartbeatRestartPolicy;
  }
  if (typeof gatewayHeartbeatServiceActive === "boolean") {
    headers["x-clawsimple-gateway-active"] = String(gatewayHeartbeatServiceActive);
  }
  return headers;
}

function getRunnerRevisionFromScript(script = "") {
  const digest = createHash("sha256").update(script, "utf8").digest("hex");
  return `sha256:${digest}`;
}

function getLocalRunnerRevisionSync() {
  try {
    const localScript = readFileSync(runnerScriptPath, "utf8");
    if (!localScript.trim()) return "";
    return getRunnerRevisionFromScript(localScript);
  } catch {
    return "";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRunnerNotifyConnectUrl() {
  const configured = RUNNER_NOTIFY_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
      url.pathname = "/connect";
      url.search = "";
      url.searchParams.set("sid", sid);
      return url.toString();
    } catch {
      return "";
    }
  }

  if (!apiBase) return "";
  try {
    const controlPlane = new URL(apiBase);
    if (controlPlane.hostname === "clawsimple.com" || controlPlane.hostname === "www.clawsimple.com") {
      return `wss://runner-notify.clawsimple.com/connect?sid=${encodeURIComponent(sid)}`;
    }
  } catch {
    return "";
  }
  return "";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildAuthHeaders(),
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  let data = {};
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    data = {};
  }
  return { ok: response.ok, status: response.status, data };
}

async function fetchJobSecret(jobId, expectedKind) {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await requestJson(
      `${apiBase}/api/deploy/${encodeURIComponent(sid)}/runner/jobs/${encodeURIComponent(jobId)}/secret`,
      { method: "GET" }
    );
    if (!result.ok) {
      if (result.status === 404 && attempt < maxAttempts) {
        await sleep(500);
        continue;
      }
      throw new Error(`secret fetch failed status=${result.status}`);
    }
    const kind = typeof result.data.kind === "string" ? result.data.kind : "";
    const value = typeof result.data.value === "string" ? result.data.value : "";
    if (!value) {
      throw new Error("secret missing value");
    }
    if (expectedKind && kind !== expectedKind) {
      throw new Error(`secret kind mismatch expected=${expectedKind} got=${kind}`);
    }
    return value;
  }
  throw new Error("secret fetch failed after retries");
}

function buildPrivilegedShell(command) {
  const quotedCommand = `'${String(command ?? "").replace(/'/g, `'\\''`)}'`;
  return (
    "if [ \"$(id -u)\" -eq 0 ]; then bash -lc " +
    quotedCommand +
    "; elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then sudo bash -lc " +
    quotedCommand +
    "; else exit 12; fi"
  );
}

async function ensurePrivilegedSystemdAccess() {
  await runShell(
    buildPrivilegedShell("command -v systemctl >/dev/null 2>&1 && systemctl --version >/dev/null 2>&1")
  );
}

async function enableAndRestartSystemdUnit(unitName) {
  const unitFileName = `${unitName}.service`;
  await runShell(
    buildPrivilegedShell(
      `systemctl enable ${shellQuote(unitFileName)} >/dev/null 2>&1 || true; ` +
        `systemctl restart ${shellQuote(unitFileName)}`
    )
  );
}

async function ensureSystemdUnitHealthy(unitName) {
  const unitFileName = `${unitName}.service`;
  await runShell(
    buildPrivilegedShell(`systemctl is-active --quiet ${shellQuote(unitFileName)}`)
  );
}

function resolveBindingAgentId(bindings, accountId) {
  if (!Array.isArray(bindings) || !accountId) return "";
  for (const item of bindings) {
    if (!item || typeof item !== "object") continue;
    const legacyMatch =
      item.match && typeof item.match === "object" ? item.match : null;
    const legacyChannel =
      legacyMatch && typeof legacyMatch.channel === "string" ? legacyMatch.channel.trim() : "";
    const legacyAccountId =
      legacyMatch && typeof legacyMatch.accountId === "string"
        ? legacyMatch.accountId.trim()
        : "";
    const legacyAgentId = typeof item.agentId === "string" ? item.agentId.trim() : "";
    if (legacyChannel === "telegram" && legacyAccountId === accountId && legacyAgentId) {
      return legacyAgentId;
    }

    const source = item.source && typeof item.source === "object" ? item.source : null;
    const target = item.target && typeof item.target === "object" ? item.target : null;
    const sourceChannel =
      source && typeof source.channel === "string" ? source.channel.trim() : "";
    const sourceAccountId =
      source && typeof source.accountId === "string" ? source.accountId.trim() : "";
    const targetAgentId =
      target && typeof target.agentId === "string" ? target.agentId.trim() : "";
    if (sourceChannel === "telegram" && sourceAccountId === accountId && targetAgentId) {
      return targetAgentId;
    }
  }
  return "";
}

async function fetchTelegramProfile(botToken) {
  if (!botToken) return null;
  let timer = null;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body?.ok || !body.result || typeof body.result !== "object") return null;
    const firstName =
      typeof body.result.first_name === "string" ? body.result.first_name.trim() : "";
    const username =
      typeof body.result.username === "string" ? body.result.username.trim() : "";
    return {
      first_name: firstName || "",
      username: username || "",
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function maybeSyncTelegramProfiles(force = false) {
  if (!sid || !token) return;
  const now = Date.now();
  if (!force && now - telegramProfileSyncedAt < TELEGRAM_PROFILE_SYNC_INTERVAL_MS) {
    return;
  }
  telegramProfileSyncedAt = now;

  const configPath = path.join(installDir, ".openclaw", "openclaw.json");
  let config = null;
  try {
    const raw = await readFile(configPath, "utf8");
    config = JSON.parse(raw);
  } catch {
    return;
  }
  if (!config || typeof config !== "object") return;

  const telegram = config?.channels?.telegram;
  if (!telegram || typeof telegram !== "object") return;

  const profiles = [];
  const bindings = Array.isArray(config.bindings) ? config.bindings : [];

  const defaultToken =
    typeof telegram.botToken === "string" ? telegram.botToken.trim() : "";
  if (defaultToken) {
    const profile = await fetchTelegramProfile(defaultToken);
    if (profile) {
      profiles.push({
        account_id: "main",
        agent_id: "main",
        first_name: profile.first_name,
        username: profile.username,
      });
    }
  }

  const accounts =
    telegram.accounts &&
    typeof telegram.accounts === "object" &&
    !Array.isArray(telegram.accounts)
      ? telegram.accounts
      : {};
  for (const [accountId, accountConfig] of Object.entries(accounts)) {
    if (!accountConfig || typeof accountConfig !== "object") continue;
    const botToken =
      typeof accountConfig.botToken === "string" ? accountConfig.botToken.trim() : "";
    if (!botToken) continue;
    const profile = await fetchTelegramProfile(botToken);
    if (!profile) continue;
    const mappedAgentId = resolveBindingAgentId(bindings, accountId) || accountId;
    profiles.push({
      account_id: accountId,
      agent_id: mappedAgentId,
      first_name: profile.first_name,
      username: profile.username,
    });
  }

  if (profiles.length === 0) return;
  const syncResult = await requestJson(
    `${apiBase}/api/deploy/${encodeURIComponent(sid)}/runner/telegram/sync`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profiles }),
    }
  );
  if (!syncResult.ok) {
    log(`telegram profile sync failed status=${syncResult.status}`);
  }
}

function parseEnvValue(raw = "") {
  let current = raw.trim();
  if (!current) return "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!current) return "";
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === "string") {
        const normalized = parsed.trim();
        if (normalized !== current) {
          current = normalized;
          continue;
        }
      }
    } catch {}

    if (
      (current.startsWith('"') && current.endsWith('"')) ||
      (current.startsWith("'") && current.endsWith("'"))
    ) {
      current = current.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return current;
}

function readEnvKey(content = "", key = "") {
  if (!content || !key) return "";
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const lineKey = trimmed
      .slice(0, idx)
      .trim()
      .replace(/^export\s+/, "");
    if (lineKey !== key) continue;
    return parseEnvValue(trimmed.slice(idx + 1));
  }
  return "";
}

const BACKUP_RESTORE_ENV_MODES = new Set(["merge", "restore", "skip"]);
const BACKUP_RESTORE_DEFAULT_ENV_MODE = "merge";
const BACKUP_RESTORE_PROTECTED_ENV_KEYS = [
  "SID",
  "DEPLOY_AGENT_TOKEN",
  "CLAWSIMPLE_API_BASE_URL",
  "EXA_BASE_URL",
  "SEARXNG_BASE_URL",
  "SEARXNG_URL",
  "FIRECRAWL_BASE_URL",
  "MAILGUN_API_KEY",
  "MAILGUN_BACKUP_EMAIL",
  "PRESET_PROXY_BASE_URL",
  "PRESET_PROXY_MODEL",
  "PRESET_PROXY_MODELS",
  "PRESET_PROXY_API_KEY",
];

function normalizeBackupRestoreEnvMode(value) {
  const mode = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (BACKUP_RESTORE_ENV_MODES.has(mode)) return mode;
  return BACKUP_RESTORE_DEFAULT_ENV_MODE;
}

async function maybeSyncProviderConfig(force = false) {
  if (!sid || !token) return;
  const now = Date.now();
  if (!force && now - providerConfigSyncedAt < PROVIDER_CONFIG_SYNC_INTERVAL_MS) {
    return;
  }

  const appEnvPath = path.join(installDir, ".env.app");
  let envRaw = "";
  try {
    envRaw = await readFile(appEnvPath, "utf8");
  } catch {
    return;
  }

  const exaBaseUrl = readEnvKey(envRaw, "EXA_BASE_URL") || null;
  const payload = {
    exa_base_url: exaBaseUrl,
    mailgun_api_key: readEnvKey(envRaw, "MAILGUN_API_KEY") || null,
    mailgun_backup_email: readEnvKey(envRaw, "MAILGUN_BACKUP_EMAIL") || null,
    mailgun_inbox_address: readEnvKey(envRaw, "MAILGUN_INBOX_ADDRESS") || null,
    mailgun_domain: readEnvKey(envRaw, "MAILGUN_DOMAIN") || null,
    mailgun_agent_id: readEnvKey(envRaw, "MAILGUN_AGENT_ID") || null,
    mailgun_telegram_target: readEnvKey(envRaw, "MAILGUN_TELEGRAM_TARGET") || null,
    preset_proxy_base_url: readEnvKey(envRaw, "PRESET_PROXY_BASE_URL") || null,
    preset_proxy_model: readEnvKey(envRaw, "PRESET_PROXY_MODEL") || null,
    preset_proxy_models: readEnvKey(envRaw, "PRESET_PROXY_MODELS") || null,
    preset_proxy_api_key: readEnvKey(envRaw, "PRESET_PROXY_API_KEY") || null,
  };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  if (!force && hash === providerConfigSyncedHash) {
    providerConfigSyncedAt = now;
    return;
  }

  const syncResult = await requestJson(
    `${apiBase}/api/deploy/${encodeURIComponent(sid)}/runner/config/sync`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!syncResult.ok) {
    log(`provider config sync failed status=${syncResult.status}`);
    return;
  }
  providerConfigSyncedHash = hash;
  providerConfigSyncedAt = now;
}

async function maybeSyncGatewayHeartbeat(force = false) {
  const now = Date.now();
  if (!force && now - gatewayHeartbeatLastCheckedAt < GATEWAY_HEARTBEAT_INTERVAL_MS) {
    return;
  }

  const command =
    "set -euo pipefail; " +
    `service=${JSON.stringify(managedGatewayServiceName)}; ` +
    'if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then prefix="sudo -n "; else prefix=""; fi; ' +
    'restart="$(${prefix}systemctl show "$service" -p Restart --value 2>/dev/null || true)"; ' +
    'active="$(${prefix}systemctl is-active "$service" 2>/dev/null || true)"; ' +
    'printf "restart=%s\\n" "$restart"; ' +
    'printf "active=%s\\n" "$active"';

  try {
    const { stdout } = await runShell(command);
    const lines = (stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = {};
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      parsed[line.slice(0, idx)] = line.slice(idx + 1);
    }
    gatewayHeartbeatRestartPolicy =
      typeof parsed.restart === "string" ? parsed.restart.trim() : "";
    gatewayHeartbeatServiceActive =
      typeof parsed.active === "string" ? parsed.active.trim() === "active" : null;
    gatewayHeartbeatLastSeenAt = new Date(now).toISOString();
    gatewayHeartbeatLastCheckedAt = now;
  } catch (error) {
    log(`gateway heartbeat check failed: ${String(error ?? "")}`);
  }
}

function log(message) {
  const ts = new Date().toISOString();
  console.log(`[jobs] ${ts} ${message}`);
}

function shellQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

async function runShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", command], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(stderr.trim() || stdout.trim() || `command failed (${code})`)
        );
      }
    });
    child.on("error", reject);
  });
}

async function runShellWithTimeout(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", command], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("command timed out"));
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `command failed (${code})`));
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SERVICE_NAME_PATTERN = /^clawsimple[A-Za-z0-9_.@-]{0,50}$/;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const OPENCLAW_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const OPENCLAW_UPGRADE_MIN_FREE_MB = (() => {
  const raw = (process.env.OPENCLAW_UPGRADE_MIN_FREE_MB || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4096;
})();
const OPENCLAW_RUNTIME_DEPS_KEEP = (() => {
  const raw = (process.env.OPENCLAW_RUNTIME_DEPS_KEEP || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2;
})();

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function tryReadOpenClawVersion() {
  try {
    const out = await runShell("set -euo pipefail; openclaw --version");
    return (out.stdout || out.stderr || "").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

async function tryReadHermesAgentVersion() {
  const python = shellQuote(hermesPythonPath);
  const hermesBin = shellQuote(path.join(path.dirname(hermesPythonPath), "hermes"));
  const command = `
set -euo pipefail
if [ -x ${hermesBin} ]; then
  ${hermesBin} --version 2>/dev/null || ${hermesBin} version 2>/dev/null || true
elif [ -x ${python} ]; then
  ${python} -m hermes_cli.main --version 2>/dev/null || ${python} -m hermes_cli.main version 2>/dev/null || true
fi
`;
  try {
    const out = await runShell(command);
    return (out.stdout || out.stderr || "").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function parseDiskUsageLine(line) {
  const parts = String(line || "").trim().split(/\s+/);
  if (parts.length < 6) return null;
  const sizeMb = Number.parseInt(parts[1], 10);
  const usedMb = Number.parseInt(parts[2], 10);
  const availableMb = Number.parseInt(parts[3], 10);
  const usePercent = Number.parseInt(parts[4].replace(/%$/, ""), 10);
  if (
    !Number.isFinite(sizeMb) ||
    !Number.isFinite(usedMb) ||
    !Number.isFinite(availableMb)
  ) {
    return null;
  }
  return {
    filesystem: parts[0],
    size_mb: sizeMb,
    used_mb: usedMb,
    available_mb: availableMb,
    use_percent: Number.isFinite(usePercent) ? usePercent : null,
    mount: parts.slice(5).join(" "),
  };
}

async function readRootDiskUsage() {
  const out = await runShell("set -euo pipefail; df -Pm / | tail -n 1");
  const parsed = parseDiskUsageLine(out.stdout);
  if (!parsed) {
    throw new Error("failed to parse disk usage");
  }
  return parsed;
}

function buildOpenClawDiskCleanupScript() {
  const installDirQuoted = shellQuote(installDir);
  const keep = Math.max(1, OPENCLAW_RUNTIME_DEPS_KEEP);
  return `
set -euo pipefail
deleted_count=0
cleanup_runtime_deps() {
  base="$1"
  [ -d "$base" ] || return 0
  i=0
  list_file="/tmp/openclaw-runtime-deps.$$.$RANDOM"
  find "$base" -mindepth 1 -maxdepth 1 -type d -name 'openclaw-*' -printf '%T@ %p\\n' 2>/dev/null \
    | sort -rn \
    | sed 's/^[^ ]* //' > "$list_file"
  while IFS= read -r dir; do
    i=$((i + 1))
    if [ "$i" -le ${keep} ]; then
      continue
    fi
    case "$dir" in
      "$base"/openclaw-*) rm -rf -- "$dir"; deleted_count=$((deleted_count + 1));;
    esac
  done < "$list_file"
  rm -f -- "$list_file"
}
cleanup_runtime_deps /root/.openclaw/plugin-runtime-deps
cleanup_runtime_deps ${installDirQuoted}/.openclaw/plugin-runtime-deps
rm -rf /root/.npm/_cacache /root/.npm/_npx /root/.cache/ms-playwright /root/.cache/camoufox /root/.cache/uv || true
rm -rf ${installDirQuoted}/.npm/_cacache ${installDirQuoted}/.npm/_npx ${installDirQuoted}/.cache/puppeteer || true
if command -v npm >/dev/null 2>&1; then npm cache clean --force >/dev/null 2>&1 || true; fi
if command -v apt-get >/dev/null 2>&1; then apt-get clean >/dev/null 2>&1 || true; fi
if command -v journalctl >/dev/null 2>&1; then journalctl --vacuum-size=200M >/dev/null 2>&1 || true; fi
df -Pm / | tail -n 1
printf 'deleted_runtime_dirs=%s\\n' "$deleted_count"
`;
}

async function cleanupOpenClawUpgradeDisk() {
  const out = await runShell(buildPrivilegedShell(buildOpenClawDiskCleanupScript()));
  const lines = out.stdout.trim().split(/\r?\n/).filter(Boolean);
  const disk = parseDiskUsageLine(lines.find((line) => line.includes(" /")) || "");
  const deletedRuntimeDirsLine = lines.find((line) =>
    line.startsWith("deleted_runtime_dirs=")
  );
  const deletedRuntimeDirs = Number.parseInt(
    deletedRuntimeDirsLine?.split("=")[1] || "0",
    10
  );
  return {
    disk,
    deleted_runtime_dirs: Number.isFinite(deletedRuntimeDirs) ? deletedRuntimeDirs : 0,
  };
}

async function prepareOpenClawUpgradeDisk() {
  const before = await readRootDiskUsage();
  const cleanup = await cleanupOpenClawUpgradeDisk();
  const afterCleanup = cleanup.disk || (await readRootDiskUsage());
  if (afterCleanup.available_mb < OPENCLAW_UPGRADE_MIN_FREE_MB) {
    throw new Error(
      `disk_space_low: available_mb=${afterCleanup.available_mb} required_mb=${OPENCLAW_UPGRADE_MIN_FREE_MB}`
    );
  }
  return {
    before,
    after_cleanup: afterCleanup,
    deleted_runtime_dirs: cleanup.deleted_runtime_dirs,
    required_free_mb: OPENCLAW_UPGRADE_MIN_FREE_MB,
  };
}

function normalizeServiceName(payload) {
  const raw = typeof payload.service_name === "string" ? payload.service_name.trim() : "";
  if (!raw) return "clawsimple";
  if (!SERVICE_NAME_PATTERN.test(raw)) {
    throw new Error("service_name must match /^clawsimple[A-Za-z0-9_.@-]{0,50}$/");
  }
  return raw;
}

function normalizeTargetRuntime(payload) {
  const raw =
    typeof payload.target_runtime === "string"
      ? payload.target_runtime.trim().toLowerCase()
      : typeof payload.runtime === "string"
        ? payload.runtime.trim().toLowerCase()
        : "";
  if (raw !== "openclaw" && raw !== "hermes") {
    throw new Error("target_runtime must be openclaw or hermes");
  }
  return raw;
}

function getHermesAgentServiceName(agentId) {
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new Error("agent_id is invalid");
  }
  return `hermes-gateway-${agentId}`;
}

function getAgentRuntimeStatePath(agentId) {
  return path.join(clawsimpleAgentDir, "runtime-agents", `${agentId}.json`);
}

async function mergeAgentRuntimeState(agentId, fields) {
  const statePath = getAgentRuntimeStatePath(agentId);
  const current = await readJsonFileOrDefault(statePath, {});
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(
    statePath,
    `${JSON.stringify(
      {
        ...(isPlainObject(current) ? current : {}),
        ...fields,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function ensureOpenClawTelegramPluginState(config, enabled) {
  if (!config.plugins || typeof config.plugins !== "object" || Array.isArray(config.plugins)) {
    config.plugins = {};
  }
  if (
    !config.plugins.entries ||
    typeof config.plugins.entries !== "object" ||
    Array.isArray(config.plugins.entries)
  ) {
    config.plugins.entries = {};
  }
  if (
    !config.plugins.entries.telegram ||
    typeof config.plugins.entries.telegram !== "object" ||
    Array.isArray(config.plugins.entries.telegram)
  ) {
    config.plugins.entries.telegram = {};
  }
  config.plugins.entries.telegram.enabled = enabled;
  for (const pluginId of ["device-pair", "phone-control", "bonjour"]) {
    if (
      !config.plugins.entries[pluginId] ||
      typeof config.plugins.entries[pluginId] !== "object" ||
      Array.isArray(config.plugins.entries[pluginId])
    ) {
      config.plugins.entries[pluginId] = {};
    }
    config.plugins.entries[pluginId].enabled = false;
  }
  if (!config.discovery || typeof config.discovery !== "object" || Array.isArray(config.discovery)) {
    config.discovery = {};
  }
  if (
    !config.discovery.mdns ||
    typeof config.discovery.mdns !== "object" ||
    Array.isArray(config.discovery.mdns)
  ) {
    config.discovery.mdns = {};
  }
  config.discovery.mdns.mode = "off";
}

function redactTelegramSecrets(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value || null;
  const next = { ...value };
  delete next.botToken;
  delete next.telegramBotToken;
  delete next.telegram_bot_token;
  return next;
}

function extractTelegramAllowedUsers(accountConfig, fallbackTelegram) {
  const values = [];
  const pushValues = (items) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const raw = typeof item === "string" ? item.trim() : "";
      if (!raw) continue;
      const normalized = raw.startsWith("tg:") ? raw.slice(3).trim() : raw;
      if (normalized && !values.includes(normalized)) values.push(normalized);
    }
  };
  pushValues(accountConfig?.allowFrom);
  pushValues(accountConfig?.groupAllowFrom);
  pushValues(fallbackTelegram?.allowFrom);
  pushValues(fallbackTelegram?.groupAllowFrom);
  return values;
}

function resolveOpenClawAgentModel(config, agentId, payloadModel = "") {
  const explicit = typeof payloadModel === "string" ? payloadModel.trim() : "";
  const providers =
    config?.models?.providers &&
    typeof config.models.providers === "object" &&
    !Array.isArray(config.models.providers)
      ? config.models.providers
      : {};
  if (explicit) {
    const explicitProvider = explicit.includes("/") ? explicit.split("/")[0]?.trim() || "" : "";
    if (explicitProvider && providers[explicitProvider]) return explicit;
  }
  const agents = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const agent = agents.find((item) => item && typeof item === "object" && item.id === agentId);
  const agentModel = typeof agent?.model === "string" ? agent.model.trim() : "";
  if (agentModel) return agentModel;
  const defaultModel = config?.agents?.defaults?.model;
  const defaultPrimary =
    typeof defaultModel === "string"
      ? defaultModel.trim()
      : typeof defaultModel?.primary === "string"
        ? defaultModel.primary.trim()
        : "";
  if (defaultPrimary) return defaultPrimary;
  throw new Error("default agent model is not configured");
}

function resolveProviderModelForHermes(config, fullModel) {
  const normalized = typeof fullModel === "string" ? fullModel.trim() : "";
  const providerId = normalized.includes("/") ? normalized.split("/")[0].trim() : "";
  const modelId = providerId ? normalized.split("/").slice(1).join("/").trim() : normalized;
  const providers =
    config?.models?.providers &&
    typeof config.models.providers === "object" &&
    !Array.isArray(config.models.providers)
      ? config.models.providers
      : {};
  const provider =
    providerId && providers[providerId] && typeof providers[providerId] === "object"
      ? providers[providerId]
      : null;
  if (!provider) {
    throw new Error(`model provider ${providerId || "default"} is not configured`);
  }
  const baseUrl = typeof provider.baseUrl === "string" ? provider.baseUrl.trim() : "";
  const apiKeyRef = typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
  const providerModels = Array.isArray(provider.models)
    ? provider.models
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object" && typeof item.id === "string") {
            return item.id.trim();
          }
          return "";
        })
        .filter(Boolean)
    : [];
  if (!baseUrl) throw new Error(`model provider ${providerId} has no baseUrl`);
  if (!modelId) throw new Error("agent model is empty");
  return { providerId, modelId, baseUrl, apiKeyRef, providerModels };
}

function resolveEnvReference(value, envRaw) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const match = trimmed.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (!match) return trimmed;
  return readEnvKey(envRaw, match[1]);
}

function buildHermesConfigYaml(params) {
  const providerId =
    typeof params.providerId === "string" && params.providerId.trim()
      ? params.providerId.trim()
      : "custom";
  const providerModels = Array.isArray(params.providerModels)
    ? params.providerModels.filter((item) => typeof item === "string" && item.trim())
    : [];
  const lines = [
    "model:",
    `  default: ${JSON.stringify(params.model)}`,
    `  provider: ${JSON.stringify(providerId)}`,
    `  base_url: ${JSON.stringify(params.baseUrl)}`,
  ];
  if (providerId !== "custom" && providerModels.length > 0) {
    lines.push(
      "providers:",
      `  ${providerId}:`,
      "    name: ClawSimple Managed",
      `    base_url: ${JSON.stringify(params.baseUrl)}`,
      "    key_env: OPENAI_API_KEY",
      `    default_model: ${JSON.stringify(params.model)}`,
      "    discover_models: false",
      "    models:",
    );
    for (const modelId of providerModels) {
      lines.push(`      ${JSON.stringify(modelId)}: {}`);
    }
  }
  if (params.webBackend) {
    lines.push(
      "web:",
      `  backend: ${JSON.stringify(params.webBackend)}`
    );
  }
  lines.push(
    "group_sessions_per_user: true",
    "streaming:",
    "  enabled: false",
    "terminal:",
    "  backend: local",
    "  cwd: .",
    "  timeout: 180",
    "agent:",
    "  max_turns: 60",
    "  verbose: false",
    "",
  );
  return lines.join("\n");
}

function readHermesPreparedRuntime(agentId) {
  const hermesHome = path.join(installDir, ".hermes", agentId);
  return Promise.all([
    readFile(path.join(hermesHome, "config.yaml"), "utf8"),
    readFile(path.join(hermesHome, ".env"), "utf8"),
  ]).then(([configRaw, envRaw]) => {
    const modelMatch = configRaw.match(/^\s*default:\s*(.+?)\s*$/m);
    const providerMatch = configRaw.match(/^\s*provider:\s*(.+?)\s*$/m);
    const baseUrlMatch = configRaw.match(/^\s*base_url:\s*(.+?)\s*$/m);
    const parseYamlScalar = (value = "") => {
      const trimmed = value.trim();
      if (!trimmed) return "";
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed.replace(/^['"]|['"]$/g, "");
      }
    };
    const telegramBotToken = readEnvKey(envRaw, "TELEGRAM_BOT_TOKEN");
    const apiKey = readEnvKey(envRaw, "OPENAI_API_KEY");
    if (!telegramBotToken) {
      throw new Error(`Hermes runtime for agent ${agentId} is missing TELEGRAM_BOT_TOKEN`);
    }
    if (!apiKey) {
      throw new Error(`Hermes runtime for agent ${agentId} is missing OPENAI_API_KEY`);
    }
    const model = parseYamlScalar(modelMatch?.[1] || "");
    const providerId = parseYamlScalar(providerMatch?.[1] || "");
    const baseUrl = parseYamlScalar(baseUrlMatch?.[1] || "");
    if (!model) {
      throw new Error(`Hermes runtime for agent ${agentId} is missing model.default`);
    }
    return { hermesHome, hermesModel: model, providerId, baseUrl };
  });
}

async function disableDefaultHermesGatewayUnit(activeServiceName = "", legacyServiceName = "") {
  const units = ["hermes-gateway", legacyServiceName]
    .filter(Boolean)
    .filter((unitName, index, items) => items.indexOf(unitName) === index)
    .filter((unitName) => unitName !== activeServiceName);
  if (units.length === 0) return;
  const commands = units.flatMap((unitName) => {
    const unit = `${unitName}.service`;
    return [
      `systemctl disable --now ${shellQuote(unit)} >/dev/null 2>&1 || true`,
      `systemctl reset-failed ${shellQuote(unit)} >/dev/null 2>&1 || true`,
    ];
  });
  await runShell(
    buildPrivilegedShell(
      commands.join("; ")
    )
  );
}

async function discoverHermesGatewayServiceName(hermesHome, preferredServiceName = "") {
  const script = `
set -euo pipefail
expected=${shellQuote(hermesHome)}
preferred=${shellQuote(preferredServiceName)}
unit_env() {
  systemctl show "$1" -p Environment --value 2>/dev/null | tr ' ' '\\n' | awk -F= '$1 == "HERMES_HOME" {print $2; exit}'
}
unit_state() { systemctl is-active "$1" 2>/dev/null || true; }
unit_enabled() { systemctl is-enabled "$1" 2>/dev/null || true; }
service_name() {
  local unit="$1"
  unit="\${unit%.service}"
  printf '%s' "$unit"
}
if [ -n "$preferred" ]; then
  preferred_unit="$preferred.service"
  preferred_home="$(unit_env "$preferred_unit")"
  if [ "$preferred_home" = "$expected" ] && [ "$(unit_state "$preferred_unit")" = "active" ]; then
    service_name "$preferred_unit"
    exit 0
  fi
fi
active_match=""
enabled_match=""
first_match=""
while read -r unit _; do
  [ -n "$unit" ] || continue
  home="$(unit_env "$unit")"
  [ "$home" = "$expected" ] || continue
  state="$(unit_state "$unit")"
  enabled="$(unit_enabled "$unit")"
  if [ "$state" = "active" ] && [ "$enabled" = "enabled" ]; then
    service_name "$unit"
    exit 0
  fi
  if [ "$state" = "active" ] && [ -z "$active_match" ]; then active_match="$unit"; fi
  if [ "$enabled" = "enabled" ] && [ -z "$enabled_match" ]; then enabled_match="$unit"; fi
  if [ -z "$first_match" ]; then first_match="$unit"; fi
done < <(systemctl list-unit-files 'hermes-gateway*.service' --no-legend --no-pager 2>/dev/null || true)
if [ -n "$active_match" ]; then service_name "$active_match"; exit 0; fi
if [ -n "$enabled_match" ]; then service_name "$enabled_match"; exit 0; fi
if [ -n "$first_match" ]; then service_name "$first_match"; exit 0; fi
printf '%s' "$preferred"
`;
  const out = await runShell(buildPrivilegedShell(script));
  return out.stdout.trim() || preferredServiceName;
}

async function installOfficialHermesGatewayService(hermesHome, legacyServiceName) {
  const installScript = `
set -euo pipefail
test -x ${shellQuote(hermesPythonPath)}
mkdir -p ${shellQuote(hermesHome)} ${shellQuote(path.join(installDir, ".config"))} ${shellQuote(
    path.join(installDir, ".cache")
  )} ${shellQuote(path.join(installDir, ".local", "share"))}
chown -R clawsimple:clawsimple ${shellQuote(hermesHome)} ${shellQuote(hermesAgentDir)} ${shellQuote(
    path.join(installDir, ".config")
  )} ${shellQuote(path.join(installDir, ".cache"))} ${shellQuote(path.join(installDir, ".local"))}
env \\
  HOME=${shellQuote(installDir)} \\
  HERMES_HOME=${shellQuote(hermesHome)} \\
  XDG_CONFIG_HOME=${shellQuote(path.join(installDir, ".config"))} \\
  XDG_CACHE_HOME=${shellQuote(path.join(installDir, ".cache"))} \\
  XDG_DATA_HOME=${shellQuote(path.join(installDir, ".local", "share"))} \\
  PATH=${shellQuote(`${path.dirname(hermesPythonPath)}:${hermesNodeBinDir}:${path.join(installDir, ".local", "bin")}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`)} \\
  VIRTUAL_ENV=${shellQuote(path.join(hermesAgentDir, "venv"))} \\
  ${shellQuote(hermesPythonPath)} -m hermes_cli.main gateway install --system --run-as-user clawsimple --force
chown -R clawsimple:clawsimple ${shellQuote(hermesHome)} ${shellQuote(hermesAgentDir)} ${shellQuote(
    path.join(installDir, ".config")
  )} ${shellQuote(path.join(installDir, ".cache"))} ${shellQuote(path.join(installDir, ".local"))}
systemctl daemon-reload
`;
  await runShell(buildPrivilegedShell(installScript));
  await disableDefaultHermesGatewayUnit("", legacyServiceName);
  const serviceName = await discoverHermesGatewayServiceName(hermesHome, legacyServiceName);
  await disableDefaultHermesGatewayUnit(serviceName, legacyServiceName);
  await enableAndRestartSystemdUnit(serviceName);
  await ensureSystemdUnitHealthy(serviceName);
  return serviceName;
}

function buildHermesEnv(params) {
  const lines = [
    "TERMINAL_MODAL_IMAGE=nikolaik/python-nodejs:python3.11-nodejs20",
    "TERMINAL_TIMEOUT=60",
    "TERMINAL_LIFETIME_SECONDS=300",
    `TELEGRAM_BOT_TOKEN=${JSON.stringify(params.telegramBotToken)}`,
    `TELEGRAM_ALLOWED_USERS=${JSON.stringify(params.allowedUsers.join(","))}`,
    `OPENAI_BASE_URL=${JSON.stringify(params.baseUrl)}`,
    `OPENAI_API_KEY=${JSON.stringify(params.apiKey)}`,
    `HERMES_MODEL=${JSON.stringify(params.model)}`,
  ];
  if (params.searxngBaseUrl) {
    lines.push(
      `SEARXNG_BASE_URL=${JSON.stringify(params.searxngBaseUrl)}`,
      `SEARXNG_URL=${JSON.stringify(params.searxngBaseUrl)}`
    );
  } else if (params.managedWebBaseUrl && params.managedWebToken) {
    lines.push(
      `FIRECRAWL_API_URL=${JSON.stringify(params.managedWebBaseUrl)}`,
      `FIRECRAWL_API_KEY=${JSON.stringify(params.managedWebToken)}`
    );
  }
  lines.push(
    "API_SERVER_ENABLED=false",
    "",
  );
  return lines.join("\n");
}

function normalizeManagedSearxngBaseUrl(baseUrl, deployAgentToken) {
  const trimmed = typeof baseUrl === "string" ? baseUrl.trim().replace(/\/+$/, "") : "";
  if (!trimmed) return "";
  if (!deployAgentToken) return trimmed;
  if (!/\/managed\/web\/search\/searxng$/i.test(trimmed)) return trimmed;
  return `${trimmed}/${encodeURIComponent(deployAgentToken)}`;
}

function normalizeBinding(binding, agentId) {
  if (!isPlainObject(binding)) {
    throw new Error("binding must be an object");
  }
  const allowedTop = new Set(["source", "target"]);
  for (const key of Object.keys(binding)) {
    if (!allowedTop.has(key)) {
      throw new Error(`binding.${key} is not supported`);
    }
  }
  const source = binding.source;
  const target = binding.target;
  if (!isPlainObject(source) || !isPlainObject(target)) {
    throw new Error("binding.source and binding.target must be objects");
  }
  const allowedSource = new Set(["channel", "accountId", "peer"]);
  for (const key of Object.keys(source)) {
    if (!allowedSource.has(key)) {
      throw new Error(`binding.source.${key} is not supported`);
    }
  }
  const allowedTarget = new Set(["agentId"]);
  for (const key of Object.keys(target)) {
    if (!allowedTarget.has(key)) {
      throw new Error(`binding.target.${key} is not supported`);
    }
  }
  const channel = typeof source.channel === "string" ? source.channel.trim() : "";
  if (!channel) {
    throw new Error("binding.source.channel is required");
  }
  const accountId = typeof source.accountId === "string" ? source.accountId.trim() : "";
  const peer = typeof source.peer === "string" ? source.peer.trim() : "";
  const targetAgentId = typeof target.agentId === "string" ? target.agentId.trim() : "";
  if (!AGENT_ID_PATTERN.test(targetAgentId)) {
    throw new Error("binding.target.agentId is invalid");
  }
  if (targetAgentId !== agentId) {
    throw new Error("binding.target.agentId must equal agent_id");
  }
  const normalizedSource = { channel };
  if (accountId) normalizedSource.accountId = accountId;
  if (peer) normalizedSource.peer = peer;
  return {
    source: normalizedSource,
    target: { agentId: targetAgentId },
  };
}

function normalizeAccountId(value, fallbackAgentId) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallbackAgentId;
  if (!ACCOUNT_ID_PATTERN.test(raw)) {
    throw new Error("account_id must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$");
  }
  return raw;
}

function normalizeAllowFrom(raw) {
  const list = typeof raw === "string" ? raw.split(",") : [];
  const out = [];
  for (const item of list) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.startsWith("tg:") ? trimmed : `tg:${trimmed}`);
  }
  return out;
}

async function withConfigLock(configPath, fn) {
  const lockPath = `${configPath}.lock`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await mkdir(lockPath);
      try {
        return await fn();
      } finally {
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error) {
      const code = error && typeof error === "object" ? error.code : "";
      if (code !== "EEXIST") {
        throw error;
      }
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > 120000) {
          await rm(lockPath, { recursive: true, force: true }).catch(() => {});
        }
      } catch {}
      await sleep(250);
    }
  }
  throw new Error("timed out waiting for config lock");
}

function normalizeModelListCsv(raw, primary) {
  const seen = new Set();
  const ids = [];
  const push = (value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ids.push(trimmed);
  };
  push(primary);
  const rawText = typeof raw === "string" ? raw : "";
  for (const segment of rawText.split(",")) {
    push(segment);
  }
  return ids;
}

async function readJsonFileOrDefault(filePath, fallbackValue) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

async function upsertEnvAppValues(envPath, values) {
  let current = "";
  try {
    current = await readFile(envPath, "utf8");
  } catch {
    current = "";
  }
  const lines = current ? current.split(/\r?\n/) : [];
  const nextLines = [...lines];
  const setValue = (key, value) => {
    const prefix = `${key}=`;
    const idx = nextLines.findIndex((line) => line.startsWith(prefix));
    if (value === null) {
      if (idx >= 0) nextLines.splice(idx, 1);
      return;
    }
    const nextLine = `${key}=${value}`;
    if (idx >= 0) {
      nextLines[idx] = nextLine;
    } else {
      nextLines.push(nextLine);
    }
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === null) {
      setValue(key, null);
      continue;
    }
    if (typeof value !== "string") continue;
    setValue(key, JSON.stringify(value));
  }
  const content = `${nextLines.filter(Boolean).join("\n")}\n`;
  await writeFile(envPath, content, "utf8");
}

async function restartService(serviceName) {
  await runShell(
    "if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; " +
      "then sudo systemctl restart " + JSON.stringify(serviceName) + "; " +
      "else pkill -f " + JSON.stringify("openclaw gateway") + " || true; fi"
  );
}

async function ensureServiceHealthy(serviceName) {
  await runShell(
    "if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then " +
      "sudo systemctl is-active --quiet " + JSON.stringify(serviceName) + "; " +
    "else true; fi"
  );
}

async function readSystemdActiveState(serviceName) {
  const unitName = serviceName.endsWith(".service") ? serviceName : `${serviceName}.service`;
  const result = await runShell(
    buildPrivilegedShell(
      `systemctl is-active ${shellQuote(unitName)} 2>/dev/null || true`
    )
  );
  return result.stdout.trim() || "unknown";
}

async function renderHermesAgentFromOpenClawConfig(params) {
  const configPath = path.join(installDir, ".openclaw", "openclaw.json");
  const envPath = path.join(installDir, ".env.app");
  const statePath = getAgentRuntimeStatePath(params.agentId);
  const configRaw = await readFile(configPath, "utf8");
  const envRaw = await readFile(envPath, "utf8").catch(() => "");
  const state = await readJsonFileOrDefault(statePath, {});
  const config = JSON.parse(configRaw);
  if (!config || typeof config !== "object") {
    throw new Error("invalid openclaw config");
  }
  const telegram =
    config.channels &&
    typeof config.channels === "object" &&
    config.channels.telegram &&
    typeof config.channels.telegram === "object"
      ? config.channels.telegram
      : {};
  const accounts =
    telegram.accounts && typeof telegram.accounts === "object" && !Array.isArray(telegram.accounts)
      ? telegram.accounts
      : {};
  const currentAccount =
    accounts[params.accountId] && typeof accounts[params.accountId] === "object"
      ? accounts[params.accountId]
      : {};
  const savedAccount =
    state.account_config && typeof state.account_config === "object" && !Array.isArray(state.account_config)
      ? redactTelegramSecrets(state.account_config)
      : {};
  const savedTopLevelTelegram =
    state.top_level_telegram && typeof state.top_level_telegram === "object"
      ? redactTelegramSecrets(state.top_level_telegram)
      : {};
  const accountForHermes =
    Object.keys(currentAccount).length > 0 ? currentAccount : savedAccount;
  const telegramBotToken =
    params.telegramBotToken ||
    (typeof accountForHermes.botToken === "string" ? accountForHermes.botToken.trim() : "") ||
    (params.agentId === "main" && typeof telegram.botToken === "string"
      ? telegram.botToken.trim()
      : "");
  if (!telegramBotToken) {
    throw new Error("telegram bot token is required for Hermes agent runtime");
  }

  const fullModel = resolveOpenClawAgentModel(config, params.agentId, params.model);
  const modelConfig = resolveProviderModelForHermes(config, fullModel);
  const apiKey = resolveEnvReference(modelConfig.apiKeyRef, envRaw);
  if (!apiKey) {
    throw new Error(`api key for provider ${modelConfig.providerId} is missing`);
  }
  const clawsimpleApiBaseUrl = readEnvKey(envRaw, "CLAWSIMPLE_API_BASE_URL") || apiBase;
  const managedWebToken = readEnvKey(envRaw, "DEPLOY_PRESET_PROXY_TOKEN");
  const deployAgentToken = readEnvKey(envRaw, "DEPLOY_AGENT_TOKEN");
  const searxngBaseUrl = normalizeManagedSearxngBaseUrl(
    readEnvKey(envRaw, "SEARXNG_URL") || readEnvKey(envRaw, "SEARXNG_BASE_URL"),
    deployAgentToken
  );
  const managedWebBaseUrl =
    managedWebToken && clawsimpleApiBaseUrl
      ? clawsimpleApiBaseUrl.replace(/\/+$/, "")
      : "";
  const allowedUsers = extractTelegramAllowedUsers(accountForHermes, telegram);
  if (allowedUsers.length === 0 && Object.keys(savedTopLevelTelegram).length > 0) {
    allowedUsers.push(...extractTelegramAllowedUsers({}, savedTopLevelTelegram));
  }
  if (allowedUsers.length === 0) {
    throw new Error("telegram allowlist is required for Hermes agent runtime");
  }

  const hermesHome = path.join(installDir, ".hermes", params.agentId);
  await mkdir(hermesHome, { recursive: true });
  await writeFile(
    path.join(hermesHome, "config.yaml"),
    buildHermesConfigYaml({
      model: modelConfig.modelId,
      providerId: modelConfig.providerId,
      baseUrl: modelConfig.baseUrl,
      providerModels: modelConfig.providerModels,
      webBackend: searxngBaseUrl ? "searxng" : managedWebBaseUrl && managedWebToken ? "firecrawl" : "",
    }),
    "utf8"
  );
  await writeFile(
    path.join(hermesHome, ".env"),
    buildHermesEnv({
      telegramBotToken,
      allowedUsers,
      baseUrl: modelConfig.baseUrl,
      apiKey,
      model: modelConfig.modelId,
      searxngBaseUrl,
      managedWebBaseUrl,
      managedWebToken,
    }),
    "utf8"
  );
  await chmod(path.join(hermesHome, ".env"), 0o600).catch(() => {});
  return {
    hermesHome,
    telegramBotToken,
    allowedUsers,
    fullModel,
    hermesModel: modelConfig.modelId,
    providerId: modelConfig.providerId,
    baseUrl: modelConfig.baseUrl,
  };
}

async function prepareHermesAgentRuntimeFromCurrentConfig(params) {
  try {
    const rendered = await renderHermesAgentFromOpenClawConfig(params);
    return rendered;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    throw new Error(`prepare Hermes runtime failed for agent ${params.agentId}: ${message}`);
  }
}

function hasEnabledOpenClawTelegramAccount(telegram, disabledAccountId) {
  const accounts =
    telegram &&
    telegram.accounts &&
    typeof telegram.accounts === "object" &&
    !Array.isArray(telegram.accounts)
      ? telegram.accounts
      : {};

  return Object.entries(accounts).some(([accountId, accountConfig]) => {
    if (accountId === disabledAccountId || accountId === "main" || accountId === "default") {
      return false;
    }
    return Boolean(
      accountConfig &&
        typeof accountConfig === "object" &&
        !Array.isArray(accountConfig) &&
        accountConfig.enabled !== false &&
        typeof accountConfig.botToken === "string" &&
        accountConfig.botToken.trim()
    );
  });
}

async function disableOpenClawAgentTelegram(params) {
  const configPath = path.join(installDir, ".openclaw", "openclaw.json");
  const statePath = getAgentRuntimeStatePath(params.agentId);
  await mkdir(path.dirname(statePath), { recursive: true });
  await withConfigLock(configPath, async () => {
    const existingState = await readJsonFileOrDefault(statePath, {});
    const configRaw = await readFile(configPath, "utf8");
    const config = JSON.parse(configRaw);
    if (!config || typeof config !== "object") {
      throw new Error("invalid openclaw config");
    }
    const telegram =
      config.channels &&
      typeof config.channels === "object" &&
      config.channels.telegram &&
      typeof config.channels.telegram === "object"
        ? config.channels.telegram
        : null;
    await writeFile(
      statePath,
      `${JSON.stringify(
        {
          ...(isPlainObject(existingState) ? existingState : {}),
          agent_id: params.agentId,
          account_id: params.accountId,
          active_runtime: "hermes",
          saved_at: new Date().toISOString(),
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    if (telegram) {
      if (
        telegram.accounts &&
        typeof telegram.accounts === "object" &&
        !Array.isArray(telegram.accounts) &&
        telegram.accounts[params.accountId] &&
        typeof telegram.accounts[params.accountId] === "object"
      ) {
        telegram.accounts[params.accountId].enabled = false;
      }
      if (params.agentId === "main") {
        const shouldKeepTelegramPolling = hasEnabledOpenClawTelegramAccount(
          telegram,
          params.accountId
        );
        telegram.enabled = shouldKeepTelegramPolling;
        ensureOpenClawTelegramPluginState(config, shouldKeepTelegramPolling);
      }
    }
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  });
}

async function reconcileOpenClawTelegramPollingFromRuntimeState() {
  const runtimeAgentsDir = path.join(clawsimpleAgentDir, "runtime-agents");
  const entries = await readdir(runtimeAgentsDir, { withFileTypes: true }).catch(() => []);
  const reconciled = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const statePath = path.join(runtimeAgentsDir, entry.name);
    const state = await readJsonFileOrDefault(statePath, {});
    const agentId =
      typeof state.agent_id === "string" && state.agent_id.trim()
        ? state.agent_id.trim()
        : entry.name.replace(/\.json$/, "");
    const accountId =
      typeof state.account_id === "string" && state.account_id.trim()
        ? state.account_id.trim()
        : agentId;
    if (!AGENT_ID_PATTERN.test(agentId) || !ACCOUNT_ID_PATTERN.test(accountId)) continue;
    const hermesServiceName =
      typeof state.hermes_service_name === "string" && state.hermes_service_name.trim()
        ? state.hermes_service_name.trim()
        : getHermesAgentServiceName(agentId);
    const hermesState = await readSystemdActiveState(hermesServiceName);
    const savedRuntime =
      typeof state.active_runtime === "string"
        ? state.active_runtime.trim().toLowerCase()
        : "";
    if (hermesState !== "active" && savedRuntime !== "hermes") continue;
    await disableOpenClawAgentTelegram({ agentId, accountId });
    reconciled.push({ agentId, accountId, hermesServiceName, hermesState });
  }
  return reconciled;
}

async function activateHermesAgentRuntime(params) {
  await ensurePrivilegedSystemdAccess();
  const legacyHermesServiceName = getHermesAgentServiceName(params.agentId);
  let prepared;
  try {
    prepared = await readHermesPreparedRuntime(params.agentId);
  } catch (error) {
    log(
      `Hermes prepared runtime missing or stale for agent ${params.agentId}; rendering from OpenClaw config: ${String(
        error instanceof Error ? error.message : error
      )}`
    );
    prepared = await prepareHermesAgentRuntimeFromCurrentConfig({
      agentId: params.agentId,
      accountId: params.accountId,
    });
  }
  await disableOpenClawAgentTelegram(params);
  await restartService(params.openclawServiceName);
  await ensureServiceHealthy(params.openclawServiceName);
  const hermesServiceName = await installOfficialHermesGatewayService(
    prepared.hermesHome,
    legacyHermesServiceName
  );
  await mergeAgentRuntimeState(params.agentId, {
    hermes_service_name: hermesServiceName,
  });
  return {
    hermesHome: prepared.hermesHome,
    hermesModel: prepared.hermesModel,
    providerId: prepared.providerId,
    baseUrl: prepared.baseUrl,
    hermesServiceName,
    openclawServiceState: await readSystemdActiveState(params.openclawServiceName),
    hermesServiceState: await readSystemdActiveState(hermesServiceName),
  };
}

async function ackJob(jobId, payload) {
  const result = await requestJson(
    `${apiBase}/api/deploy/${encodeURIComponent(sid)}/runner/jobs/${encodeURIComponent(jobId)}/ack`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!result.ok) {
    log(`ack failed for job ${jobId}: ${result.status}`);
  }
}

let notifySocket = null;
let notifyReconnectTimer = null;
let notifyReconnectDelayMs = 1000;
let notifyConnectionKey = "";
let notifyUnavailableLogged = false;
let isDrainingJobs = false;
let drainAgain = false;

function closeNotifyChannel() {
  if (notifyReconnectTimer) {
    clearTimeout(notifyReconnectTimer);
    notifyReconnectTimer = null;
  }
  notifyConnectionKey = "";
  if (notifySocket) {
    try {
      notifySocket.close();
    } catch {
      // ignore close failures
    }
  }
  notifySocket = null;
}

function scheduleNotifyReconnect() {
  if (!sid || !token || notifyReconnectTimer) return;
  const delay = notifyReconnectDelayMs;
  notifyReconnectDelayMs = Math.min(delay * 2, NOTIFY_RECONNECT_MAX_DELAY_MS);
  notifyReconnectTimer = setTimeout(() => {
    notifyReconnectTimer = null;
    connectRunnerNotifyChannel();
  }, delay + Math.floor(Math.random() * 1000));
}

function connectRunnerNotifyChannel() {
  if (!sid || !token) {
    closeNotifyChannel();
    return;
  }
  if (typeof WebSocket !== "function") {
    if (!notifyUnavailableLogged) {
      log("runner notify websocket unavailable; using fallback claim interval");
      notifyUnavailableLogged = true;
    }
    return;
  }

  const url = resolveRunnerNotifyConnectUrl();
  if (!url) {
    if (!notifyUnavailableLogged) {
      log("runner notify url unavailable; using fallback claim interval");
      notifyUnavailableLogged = true;
    }
    return;
  }

  const connectionKey = `${sid}|${url}`;
  if (
    notifySocket &&
    notifyConnectionKey === connectionKey &&
    (notifySocket.readyState === WebSocket.CONNECTING || notifySocket.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  closeNotifyChannel();
  notifyConnectionKey = connectionKey;
  try {
    notifySocket = new WebSocket(url, ["clawsimple.runner", `token.${token}`]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    log(`runner notify connect failed: ${message}`);
    scheduleNotifyReconnect();
    return;
  }
  const socket = notifySocket;

  socket.addEventListener("open", () => {
    if (notifySocket !== socket) return;
    notifyReconnectDelayMs = 1000;
    log("runner notify connected");
  });
  socket.addEventListener("message", (event) => {
    if (notifySocket !== socket) return;
    let data = {};
    try {
      data = typeof event.data === "string" ? JSON.parse(event.data) : {};
    } catch {
      data = {};
    }
    if (data?.type === "job_available") {
      void claimAndDrainJobs("notify");
    }
  });
  socket.addEventListener("close", () => {
    if (notifySocket !== socket) return;
    notifySocket = null;
    if (sid && token) scheduleNotifyReconnect();
  });
  socket.addEventListener("error", () => {
    if (notifySocket !== socket) return;
    if (socket.readyState !== WebSocket.CLOSED) {
      try {
        socket.close();
      } catch {
        // ignore close failures
      }
    }
  });
}

function resetDeploymentClaimState(reason) {
  if (sid || token) {
    log(`${reason}; clearing in-memory sid/token`);
  }
  sid = "";
  token = "";
  closeNotifyChannel();
  gatewayHeartbeatLastCheckedAt = 0;
  gatewayHeartbeatRestartPolicy = "";
  gatewayHeartbeatServiceActive = null;
  gatewayHeartbeatLastSeenAt = "";
  telegramProfileSyncedAt = 0;
  providerConfigSyncedAt = 0;
  providerConfigSyncedHash = "";
  notifyConnectedRemoteSyncedAt = 0;
  notifyConnectedSafetyClaimedAt = 0;
}

function isNotifyChannelOpen() {
  return Boolean(
    typeof WebSocket === "function" &&
      notifySocket &&
      notifySocket.readyState === WebSocket.OPEN
  );
}

function shouldRunNotifyConnectedRemoteSync(now = Date.now()) {
  return (
    notifyConnectedRemoteSyncedAt === 0 ||
    now - notifyConnectedRemoteSyncedAt >= NOTIFY_CONNECTED_REMOTE_SYNC_INTERVAL_MS
  );
}

function shouldRunNotifyConnectedSafetyClaim(now = Date.now()) {
  return (
    notifyConnectedSafetyClaimedAt === 0 ||
    now - notifyConnectedSafetyClaimedAt >= NOTIFY_CONNECTED_SAFETY_CLAIM_INTERVAL_MS
  );
}

async function claimAndDrainJobs(reason) {
  if (!sid || !token) return;
  if (isDrainingJobs) {
    drainAgain = true;
    return;
  }

  isDrainingJobs = true;
  try {
    do {
      drainAgain = false;
      while (sid && token) {
        const result = await requestJson(
          `${apiBase}/api/deploy/${encodeURIComponent(sid)}/runner/jobs/claim`,
          { method: "POST" }
        );
        if (!result.ok) {
          log(`job claim failed status=${result.status} reason=${reason}`);
          if (result.status === 401 || result.status === 403) {
            resetDeploymentClaimState(`job claim unauthorized for sid=${sid}`);
          }
          break;
        }
        const job = result.data?.job;
        if (!job) break;
        await executeJob(job);
      }
    } while (drainAgain);
  } finally {
    isDrainingJobs = false;
  }
}

async function executeJob(job) {
  log(`job start ${job.id} type=${job.type}`);
  if (job.type === "install_app" && shouldAutoUpdateRunner) {
    // Keep deploy/redeploy on the latest runner before reinstalling the app.
    await maybeAutoUpdateRunner(true);
  }
  await ackJob(job.id, { status: "running" });
  try {
    if (job.type === "backup_export") {
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const backupId = typeof payload.backup_id === "string" ? payload.backup_id.trim() : "";
      if (!backupId) {
        throw new Error("backup_id is required");
      }

      const encPath = path.join(tmpdir(), `clawsimple-backup-${backupId}.tar.gz.enc`);
      try {
        const password = await fetchJobSecret(job.id, "backup_password");
        const presign = await requestJson(`${apiBase}/api/deploy/${encodeURIComponent(sid)}/backup/presign-upload`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ backup_id: backupId }),
        });
        if (!presign.ok) {
          throw new Error(`presign upload failed status=${presign.status}`);
        }
        const uploadUrl = typeof presign.data.upload_url === "string" ? presign.data.upload_url : "";
        if (!uploadUrl) {
          throw new Error("missing upload_url");
        }

        await runShell(
          `set -euo pipefail; ` +
            `export CLAW_BACKUP_PASSWORD=${JSON.stringify(password)}; ` +
            `cd /opt/clawsimple; ` +
            `paths=(data); ` +
            `if [ -f .env.app ]; then paths+=(.env.app); fi; ` +
            `if [ -d .openclaw/agents ]; then paths+=(.openclaw/agents); fi; ` +
            `if [ -d .openclaw/workspace ]; then paths+=(.openclaw/workspace); fi; ` +
            `for ws in .openclaw/workspace-*; do if [ -d "$ws" ]; then paths+=("$ws"); fi; done; ` +
            `tar -czf - "\${paths[@]}" | ` +
            `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:CLAW_BACKUP_PASSWORD > ${JSON.stringify(encPath)}`
        );
        await runShell(
          `curl -fsSL -X PUT --upload-file ${JSON.stringify(encPath)} ${JSON.stringify(uploadUrl)}`
        );
        const size = (await stat(encPath)).size;
        await requestJson(`${apiBase}/api/deploy/${encodeURIComponent(sid)}/backup/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ backup_id: backupId, status: "ready", size_bytes: size }),
        });
        await ackJob(job.id, {
          status: "succeeded",
          result: { action: "backup_export", backup_id: backupId },
        });
        log(`job success ${job.id} type=backup_export`);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        await requestJson(`${apiBase}/api/deploy/${encodeURIComponent(sid)}/backup/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ backup_id: backupId, status: "failed", error_message: message.slice(0, 1000) }),
        }).catch(() => {});
        throw error;
      } finally {
        await rm(encPath, { force: true }).catch(() => {});
      }
    }
    if (job.type === "backup_restore") {
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const backupId = typeof payload.backup_id === "string" ? payload.backup_id.trim() : "";
      const restoreEnvMode = normalizeBackupRestoreEnvMode(payload.restore_env_mode);
      if (!backupId) {
        throw new Error("backup_id is required");
      }
      log(`backup_restore request backup_id=${backupId} mode=${restoreEnvMode}`);
      const password = await fetchJobSecret(job.id, "backup_password");
      const presign = await requestJson(`${apiBase}/api/deploy/${encodeURIComponent(sid)}/backup/presign-download`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backup_id: backupId }),
      });
      if (!presign.ok) {
        throw new Error(`presign download failed status=${presign.status}`);
      }
      const downloadUrl = typeof presign.data.download_url === "string" ? presign.data.download_url : "";
      if (!downloadUrl) {
        throw new Error("missing download_url");
      }

      const encPath = path.join(tmpdir(), `clawsimple-restore-${backupId}.tar.gz.enc`);
      try {
        await runShell(`curl -fsSL ${JSON.stringify(downloadUrl)} -o ${JSON.stringify(encPath)}`);
        await runShell(
          `set -euo pipefail; ` +
            `export CLAW_BACKUP_PASSWORD=${JSON.stringify(password)}; ` +
            `ts=$(date +%s); ` +
            `env_bak="/opt/clawsimple/.env.app.before-restore.$ts"; ` +
            `echo "backup_restore snapshot env_bak=$env_bak backup_id=${backupId}" >&2; ` +
            `if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then sudo -n systemctl stop clawsimple || true; fi; ` +
            `if [ -f /opt/clawsimple/.env.app ]; then mv /opt/clawsimple/.env.app "$env_bak" || true; fi; ` +
            `if [ -d /opt/clawsimple/data ]; then mv /opt/clawsimple/data /opt/clawsimple/data.before-restore.$ts || true; fi; ` +
            `if [ -d /opt/clawsimple/.openclaw/agents ]; then mv /opt/clawsimple/.openclaw/agents /opt/clawsimple/.openclaw/agents.before-restore.$ts || true; fi; ` +
            `if [ -d /opt/clawsimple/.openclaw/workspace ]; then mv /opt/clawsimple/.openclaw/workspace /opt/clawsimple/.openclaw/workspace.before-restore.$ts || true; fi; ` +
            `for ws in /opt/clawsimple/.openclaw/workspace-*; do if [ -d "$ws" ]; then mv "$ws" "$ws.before-restore.$ts" || true; fi; done; ` +
            `mkdir -p /opt/clawsimple; ` +
            `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:CLAW_BACKUP_PASSWORD -in ${JSON.stringify(encPath)} | ` +
            `tar -C /opt/clawsimple -xzf -; ` +
            `if [ ! -s /opt/clawsimple/.env.app ]; then ` +
              `if [ -f "$env_bak" ]; then cp "$env_bak" /opt/clawsimple/.env.app; fi; ` +
              `echo "backup_restore validation failed: /opt/clawsimple/.env.app missing or empty after restore" >&2; ` +
              `exit 31; ` +
            `fi; ` +
            `restore_env_mode=${JSON.stringify(restoreEnvMode)}; ` +
            `echo "backup_restore env/json before reconcile mode=$restore_env_mode" >&2; ` +
            `if [ "$restore_env_mode" = "skip" ]; then ` +
              `if [ -f "$env_bak" ]; then cp "$env_bak" /opt/clawsimple/.env.app; fi; ` +
              `echo "backup_restore env reconcile mode=skip copied_env_bak=true" >&2; ` +
            `elif [ "$restore_env_mode" = "merge" ] && [ -f "$env_bak" ]; then ` +
              `protected_keys=${JSON.stringify(BACKUP_RESTORE_PROTECTED_ENV_KEYS.join(" "))}; ` +
              `merged_keys="$(ENV_BAK="$env_bak" TARGET_ENV="/opt/clawsimple/.env.app" PROTECTED_KEYS="$protected_keys" node -e 'const fs=require(\"node:fs\");const src=process.env.ENV_BAK||\"\";const dst=process.env.TARGET_ENV||\"\";const keys=(process.env.PROTECTED_KEYS||\"\").split(/\\s+/).filter(Boolean);const read=(p)=>{const m=new Map();let t=\"\";try{t=fs.readFileSync(p,\"utf8\");}catch{return m;}for(const line of t.split(/\\r?\\n/)){const s=line.trim();if(!s||s.startsWith(\"#\"))continue;const i=line.indexOf(\"=\");if(i<=0)continue;const k=line.slice(0,i).trim().replace(/^export\\s+/,\"\");m.set(k,line.slice(i+1));}return m;};const source=read(src);let text=\"\";try{text=fs.readFileSync(dst,\"utf8\");}catch{text=\"\";}const lines=text?text.split(/\\r?\\n/):[];if(lines.length&&lines[lines.length-1]===\"\")lines.pop();const index=new Map();for(let i=0;i<lines.length;i++){const line=lines[i];const p=line.indexOf(\"=\");if(p<=0)continue;const k=line.slice(0,p).trim().replace(/^export\\s+/,\"\");if(!index.has(k))index.set(k,i);}const applied=[];for(const key of keys){if(!source.has(key))continue;const next=key+\"=\"+source.get(key);if(index.has(key)){lines[index.get(key)]=next;}else{index.set(key,lines.length);lines.push(next);}applied.push(key);}fs.writeFileSync(dst,lines.join(\"\\n\")+\"\\n\",\"utf8\");process.stdout.write(applied.join(\",\"));' 2>/dev/null || true)"; ` +
              `echo "backup_restore env reconcile mode=merge applied_keys=$merged_keys" >&2; ` +
            `else ` +
              `echo "backup_restore env reconcile mode=restore" >&2; ` +
            `fi; ` +
            `echo "backup_restore env/json after reconcile mode=$restore_env_mode" >&2; ` +
            `required_api_key_vars="$(node -e 'const fs=require(\"node:fs\");` +
              `const p=\"/opt/clawsimple/.openclaw/openclaw.json\";` +
              `try{const j=JSON.parse(fs.readFileSync(p,\"utf8\"));` +
              `const providers=j&&j.models&&j.models.providers&&typeof j.models.providers===\"object\"?j.models.providers:{};` +
              `const out=[];` +
              `for (const value of Object.values(providers)) {` +
                `if (!value || typeof value !== \"object\") continue;` +
                `const apiKey=typeof value.apiKey===\"string\"?value.apiKey.trim():\"\";` +
                `const m=apiKey.match(/^\\$\\{([A-Z0-9_]+)\\}$/);` +
                `if (m && m[1]) out.push(m[1]);` +
              `}` +
              `process.stdout.write([...new Set(out)].join(\" \"));` +
              `}catch{process.stdout.write(\"\")}' 2>/dev/null || true)"; ` +
            `if [ -n "$required_api_key_vars" ]; then ` +
              `for key in $required_api_key_vars; do ` +
                `if ! grep -q "^$key=.\\+" /opt/clawsimple/.env.app; then ` +
                  `if [ -f "$env_bak" ]; then cp "$env_bak" /opt/clawsimple/.env.app; fi; ` +
                  `echo "backup_restore validation failed: required key $key missing in /opt/clawsimple/.env.app" >&2; ` +
                  `exit 32; ` +
                `fi; ` +
              `done; ` +
            `fi; ` +
            `if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then ` +
              `sudo -n systemctl start clawsimple || true; ` +
            `fi`
        );
      } finally {
        await rm(encPath, { force: true }).catch(() => {});
      }

      await ackJob(job.id, {
        status: "succeeded",
        result: {
          action: "backup_restore",
          backup_id: backupId,
          restore_env_mode: restoreEnvMode,
        },
      });
      log(`job success ${job.id} type=backup_restore mode=${restoreEnvMode}`);
      return;
    }
    if (job.type === "add_agent") {
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const agentIdRaw = typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
      if (!agentIdRaw) {
        throw new Error("agent_id is required");
      }
      if (!AGENT_ID_PATTERN.test(agentIdRaw)) {
        throw new Error("agent_id must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");
      }
      const serviceName = normalizeServiceName(payload);
      const accountId = normalizeAccountId(payload.account_id, agentIdRaw);
      const tgToken = typeof payload.tg_token === "string" ? payload.tg_token.trim() : "";
      const tgAllow = normalizeAllowFrom(payload.tg_allow);
      const binding = payload.binding === undefined ? null : normalizeBinding(payload.binding, agentIdRaw);
      const targetRuntime =
        typeof payload.target_runtime === "string" || typeof payload.runtime === "string"
          ? normalizeTargetRuntime(payload)
          : "hermes";
      const managedBaseUrl =
        typeof payload.managed_openai_base_url === "string"
          ? payload.managed_openai_base_url.trim()
          : "";
      const managedProvider =
        typeof payload.managed_openai_provider === "string"
          ? payload.managed_openai_provider.trim().toLowerCase()
          : "";
      const managedModelsRaw =
        typeof payload.managed_openai_models === "string"
          ? payload.managed_openai_models.trim()
          : "";
      let managedProviderSecrets = {};
      if (managedBaseUrl || managedProvider) {
        try {
          const rawSecret = await fetchJobSecret(job.id, "add_agent_provider_keys");
          const parsed = rawSecret ? JSON.parse(rawSecret) : {};
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            managedProviderSecrets = parsed;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error ?? "");
          if (!message.includes("status=404")) {
            log(`add_agent secret fetch failed: ${message}`);
          }
        }
      }

      const configPath = path.join(installDir, ".openclaw", "openclaw.json");
      const envPath = path.join(installDir, ".env.app");
      const agentWorkspace = path.join(installDir, ".openclaw", `workspace-${agentIdRaw}`);
      const agentDir = path.join(installDir, ".openclaw", "agents", agentIdRaw, "agent");
      const mainWorkspace = path.join(installDir, ".openclaw", "workspace");
      const mainAgentDir = path.join(installDir, ".openclaw", "agents", "main", "agent");
      let previousConfigRaw = "";
      let previousEnvRaw = "";
      let resolvedAgentModel = "";
      const workspaceExisted = await stat(agentWorkspace)
        .then(() => true)
        .catch(() => false);
      const agentDirExisted = await stat(agentDir)
        .then(() => true)
        .catch(() => false);
      await withConfigLock(configPath, async () => {
        const configRaw = await readFile(configPath, "utf8");
        previousConfigRaw = configRaw;
        try {
          previousEnvRaw = await readFile(envPath, "utf8");
        } catch {
          previousEnvRaw = "";
        }
        const config = JSON.parse(configRaw);

        if (!config || typeof config !== "object") {
          throw new Error("invalid openclaw config");
        }
        if (!config.models || typeof config.models !== "object") {
          config.models = {};
        }
        if (!config.models.providers || typeof config.models.providers !== "object") {
          config.models.providers = {};
        }
        config.models.mode = "merge";
        if (!config.agents || typeof config.agents !== "object") {
          config.agents = {};
        }
        if (!config.agents.defaults || typeof config.agents.defaults !== "object") {
          config.agents.defaults = {};
        }
        if (
          !config.agents.defaults.models ||
          typeof config.agents.defaults.models !== "object" ||
          Array.isArray(config.agents.defaults.models)
        ) {
          config.agents.defaults.models = {};
        }

        const managedApiKey =
          typeof managedProviderSecrets.managed_openai_api_key === "string"
            ? managedProviderSecrets.managed_openai_api_key.trim()
            : "";
        const managedModelIds = normalizeModelListCsv(managedModelsRaw);
        if (managedBaseUrl && managedProvider && managedApiKey) {
          config.models.providers[managedProvider] = {
            baseUrl: managedBaseUrl,
            apiKey: "${DEPLOY_PRESET_PROXY_TOKEN}",
            api: "openai-completions",
            models: managedModelIds.map((id) => ({ id, name: id })),
          };
          for (const modelId of managedModelIds) {
            config.agents.defaults.models[`${managedProvider}/${modelId}`] = {};
          }
          await upsertEnvAppValues(envPath, {
            DEPLOY_PRESET_PROXY_TOKEN: managedApiKey,
          });
        }
        if (!Array.isArray(config.agents.list)) {
          config.agents.list = [];
        }
        const hasMainAgent = config.agents.list.some(
          (item) => item && typeof item === "object" && item.id === "main"
        );
        if (!hasMainAgent) {
          // Keep the default main agent routable after relaunch/restore flows.
          const hasMainDir = await stat(mainAgentDir)
            .then(() => true)
            .catch(() => false);
          const hasDefaultTelegramToken =
            Boolean(
              config?.channels &&
                typeof config.channels === "object" &&
                config.channels.telegram &&
                typeof config.channels.telegram === "object" &&
                typeof config.channels.telegram.botToken === "string" &&
                config.channels.telegram.botToken.trim().length > 0
            );
          if (hasMainDir || hasDefaultTelegramToken) {
            config.agents.list.unshift({
              id: "main",
              workspace: mainWorkspace,
              agentDir: mainAgentDir,
            });
          }
        }

        const existing = config.agents.list.find(
          (item) => item && typeof item === "object" && item.id === agentIdRaw
        );
        const resolvedModel = resolveAgentModel(config, payload);
        resolvedAgentModel = resolvedModel;
        if (!existing) {
          config.agents.list.push({
            id: agentIdRaw,
            workspace: agentWorkspace,
            agentDir,
            ...(resolvedModel ? { model: resolvedModel } : {}),
          });
        } else if (resolvedModel) {
          existing.model = resolvedModel;
        }
        if (tgToken || tgAllow.length > 0) {
          if (!config.channels || typeof config.channels !== "object") {
            config.channels = {};
          }
          if (!config.channels.telegram || typeof config.channels.telegram !== "object") {
            config.channels.telegram = {};
          }
          config.channels.telegram.enabled = true;
          ensureOpenClawTelegramPluginState(config, true);
          if (
            !config.channels.telegram.accounts ||
            typeof config.channels.telegram.accounts !== "object" ||
            Array.isArray(config.channels.telegram.accounts)
          ) {
            config.channels.telegram.accounts = {};
          }
          const currentAccount =
            config.channels.telegram.accounts[accountId] &&
            typeof config.channels.telegram.accounts[accountId] === "object"
              ? config.channels.telegram.accounts[accountId]
              : {};
          const existingBotToken =
            typeof currentAccount.botToken === "string" ? currentAccount.botToken.trim() : "";
          const nextBotToken = tgToken || existingBotToken;
          if (!nextBotToken) {
            throw new Error("bot token is required to create a new telegram account");
          }
          config.channels.telegram.accounts[accountId] = {
            ...currentAccount,
            enabled: true,
            dmPolicy: "allowlist",
            groupPolicy: "allowlist",
            botToken: nextBotToken,
            ...(tgAllow.length > 0 ? { allowFrom: tgAllow } : {}),
            ...(tgAllow.length > 0 ? { groupAllowFrom: tgAllow } : {}),
            groups:
              currentAccount.groups &&
              typeof currentAccount.groups === "object" &&
              !Array.isArray(currentAccount.groups)
                ? currentAccount.groups
                : { "*": { requireMention: false } },
          };
          if (agentIdRaw === "main") {
            config.channels.telegram.botToken = nextBotToken;
            if (tgAllow.length > 0) {
              config.channels.telegram.allowFrom = tgAllow;
              config.channels.telegram.groupAllowFrom = tgAllow;
            }
          }
        }
        const hasMainAgentAfterUpsert = config.agents.list.some(
          (item) => item && typeof item === "object" && item.id === "main"
        );
        const defaultTelegramToken =
          config?.channels &&
          typeof config.channels === "object" &&
          config.channels.telegram &&
          typeof config.channels.telegram === "object" &&
          typeof config.channels.telegram.botToken === "string"
            ? config.channels.telegram.botToken.trim()
            : "";
        if (hasMainAgentAfterUpsert && defaultTelegramToken) {
          if (!config.channels || typeof config.channels !== "object") {
            config.channels = {};
          }
          if (!config.channels.telegram || typeof config.channels.telegram !== "object") {
            config.channels.telegram = {};
          }
          if (
            !config.channels.telegram.accounts ||
            typeof config.channels.telegram.accounts !== "object" ||
            Array.isArray(config.channels.telegram.accounts)
          ) {
            config.channels.telegram.accounts = {};
          }
          const mainAllow =
            Array.isArray(config.channels.telegram.allowFrom) &&
            config.channels.telegram.allowFrom.every((value) => typeof value === "string")
              ? config.channels.telegram.allowFrom
              : [];
          const currentMainAccount =
            config.channels.telegram.accounts.main &&
            typeof config.channels.telegram.accounts.main === "object"
              ? config.channels.telegram.accounts.main
              : {};
          config.channels.telegram.accounts.main = {
            ...currentMainAccount,
            enabled: true,
            dmPolicy: "allowlist",
            groupPolicy: "allowlist",
            botToken: defaultTelegramToken,
            ...(mainAllow.length > 0 ? { allowFrom: mainAllow } : {}),
            ...(mainAllow.length > 0 ? { groupAllowFrom: mainAllow } : {}),
            groups:
              currentMainAccount.groups &&
              typeof currentMainAccount.groups === "object" &&
              !Array.isArray(currentMainAccount.groups)
                ? currentMainAccount.groups
                : { "*": { requireMention: false } },
          };
        }

        const defaultBinding =
          tgToken && !binding
            ? { agentId: agentIdRaw, match: { channel: "telegram", accountId } }
            : null;
        const finalBinding = binding ?? defaultBinding;
        if (finalBinding) {
          if (!Array.isArray(config.bindings)) {
            config.bindings = [];
          }
          const bindingKey = JSON.stringify(finalBinding);
          const hasBinding = config.bindings.some(
            (item) => item && typeof item === "object" && JSON.stringify(item) === bindingKey
          );
          if (!hasBinding) {
            config.bindings.push(finalBinding);
          }
        }
        if (hasMainAgentAfterUpsert && defaultTelegramToken) {
          if (!Array.isArray(config.bindings)) {
            config.bindings = [];
          }
          const mainBinding = { agentId: "main", match: { channel: "telegram", accountId: "main" } };
          const mainBindingKey = JSON.stringify(mainBinding);
          const hasMainBinding = config.bindings.some(
            (item) => item && typeof item === "object" && JSON.stringify(item) === mainBindingKey
          );
          if (!hasMainBinding) {
            config.bindings.unshift(mainBinding);
          }
        }

        await mkdir(agentWorkspace, { recursive: true });
        await mkdir(agentDir, { recursive: true });
        await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      });

      let preparedHermes = null;
      let hermesActivationResult = null;
      try {
        if (tgToken) {
          preparedHermes = await prepareHermesAgentRuntimeFromCurrentConfig({
            agentId: agentIdRaw,
            accountId,
            model: resolvedAgentModel,
            telegramBotToken: tgToken,
          });
        }
        if (targetRuntime === "hermes") {
          hermesActivationResult = await activateHermesAgentRuntime({
            agentId: agentIdRaw,
            accountId,
            openclawServiceName: serviceName,
          });
        } else {
          await runShell(
            "if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; " +
              "then sudo systemctl restart " + JSON.stringify(serviceName) + "; " +
              "else pkill -f " + JSON.stringify("openclaw gateway") + " || true; fi"
          );
        }
      } catch (error) {
        if (previousConfigRaw) {
          await withConfigLock(configPath, async () => {
            await writeFile(configPath, previousConfigRaw, "utf8");
            await writeFile(envPath, previousEnvRaw, "utf8");
          }).catch((rollbackError) => {
            log(`add_agent config rollback failed: ${String(rollbackError ?? "")}`);
          });
        }
        if (!workspaceExisted) {
          await rm(agentWorkspace, { recursive: true, force: true }).catch(() => {});
        }
        if (!agentDirExisted) {
          await rm(path.join(installDir, ".openclaw", "agents", agentIdRaw), {
            recursive: true,
            force: true,
          }).catch(() => {});
        }
        throw error;
      }
      await ackJob(job.id, {
        status: "succeeded",
        result: {
          action: "add_agent",
          agent_id: agentIdRaw,
          service_name: serviceName,
          active_runtime: targetRuntime,
          ...(preparedHermes
            ? {
                hermes_model: preparedHermes.hermesModel,
                hermes_provider: preparedHermes.providerId,
              }
            : {}),
          ...(hermesActivationResult
            ? {
                openclaw_service_state: hermesActivationResult.openclawServiceState,
                hermes_service_state: hermesActivationResult.hermesServiceState,
                hermes_service_name: hermesActivationResult.hermesServiceName,
              }
            : {}),
        },
      });
      log(`job success ${job.id} type=add_agent agent=${agentIdRaw}`);
      return;
    }
    if (job.type === "remove_agent") {
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const agentIdRaw = typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
      if (!agentIdRaw) {
        throw new Error("agent_id is required");
      }
      if (!AGENT_ID_PATTERN.test(agentIdRaw)) {
        throw new Error("agent_id must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");
      }
      const serviceName = normalizeServiceName(payload);
      const accountId = normalizeAccountId(payload.account_id, agentIdRaw);

      const configPath = path.join(installDir, ".openclaw", "openclaw.json");
      await withConfigLock(configPath, async () => {
        const configRaw = await readFile(configPath, "utf8");
        const config = JSON.parse(configRaw);
        if (!config || typeof config !== "object") {
          throw new Error("invalid openclaw config");
        }
        if (!config.agents || typeof config.agents !== "object") {
          config.agents = {};
        }
        if (!Array.isArray(config.agents.list)) {
          config.agents.list = [];
        }
        config.agents.list = config.agents.list.filter(
          (item) => !(item && typeof item === "object" && item.id === agentIdRaw)
        );
        if (config.agents.list.length === 0) {
          throw new Error("cannot remove the last agent");
        }

        const telegramAccounts = config?.channels?.telegram?.accounts;
        if (
          telegramAccounts &&
          typeof telegramAccounts === "object" &&
          !Array.isArray(telegramAccounts)
        ) {
          delete telegramAccounts[accountId];
          if (accountId !== agentIdRaw) {
            delete telegramAccounts[agentIdRaw];
          }
        }

        if (Array.isArray(config.bindings)) {
          config.bindings = config.bindings.filter((item) => {
            if (!item || typeof item !== "object") return true;
            const rootAgentId = typeof item.agentId === "string" ? item.agentId : "";
            const targetAgentId =
              item.target && typeof item.target === "object" && typeof item.target.agentId === "string"
                ? item.target.agentId
                : "";
            return rootAgentId !== agentIdRaw && targetAgentId !== agentIdRaw;
          });
        }

        await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      });

      await runShell(
        "if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; " +
          "then sudo systemctl restart " + JSON.stringify(serviceName) + "; " +
          "else pkill -f " + JSON.stringify("openclaw gateway") + " || true; fi"
      );
      await ackJob(job.id, {
        status: "succeeded",
        result: { action: "remove_agent", agent_id: agentIdRaw, service_name: serviceName },
      });
      log(`job success ${job.id} type=remove_agent agent=${agentIdRaw}`);
      return;
    }
    if (job.type === "runner_refresh") {
      const refresh = await requestJson(
        `${apiBase}/api/deploy/${encodeURIComponent(sid)}/runner/script`,
        { method: "GET" }
      );
      if (!refresh.ok) {
        throw new Error(`runner refresh script fetch failed status=${refresh.status}`);
      }
      const nextScript = typeof refresh.data.script === "string" ? refresh.data.script : "";
      const nextRevision =
        typeof refresh.data.runner_revision === "string" ? refresh.data.runner_revision.trim() : "";
      const nextLabel =
        typeof refresh.data.runner_label === "string" ? refresh.data.runner_label.trim() : "";
      const nextVersion =
        typeof refresh.data.runner_version === "string" ? refresh.data.runner_version : "";
      if (!nextScript.trim()) {
        throw new Error("runner refresh script payload is empty");
      }

      await writeFile(runnerScriptPath, nextScript, "utf8");
      await chmod(runnerScriptPath, 0o755).catch(() => {});
      await ackJob(job.id, {
        status: "succeeded",
        result: {
          action: "runner_refresh",
          runner_revision: nextRevision || getRunnerRevisionFromScript(nextScript),
          runner_label: nextLabel || nextVersion || RUNNER_LABEL,
          runner_version: nextVersion || "unknown",
        },
      });
      log(
        `job success ${job.id} type=runner_refresh runner_version=${
          nextVersion || "unknown"
        }; exiting for restart`
      );
      process.exit(0);
    }
    if (job.type === "telegram_profile_sync") {
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const agentId =
        typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
      await maybeSyncTelegramProfiles(true);
      await ackJob(job.id, {
        status: "succeeded",
        result: {
          action: "telegram_profile_sync",
          ...(agentId ? { agent_id: agentId } : {}),
        },
      });
      log(
        `job success ${job.id} type=telegram_profile_sync${agentId ? ` agent=${agentId}` : ""}`
      );
      return;
    }
    if (job.type === "openclaw_upgrade") {
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const serviceName = normalizeServiceName(payload);
      const requestedVersionRaw =
        typeof payload.version === "string" ? payload.version.trim() : "";
      const requestedVersion = requestedVersionRaw || "latest";
      if (!OPENCLAW_VERSION_PATTERN.test(requestedVersion)) {
        throw new Error("version must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");
      }

      const diskMaintenance = await prepareOpenClawUpgradeDisk();
      const hasSudo = await runShell(
        "command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1"
      ).then(
        () => true,
        () => false
      );
      const installerCommand =
        "set -euo pipefail; " +
        `export OPENCLAW_VERSION=${JSON.stringify(requestedVersion)}; ` +
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard --no-prompt";
      const updateCommand = "set -euo pipefail; openclaw update --json";
      let strategy = "installer";
      try {
        if (hasSudo) {
          await runShell(`sudo -n bash -lc ${JSON.stringify(installerCommand)}`);
        } else {
          await runShell(`bash -lc ${JSON.stringify(installerCommand)}`);
        }
      } catch (installerError) {
        strategy = "openclaw-update";
        log(
          `openclaw installer upgrade failed, fallback to openclaw update: ${String(
            installerError
          )}`
        );
        if (hasSudo) {
          await runShell(`sudo -n bash -lc ${JSON.stringify(updateCommand)}`);
        } else {
          await runShell(`bash -lc ${JSON.stringify(updateCommand)}`);
        }
      }

      const pollingReconciliations =
        await reconcileOpenClawTelegramPollingFromRuntimeState();
      const postUpgradeCleanup = await cleanupOpenClawUpgradeDisk();
      const diskAfterUpgrade = postUpgradeCleanup.disk || (await readRootDiskUsage());

      await runShell(
        "if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; " +
          "then sudo systemctl restart " + JSON.stringify(serviceName) + "; " +
          "else pkill -f " + JSON.stringify("openclaw gateway") + " || true; fi"
      );
      const installedVersion = await tryReadOpenClawVersion();
      await ackJob(job.id, {
        status: "succeeded",
        result: {
          action: "openclaw_upgrade",
          service_name: serviceName,
          strategy,
          requested_version: requestedVersion,
          openclaw_version: installedVersion,
          disk_before: diskMaintenance.before,
          disk_after_cleanup: diskMaintenance.after_cleanup,
          disk_after_upgrade: diskAfterUpgrade,
          disk_required_free_mb: diskMaintenance.required_free_mb,
          pruned_runtime_dirs:
            diskMaintenance.deleted_runtime_dirs +
            postUpgradeCleanup.deleted_runtime_dirs,
          ...(pollingReconciliations.length > 0
            ? {
                telegram_polling_reconciled_agents: pollingReconciliations.map(
                  (item) => item.agentId
                ),
              }
            : {}),
        },
      });
      log(
        `job success ${job.id} type=openclaw_upgrade strategy=${strategy} requested=${requestedVersion} installed=${installedVersion} polling_reconciled=${pollingReconciliations.length}`
      );
      return;
    }
    if (job.type === "hermes_upgrade") {
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const requestedVersionRaw =
        typeof payload.version === "string" ? payload.version.trim() : "";
      const requestedVersion = requestedVersionRaw || "main";
      if (!OPENCLAW_VERSION_PATTERN.test(requestedVersion)) {
        throw new Error("version must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");
      }

      const installerUrl =
        typeof payload.install_url === "string" && payload.install_url.trim()
          ? payload.install_url.trim()
          : "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh";
      const installParentDir = path.dirname(hermesAgentDir);
      const installerCommand =
        "set -euo pipefail; " +
        `curl -fsSL ${JSON.stringify(installerUrl)} | env HERMES_HOME=${JSON.stringify(
          path.join(installDir, ".hermes", "main")
        )} HERMES_INSTALL_DIR=${JSON.stringify(hermesAgentDir)} bash -s -- --skip-setup --branch ${JSON.stringify(
          requestedVersion
        )} --hermes-home ${JSON.stringify(
          path.join(installDir, ".hermes", "main")
        )} --dir ${JSON.stringify(hermesAgentDir)}`;

      await mkdir(installParentDir, { recursive: true });
      await runShell(buildPrivilegedShell(`mkdir -p ${shellQuote(installParentDir)} ${shellQuote(path.join(installDir, ".hermes", "main"))}`));
      await runShellWithTimeout(`bash -lc ${JSON.stringify(installerCommand)}`, 15 * 60 * 1000);
      await runShell(
        buildPrivilegedShell(
          `chown -R clawsimple:clawsimple ${shellQuote(installParentDir)} ${shellQuote(path.join(installDir, ".hermes"))}`
        )
      ).catch((error) => {
        log(`Hermes ownership repair skipped after upgrade: ${String(error ?? "")}`);
      });

      const restartedServicesOutput = await runShell(
        buildPrivilegedShell(`
set -euo pipefail
systemctl list-unit-files 'hermes-gateway*.service' --no-legend --no-pager 2>/dev/null \
  | awk '{print $1}' \
  | while IFS= read -r unit; do
      [ -n "$unit" ] || continue
      if systemctl is-active --quiet "$unit"; then
        systemctl restart "$unit"
        printf '%s\\n' "$unit"
      fi
    done
`)
      ).catch(() => ({ stdout: "", stderr: "" }));
      const restartedServices = restartedServicesOutput.stdout
        .split(/\r?\n/)
        .map((line) => line.replace(/\.service$/, "").trim())
        .filter(Boolean);

      const installedVersion = await tryReadHermesAgentVersion();
      await ackJob(job.id, {
        status: "succeeded",
        result: {
          action: "hermes_upgrade",
          requested_version: requestedVersion,
          hermes_agent_version: installedVersion,
          restarted_services: restartedServices,
        },
      });
      log(
        `job success ${job.id} type=hermes_upgrade requested=${requestedVersion} installed=${installedVersion} restarted=${restartedServices.join(",")}`
      );
      return;
    }
    if (job.type === "install_app") {
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const installUrl = typeof payload.install_url === "string" ? payload.install_url.trim() : "";
      if (!installUrl) {
        throw new Error("install_url is required");
      }
      let providerSecrets = {};
      try {
        const rawSecret = await fetchJobSecret(job.id, "install_app_provider_keys");
        const parsed = rawSecret ? JSON.parse(rawSecret) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          providerSecrets = parsed;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        if (!message.includes("status=404")) {
          log(`install_app secret fetch failed: ${message}`);
        }
      }
      const tgToken = typeof payload.tg_token === "string" ? payload.tg_token : "";
      const tgAllow = typeof payload.tg_allow === "string" ? payload.tg_allow : "";
      const installSid =
        typeof payload.install_sid === "string" ? payload.install_sid.trim() : "";
      const installDir =
        typeof payload.install_dir === "string" ? payload.install_dir.trim() : "";
      const installServiceName = normalizeServiceName(payload);
      const presetProxyBaseUrl =
        typeof payload.preset_proxy_base_url === "string" ? payload.preset_proxy_base_url : "";
      const presetProxyModel =
        typeof payload.preset_proxy_model === "string" ? payload.preset_proxy_model : "";
      const presetProxyModels =
        typeof payload.preset_proxy_models === "string" ? payload.preset_proxy_models : "";
      const presetProxyApiKey =
        typeof providerSecrets.preset_proxy_api_key === "string"
          ? providerSecrets.preset_proxy_api_key
          : typeof payload.preset_proxy_api_key === "string"
            ? payload.preset_proxy_api_key
            : "";
      const openclawVersion = typeof payload.openclaw_version === "string" ? payload.openclaw_version : "";
      const openclawSudoMode = typeof payload.openclaw_sudo_mode === "string" ? payload.openclaw_sudo_mode : "";
      const clawsimpleRestartPolicy =
        typeof payload.clawsimple_restart_policy === "string" ? payload.clawsimple_restart_policy : "";
      const clawsimpleStartLimitIntervalSec =
        typeof payload.clawsimple_start_limit_interval_sec === "string"
          ? payload.clawsimple_start_limit_interval_sec
          : "";
      const clawsimpleStartLimitBurst =
        typeof payload.clawsimple_start_limit_burst === "string" ? payload.clawsimple_start_limit_burst : "";
      const clawsimpleServiceFailureWebhookUrl =
        typeof payload.clawsimple_service_failure_webhook_url === "string"
          ? payload.clawsimple_service_failure_webhook_url
          : "";
      const installAuditd = typeof payload.install_auditd === "string" ? payload.install_auditd : "";
      const requestedGatewayPort =
        typeof payload.gateway_port === "string"
          ? payload.gateway_port.trim()
          : typeof payload.gateway_port === "number" && Number.isFinite(payload.gateway_port)
            ? String(payload.gateway_port)
            : "";
      const gatewayPort = requestedGatewayPort;
      const deployAgentToken = typeof payload.deploy_agent_token === "string" ? payload.deploy_agent_token : "";
      const apiBaseUrl = typeof payload.api_base_url === "string" ? payload.api_base_url : "";
      const runnerNotifyUrl =
        typeof payload.runner_notify_url === "string" ? payload.runner_notify_url : "";
      const installTargetRuntimeRaw =
        typeof payload.target_runtime === "string"
          ? payload.target_runtime.trim().toLowerCase()
          : "";
      const installTargetRuntime = installTargetRuntimeRaw
        ? normalizeTargetRuntime({ target_runtime: installTargetRuntimeRaw })
        : "openclaw";

      const envPairs = [
        installSid ? `SID=${JSON.stringify(installSid)}` : "",
        installDir ? `CLAWSIMPLE_INSTALL_DIR=${JSON.stringify(installDir)}` : "",
        installServiceName
          ? `CLAWSIMPLE_SERVICE_NAME=${JSON.stringify(installServiceName)}`
          : "",
        deployAgentToken ? `DEPLOY_AGENT_TOKEN=${JSON.stringify(deployAgentToken)}` : "",
        apiBaseUrl ? `CLAWSIMPLE_API_BASE_URL=${JSON.stringify(apiBaseUrl)}` : "",
        runnerNotifyUrl ? `RUNNER_NOTIFY_URL=${JSON.stringify(runnerNotifyUrl)}` : "",
        presetProxyBaseUrl
          ? `PRESET_PROXY_BASE_URL=${JSON.stringify(presetProxyBaseUrl)}`
          : "",
        presetProxyModel
          ? `PRESET_PROXY_MODEL=${JSON.stringify(presetProxyModel)}`
          : "",
        presetProxyModels
          ? `PRESET_PROXY_MODELS=${JSON.stringify(presetProxyModels)}`
          : "",
        presetProxyApiKey
          ? `PRESET_PROXY_API_KEY=${JSON.stringify(presetProxyApiKey)}`
          : "",
        openclawVersion ? `OPENCLAW_VERSION=${JSON.stringify(openclawVersion)}` : "",
        openclawSudoMode ? `OPENCLAW_SUDO_MODE=${JSON.stringify(openclawSudoMode)}` : "",
        clawsimpleRestartPolicy
          ? `CLAWSIMPLE_RESTART_POLICY=${JSON.stringify(clawsimpleRestartPolicy)}`
          : "",
        clawsimpleStartLimitIntervalSec
          ? `CLAWSIMPLE_START_LIMIT_INTERVAL_SEC=${JSON.stringify(clawsimpleStartLimitIntervalSec)}`
          : "",
        clawsimpleStartLimitBurst
          ? `CLAWSIMPLE_START_LIMIT_BURST=${JSON.stringify(clawsimpleStartLimitBurst)}`
          : "",
        clawsimpleServiceFailureWebhookUrl
          ? `CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL=${JSON.stringify(clawsimpleServiceFailureWebhookUrl)}`
          : "",
        installAuditd ? `INSTALL_AUDITD=${JSON.stringify(installAuditd)}` : "",
        gatewayPort ? `GATEWAY_PORT=${JSON.stringify(gatewayPort)}` : "",
        `TARGET_AGENT_RUNTIME=${JSON.stringify(installTargetRuntime)}`,
      ].filter(Boolean);

      const argPairs = [
        tgToken ? `--tg-token=${JSON.stringify(tgToken)}` : "",
        tgAllow ? `--tg-allow=${JSON.stringify(tgAllow)}` : "",
        presetProxyBaseUrl
          ? `--preset-proxy-base-url=${JSON.stringify(presetProxyBaseUrl)}`
          : "",
        presetProxyModel ? `--preset-proxy-model=${JSON.stringify(presetProxyModel)}` : "",
        presetProxyModels ? `--preset-proxy-models=${JSON.stringify(presetProxyModels)}` : "",
        presetProxyApiKey ? `--preset-proxy-key=${JSON.stringify(presetProxyApiKey)}` : "",
        `--target-runtime=${JSON.stringify(installTargetRuntime)}`,
        "--noninteractive",
      ].filter(Boolean);

      const envPrefix = envPairs.join(" ");
      const installScriptCmd = `set -o pipefail; curl -fsSL ${JSON.stringify(installUrl)} | bash -s -- ${argPairs.join(" ")}`;
      const installRunnerCommand = `${envPrefix ? `${envPrefix} ` : ""}bash -lc ${JSON.stringify(installScriptCmd)}`;
      const installCommand = installRunnerCommand;

      await runShell(installCommand);
      await runShell(
        "if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; " +
          "then sudo test -f /etc/systemd/system/" +
          JSON.stringify(installServiceName) +
          ".service && sudo systemctl is-active --quiet " +
          JSON.stringify(installServiceName) +
          "; " +
          "else test -f /etc/systemd/system/" +
          JSON.stringify(installServiceName) +
          ".service; fi"
      );
      await maybeSyncProviderConfig(true).catch((error) => {
        log(`provider config sync after install_app failed: ${String(error ?? "")}`);
      });
      await ackJob(job.id, {
        status: "succeeded",
        result: {
          action: "install_app",
          install_sid: installSid || sid,
          active_runtime: installTargetRuntime,
        },
      });
      log(`job success ${job.id} type=install_app`);
      return;
    }
    throw new Error(`unsupported job type: ${job.type}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await ackJob(job.id, { status: "failed", error_message: message });
    log(`job failed ${job.id} type=${job.type} error=${message}`);
  }
}

async function loop() {
  log(`runner start version=${RUNNER_VERSION}`);
  let nextDelay = 60000;
  while (true) {
    try {
      if (!sid || !token) {
        resetDeploymentClaimState("runner has no deployment claim");
        nextDelay = 60000;
        const jitter = Math.floor(Math.random() * 1000);
        await sleep(Math.max(1000, nextDelay) + jitter);
        continue;
      }
      await maybeSyncGatewayHeartbeat(false);
      connectRunnerNotifyChannel();
      const notifyOpen = isNotifyChannelOpen();
      const now = Date.now();
      if (!notifyOpen || shouldRunNotifyConnectedRemoteSync(now)) {
        await maybeSyncTelegramProfiles(false);
        await maybeSyncProviderConfig(false);
        if (notifyOpen) {
          notifyConnectedRemoteSyncedAt = now;
        }
      }
      if (!notifyOpen || shouldRunNotifyConnectedSafetyClaim(now)) {
        await claimAndDrainJobs(notifyOpen ? "safety" : "fallback");
        if (notifyOpen) {
          notifyConnectedSafetyClaimedAt = Date.now();
        }
      }
      nextDelay = FALLBACK_JOB_CLAIM_INTERVAL_MS;
    } catch {
      nextDelay = Math.min(Math.max(nextDelay * 2, 5000), 120000);
    }
    const jitter = Math.floor(Math.random() * 1000);
    await sleep(Math.max(1000, nextDelay) + jitter);
  }
}

loop().catch(() => process.exit(1));
