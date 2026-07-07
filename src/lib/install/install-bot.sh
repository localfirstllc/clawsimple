#!/usr/bin/env bash
set -euo pipefail

INSTALLER_VERSION="1.1.3"
# Unused legacy version removed
OPENCLAW_VERSION="${OPENCLAW_VERSION:-latest}"
OPENCLAW_SUDO_MODE="${OPENCLAW_SUDO_MODE:-strict}"
HERMES_AGENT_INSTALL_ENABLED="${HERMES_AGENT_INSTALL_ENABLED:-1}"
HERMES_AGENT_INSTALL_URL="${HERMES_AGENT_INSTALL_URL:-https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh}"
HERMES_AGENT_BRANCH="${HERMES_AGENT_BRANCH:-main}"
CLAWSIMPLE_INSTALL_DIR="${CLAWSIMPLE_INSTALL_DIR:-/opt/clawsimple}"
INSTALL_DIR="${CLAWSIMPLE_INSTALL_DIR}"
HERMES_AGENT_HOME="${HERMES_AGENT_HOME:-${INSTALL_DIR}/.hermes/main}"
HERMES_AGENT_DIR="${HERMES_AGENT_DIR:-${INSTALL_DIR}/.hermes-agent/hermes-agent}"
CLAWSIMPLE_SERVICE_NAME="${CLAWSIMPLE_SERVICE_NAME:-clawsimple}"
SERVICE_NAME="${CLAWSIMPLE_SERVICE_NAME}"
CLAWSIMPLE_USER="clawsimple"
CLAWSIMPLE_DOMAIN="${CLAWSIMPLE_DOMAIN:-clawsimple.com}"
GATEWAY_PORT="${GATEWAY_PORT:-18789}"
JOBS_RESTART_SEC="${JOBS_RESTART_SEC:-10}"
JOBS_START_LIMIT_INTERVAL_SEC="${JOBS_START_LIMIT_INTERVAL_SEC:-300}"
JOBS_START_LIMIT_BURST="${JOBS_START_LIMIT_BURST:-10}"
CLAWSIMPLE_RESTART_POLICY="${CLAWSIMPLE_RESTART_POLICY:-always}"
CLAWSIMPLE_START_LIMIT_INTERVAL_SEC="${CLAWSIMPLE_START_LIMIT_INTERVAL_SEC:-300}"
CLAWSIMPLE_START_LIMIT_BURST="${CLAWSIMPLE_START_LIMIT_BURST:-10}"
CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL="${CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL:-}"
INSTALL_AUDITD="${INSTALL_AUDITD:-0}"
INSTALL_EVENT_TOKEN="${INSTALL_EVENT_TOKEN:-}"

# Injected or environment-provided values
SID="${SID:-}"
RAW_LANG="${LANG:-}"
ENV_LANG="${CLAWSIMPLE_LANG:-}"
NONINTERACTIVE="${NONINTERACTIVE:-0}"
DEPLOY_AGENT_TOKEN="${DEPLOY_AGENT_TOKEN:-}"
CLAWSIMPLE_API_BASE_URL="${CLAWSIMPLE_API_BASE_URL:-https://${CLAWSIMPLE_DOMAIN}}"
RUNNER_NOTIFY_URL="${RUNNER_NOTIFY_URL:-}"
TARGET_AGENT_RUNTIME="${TARGET_AGENT_RUNTIME:-hermes}"

# User inputs
TG_TOKEN="${TG_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
TG_ALLOW="${TG_ALLOW:-${TELEGRAM_ALLOWED_USER_IDS:-${TELEGRAM_ALLOWED_USERS:-}}}"
PRESET_PROXY_BASE_URL="${PRESET_PROXY_BASE_URL:-}"
PRESET_PROXY_MODEL="${PRESET_PROXY_MODEL:-}"
PRESET_PROXY_MODELS="${PRESET_PROXY_MODELS:-}"
PRESET_PROXY_KEY="${PRESET_PROXY_API_KEY:-}"
CLI_LANG=""
INSTALL_LANG="en"

# Output colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

OS="unknown"
OS_VERSION="unknown"
ARCH="unknown"
SUDO=""

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

is_positive_int() {
  local value="$1"
  [[ "$value" =~ ^[1-9][0-9]*$ ]]
}

is_positive_decimal() {
  local value="$1"
  [[ "$value" =~ ^([1-9][0-9]*([.][0-9]+)?|0[.][0-9]*[1-9][0-9]*)$ ]]
}

report_event() {
  local event="$1"
  local error_code="${2:-}"
  local install_phase="${3:-}"
  local extra_meta_json="${4:-}"
  local meta="{\"os\":\"${OS}\",\"arch\":\"${ARCH}\",\"installer_version\":\"${INSTALLER_VERSION}\""
  if [ -n "$error_code" ]; then
    meta="${meta},\"error_code\":\"${error_code}\""
  fi
  if [ -n "$install_phase" ]; then
    meta="${meta},\"install_phase\":\"${install_phase}\""
  fi
  if [ -n "$extra_meta_json" ]; then
    local extra_body="${extra_meta_json#\{}"
    extra_body="${extra_body%\}}"
    if [ -n "$extra_body" ]; then
      meta="${meta},${extra_body}"
    fi
  fi
  meta="${meta}}"

  local api_base="${CLAWSIMPLE_API_BASE_URL:-}"
  api_base="${api_base%/}"
  if [ -z "$api_base" ]; then
    api_base="https://${CLAWSIMPLE_DOMAIN}"
  fi

  if [ -n "$SID" ] && command -v curl >/dev/null 2>&1; then
    local auth_header=()
    if [ -n "${INSTALL_EVENT_TOKEN}" ]; then
      auth_header=(-H "Authorization: Bearer ${INSTALL_EVENT_TOKEN}")
    fi
    curl -fsS -X POST "${api_base}/api/install/events" \
      -H "Content-Type: application/json" \
      "${auth_header[@]}" \
      -d "{\"sid\":\"${SID}\",\"event\":\"${event}\",\"ts\":$(date +%s),\"meta\":${meta}}" >/dev/null || true
  fi
}

report_phase() {
  local install_phase="$1"
  [ -z "$install_phase" ] && return 0
  report_event "progress" "" "$install_phase"
}

collect_runtime_metadata_json() {
  local runner_path="${INSTALL_DIR}/bin/skill-jobs-runner.mjs"
  local openclaw_version=""
  local gateway_active="false"
  local hermes_installed="false"
  local runtime_state_path="${INSTALL_DIR}/.clawsimple-agent/runtime-agents/main.json"
  local hermes_service_name=""
  local hermes_service_state="inactive"

  if command -v openclaw >/dev/null 2>&1; then
    openclaw_version="$(openclaw --version 2>/dev/null || true)"
  fi
  if command -v systemctl >/dev/null 2>&1 && ${SUDO} systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    gateway_active="true"
  fi
  if [ -x "${HERMES_AGENT_DIR}/venv/bin/python" ]; then
    hermes_installed="true"
  fi
  if [ -f "$runtime_state_path" ] && command -v node >/dev/null 2>&1; then
    hermes_service_name="$(node -e '
const fs = require("fs");
const path = process.argv[1];
try {
  const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
  const value = typeof parsed.hermes_service_name === "string" ? parsed.hermes_service_name.trim() : "";
  if (value) process.stdout.write(value);
} catch {}
' "$runtime_state_path" 2>/dev/null || true)"
  fi
  if [ -n "$hermes_service_name" ] && command -v systemctl >/dev/null 2>&1; then
    hermes_service_state="$(${SUDO} systemctl is-active "${hermes_service_name}" 2>/dev/null || true)"
    [ -z "$hermes_service_state" ] && hermes_service_state="inactive"
  fi
  if [ ! -f "$runner_path" ]; then
    runner_path=""
  fi

  OPENCLAW_VERSION_ACTUAL="$openclaw_version" \
  GATEWAY_SERVICE_ACTIVE="$gateway_active" \
  HERMES_AGENT_INSTALLED="$hermes_installed" \
  HERMES_SERVICE_NAME="$hermes_service_name" \
  HERMES_SERVICE_STATE="$hermes_service_state" \
  RUNTIME_STATE_PATH="$runtime_state_path" \
  TARGET_AGENT_RUNTIME="$TARGET_AGENT_RUNTIME" \
  node - "$runner_path" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");

const runnerPath = process.argv[2] || "";

function parseStringConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : "";
}

function parseArrayConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`));
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

let source = "";
let runnerRevision = "";
if (runnerPath) {
  try {
    source = fs.readFileSync(runnerPath, "utf8");
    runnerRevision = `sha256:${crypto.createHash("sha256").update(source).digest("hex")}`;
  } catch {
    source = "";
  }
}

const runnerVersion = parseStringConst(source, "RUNNER_VERSION");
const runnerLabel = parseStringConst(source, "RUNNER_LABEL") || runnerVersion;
const runnerCapabilities = parseArrayConst(source, "RUNNER_CAPABILITIES");
const openclawVersion = (process.env.OPENCLAW_VERSION_ACTUAL || "").trim();
const gatewayServiceActive = process.env.GATEWAY_SERVICE_ACTIVE === "true";
const hermesInstalled = process.env.HERMES_AGENT_INSTALLED === "true";
const targetRuntimeRaw = (process.env.TARGET_AGENT_RUNTIME || "hermes").trim().toLowerCase();
const targetRuntime = targetRuntimeRaw === "hermes" ? "hermes" : "openclaw";
const hermesServiceName = (process.env.HERMES_SERVICE_NAME || "").trim();
const hermesServiceState = (process.env.HERMES_SERVICE_STATE || "inactive").trim() || "inactive";
let runtimeState = {};
try {
  const statePath = process.env.RUNTIME_STATE_PATH || "";
  runtimeState = statePath ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
} catch {
  runtimeState = {};
}
const savedActiveRuntime =
  typeof runtimeState.active_runtime === "string"
    ? runtimeState.active_runtime.trim().toLowerCase()
    : "";
const activeRuntime =
  savedActiveRuntime === "hermes" || savedActiveRuntime === "openclaw"
    ? savedActiveRuntime
    : targetRuntime === "hermes" && hermesServiceState === "active"
      ? "hermes"
      : "openclaw";

const metadata = {
  runtime_mode: "dedicated-hetzner",
  hermes_agent_installed: hermesInstalled,
  gateway_service_active: gatewayServiceActive,
  active_runtime: activeRuntime,
  agent_runtimes: {
    main: {
      status:
        typeof runtimeState.status === "string" && runtimeState.status.trim()
          ? runtimeState.status.trim()
          : activeRuntime === targetRuntime
            ? "succeeded"
            : "ready",
      active_runtime: activeRuntime,
      target_runtime: targetRuntime,
      account_id: "main",
      openclaw_service_state: gatewayServiceActive ? "active" : "inactive",
      hermes_service_state: hermesServiceState,
      ...(hermesServiceName ? { hermes_service_name: hermesServiceName } : {}),
    },
  },
};

if (runnerRevision) metadata.runner_revision = runnerRevision;
if (runnerLabel) metadata.runner_label = runnerLabel;
if (runnerVersion) metadata.runner_version = runnerVersion;
if (runnerCapabilities.length > 0) metadata.runner_capabilities = Array.from(new Set(runnerCapabilities));
if (openclawVersion) metadata.openclaw_version = openclawVersion;

process.stdout.write(JSON.stringify(metadata));
NODE
}

report_runtime_metadata() {
  local install_phase="${1:-}"
  local metadata_json=""
  metadata_json="$(collect_runtime_metadata_json 2>/dev/null || true)"
  if [ -n "$metadata_json" ]; then
    report_event "progress" "" "$install_phase" "$metadata_json"
  elif [ -n "$install_phase" ]; then
    report_phase "$install_phase"
  fi
}

rotate_deploy_token() {
  local api_base="$1"
  local sid="$2"
  local current_token="$3"

  if [ -z "$api_base" ] || [ -z "$sid" ] || [ -z "$current_token" ]; then
    return 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  local response=""
  if ! response="$(curl -fsS -X POST \
    -H "authorization: Bearer ${current_token}" \
    "${api_base%/}/api/deploy/${sid}/runner/token/rotate")"; then
    return 1
  fi

  local rotated=""
  if ! rotated="$(printf '%s' "$response" | node -e '
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk.toString(); });
process.stdin.on("end", () => {
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { process.exit(1); }
  const token = typeof parsed.deploy_agent_token === "string" ? parsed.deploy_agent_token.trim() : "";
  if (!token) process.exit(1);
  process.stdout.write(token);
});
')"; then
    return 1
  fi

  if [ -z "$rotated" ]; then
    return 1
  fi
  printf '%s' "$rotated"
}

error_exit() {
  local code="$1"
  local msg="$2"
  log_error "$msg"
  report_event "failed" "$code"
  echo ""
  echo "=== Installation Failed ==="
  echo "Error Code: $code"
  echo "Check logs: journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
  exit 1
}

print_help() {
  cat << EOF
Usage:
  bash install-server.sh [options]

Options:
  --tg-token=TOKEN        Telegram Bot Token (required)
  --tg-allow=USER_ID      Telegram allowed user ID(s), comma-separated (required)
  --preset-proxy-base-url=URL  Preset proxy OpenAI-compatible Base URL
  --preset-proxy-model=MODEL   Preset proxy model ID
  --preset-proxy-models=MODELS Preset proxy model list
  --preset-proxy-key=KEY       Preset proxy API token
  --target-runtime=RUNTIME      Agent runtime: hermes or openclaw (default: hermes)
  --gateway-port=PORT     Gateway port (default: ${GATEWAY_PORT})
  --lang=LANG             Language code (default: en)
  --noninteractive        Disable prompts (for automation)
  --help                  Show this help

Environment variables:
  SID, CLAWSIMPLE_LANG, NONINTERACTIVE, OPENCLAW_VERSION, OPENCLAW_SUDO_MODE, HERMES_AGENT_INSTALL_ENABLED, HERMES_AGENT_INSTALL_URL, HERMES_AGENT_BRANCH, CLAWSIMPLE_INSTALL_DIR, CLAWSIMPLE_SERVICE_NAME, GATEWAY_PORT, TARGET_AGENT_RUNTIME, CLAWSIMPLE_RUNNER_SCRIPT_PATH
EOF
}

ensure_privileges() {
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      SUDO="sudo"
    else
      error_exit "E_OS" "sudo is required but not found."
    fi
  fi
}

run_as_clawsimple() {
  if [ "$(id -un)" = "$CLAWSIMPLE_USER" ]; then
    "$@"
    return
  fi
  if [ "$(id -u)" -eq 0 ]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u "$CLAWSIMPLE_USER" -- "$@"
    elif command -v sudo >/dev/null 2>&1; then
      sudo -u "$CLAWSIMPLE_USER" -H "$@"
    else
      su -s /bin/bash "$CLAWSIMPLE_USER" -c "$(printf '%q ' "$@")"
    fi
  else
    ${SUDO} -u "$CLAWSIMPLE_USER" -H "$@"
  fi
}

run_openclaw() {
  run_as_clawsimple env HOME="${INSTALL_DIR}" ${OPENCLAW_BIN} "$@"
}

run_openclaw_config_set() {
  # OpenClaw may exit non-zero when it overwrites existing config and prints
  # "Config overwrite: ...". For automated installs we treat that as success,
  # but still fail on any other non-zero exit.
  local output=""
  set +e
  output="$(run_openclaw "$@" 2>&1)"
  local code=$?
  set -e
  if [ $code -ne 0 ]; then
    if echo "$output" | grep -q "^Config overwrite:"; then
      log_warn "OpenClaw config overwrite detected; continuing."
      echo "$output"
      return 0
    fi
    echo "$output"
    return $code
  fi
  if [ -n "$output" ]; then
    echo "$output"
  fi
  return 0
}

resolve_lang() {
  local candidate=""
  if [ -n "$CLI_LANG" ]; then
    candidate="$CLI_LANG"
  elif [ -n "$ENV_LANG" ]; then
    candidate="$ENV_LANG"
  elif [ -n "$RAW_LANG" ]; then
    candidate="$RAW_LANG"
  fi

  if [[ "$candidate" =~ ^[a-z]{2}([-_][A-Za-z0-9]+)?$ ]]; then
    candidate="${candidate/_/-}"
    INSTALL_LANG="$candidate"
  else
    INSTALL_LANG="en"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tg-token)
        TG_TOKEN="${2:-}"
        shift 2
        ;;
      --tg-token=*)
        TG_TOKEN="${1#*=}"
        shift
        ;;
      --tg-allow)
        TG_ALLOW="${2:-}"
        shift 2
        ;;
      --tg-allow=*)
        TG_ALLOW="${1#*=}"
        shift
        ;;
      --preset-proxy-base-url)
        PRESET_PROXY_BASE_URL="${2:-}"
        shift 2
        ;;
      --preset-proxy-base-url=*)
        PRESET_PROXY_BASE_URL="${1#*=}"
        shift
        ;;
      --preset-proxy-model)
        PRESET_PROXY_MODEL="${2:-}"
        shift 2
        ;;
      --preset-proxy-model=*)
        PRESET_PROXY_MODEL="${1#*=}"
        shift
        ;;
      --preset-proxy-models)
        PRESET_PROXY_MODELS="${2:-}"
        shift 2
        ;;
      --preset-proxy-models=*)
        PRESET_PROXY_MODELS="${1#*=}"
        shift
        ;;
      --preset-proxy-key)
        PRESET_PROXY_KEY="${2:-}"
        shift 2
        ;;
      --preset-proxy-key=*)
        PRESET_PROXY_KEY="${1#*=}"
        shift
        ;;
      --lang)
        CLI_LANG="${2:-}"
        shift 2
        ;;
      --lang=*)
        CLI_LANG="${1#*=}"
        shift
        ;;
      --gateway-port)
        GATEWAY_PORT="${2:-}"
        shift 2
        ;;
      --gateway-port=*)
        GATEWAY_PORT="${1#*=}"
        shift
        ;;
      --target-runtime)
        TARGET_AGENT_RUNTIME="${2:-}"
        shift 2
        ;;
      --target-runtime=*)
        TARGET_AGENT_RUNTIME="${1#*=}"
        shift
        ;;
      --noninteractive)
        NONINTERACTIVE="1"
        shift
        ;;
      --help|-h)
        print_help
        exit 0
        ;;
      *)
        shift
        ;;
    esac
  done

  resolve_lang
  TARGET_AGENT_RUNTIME="$(printf '%s' "$TARGET_AGENT_RUNTIME" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$TARGET_AGENT_RUNTIME" in
    hermes|openclaw)
      ;;
    *)
      error_exit "E_CONFIG" "TARGET_AGENT_RUNTIME must be hermes or openclaw."
      ;;
  esac

  case "$CLAWSIMPLE_RESTART_POLICY" in
    always|on-failure|unless-stopped)
      ;;
    *)
      log_warn "Invalid CLAWSIMPLE_RESTART_POLICY=${CLAWSIMPLE_RESTART_POLICY}; fallback to always."
      CLAWSIMPLE_RESTART_POLICY="always"
      ;;
  esac

  # If a preset proxy model list is provided but no default model is set, pick the first one.
  if [ -z "$PRESET_PROXY_MODEL" ] && [ -n "$PRESET_PROXY_MODELS" ]; then
    IFS=',' read -r -a raw_models <<< "$PRESET_PROXY_MODELS"
    for raw_model in "${raw_models[@]}"; do
      local trimmed
      trimmed="$(echo "$raw_model" | xargs)"
      if [ -n "$trimmed" ]; then
        PRESET_PROXY_MODEL="$trimmed"
        break
      fi
    done
  fi

  if [ "${NONINTERACTIVE}" != "1" ]; then
    [ -z "$TG_TOKEN" ] && read -r -p "Enter Telegram Bot Token: " TG_TOKEN
    [ -z "$TG_ALLOW" ] && read -r -p "Enter your Telegram User ID (allowlist): " TG_ALLOW
  fi

  [ -z "$TG_TOKEN" ] && error_exit "E_CONFIG" "TG_TOKEN is required."
  [ -z "$TG_ALLOW" ] && error_exit "E_CONFIG" "TG_ALLOW is required."

  if [ -n "$PRESET_PROXY_BASE_URL" ] || [ -n "$PRESET_PROXY_MODEL" ] || [ -n "$PRESET_PROXY_MODELS" ] || [ -n "$PRESET_PROXY_KEY" ]; then
    [ -z "$PRESET_PROXY_BASE_URL" ] && error_exit "E_CONFIG" "PRESET_PROXY_BASE_URL is required for preset proxy."
    [ -z "$PRESET_PROXY_MODEL" ] && error_exit "E_CONFIG" "PRESET_PROXY_MODEL is required for preset proxy."
    [ -z "$PRESET_PROXY_KEY" ] && error_exit "E_CONFIG" "PRESET_PROXY_KEY is required for preset proxy."
  fi

  return 0
}

detect_os() {
  if [ ! -f /etc/os-release ]; then
    error_exit "E_OS" "Cannot detect OS. /etc/os-release not found."
  fi

  . /etc/os-release
  OS="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-unknown}"
  ARCH="$(uname -m)"

  log_info "Detected OS: ${OS} ${OS_VERSION}"

  if [[ ! "$OS" =~ ^(ubuntu|debian)$ ]]; then
    log_warn "Only Ubuntu/Debian is officially supported."
  fi
}

install_dependencies() {
  log_info "Installing dependencies..."

  if ! command -v apt-get >/dev/null 2>&1; then
    error_exit "E_OS" "apt-get is required but not found."
  fi

  ${SUDO} apt-get update -qq || error_exit "E_NET" "Failed to update package lists."
  ${SUDO} apt-get install -y curl git ca-certificates gnupg unzip openssl python3 python3-venv python3-pip build-essential librsvg2-bin || error_exit "E_NET" "Failed to install base packages."

  if ! command -v node >/dev/null 2>&1; then
    log_info "Installing Node.js..."
    if [ -n "${SUDO}" ]; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | ${SUDO} -E bash - || error_exit "E_NODE" "Failed to setup Node.js repository."
    else
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash - || error_exit "E_NODE" "Failed to setup Node.js repository."
    fi
    ${SUDO} apt-get install -y nodejs || error_exit "E_NODE" "Failed to install Node.js."
  else
    log_info "Node.js $(node -v) already installed."
  fi

  local node_major
  node_major="$(node -v | cut -d'v' -f2 | cut -d'.' -f1 || echo 0)"
  if [ "$node_major" -lt 22 ]; then
    error_exit "E_NODE" "Node.js 22+ is required."
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    log_info "Installing pnpm..."
    ${SUDO} npm install -g pnpm || error_exit "E_NET" "Failed to install pnpm."
  else
    log_info "pnpm $(pnpm -v) already installed."
  fi
}

create_user() {
  if ! id "$CLAWSIMPLE_USER" &>/dev/null; then
    log_info "Creating user: $CLAWSIMPLE_USER"
    ${SUDO} useradd --system --home "${INSTALL_DIR}" --shell /bin/false "$CLAWSIMPLE_USER" || error_exit "E_OS" "Failed to create user."
  else
    log_info "User $CLAWSIMPLE_USER already exists."
  fi
}

create_directories() {
  log_info "Creating directory structure..."
  ${SUDO} mkdir -p "${INSTALL_DIR}/"{logs,data,bin,.openclaw} || error_exit "E_NET" "Failed to create directories."
  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "$INSTALL_DIR"
  ${SUDO} chmod 700 "$INSTALL_DIR" "${INSTALL_DIR}/logs" "${INSTALL_DIR}/data" "${INSTALL_DIR}/bin"
}

repair_openclaw_packaged_templates() {
  local npm_root
  local openclaw_dir

  npm_root="$(npm root -g 2>/dev/null || true)"
  if [ -z "$npm_root" ]; then
    return 0
  fi

  openclaw_dir="${npm_root%/}/openclaw"
  if [ ! -d "$openclaw_dir" ]; then
    return 0
  fi

  local user_template="${INSTALL_DIR}/.openclaw/workspace/USER.md"
  local source_template=""
  if [ -f "$user_template" ]; then
    source_template="$user_template"
  elif [ -f "${openclaw_dir}/docs/reference/templates/USER.md" ]; then
    source_template="${openclaw_dir}/docs/reference/templates/USER.md"
  fi

  local template_paths=(
    "${openclaw_dir}/src/agents/templates/USER.md"
    "${openclaw_dir}/docs/reference/templates/USER.md"
  )

  local template_path
  for template_path in "${template_paths[@]}"; do
    if [ -f "$template_path" ]; then
      continue
    fi
    log_warn "openclaw packaged USER.md template is missing at ${template_path}; repairing."
    ${SUDO} mkdir -p "$(dirname "$template_path")" || true
    if [ -n "$source_template" ]; then
      ${SUDO} cp "$source_template" "$template_path" || true
    else
      ${SUDO} tee "$template_path" >/dev/null <<'EOF' || true
# USER.md - About Your Human

_Learn about the person you're helping. Update this as you go._

- **Name:**
- **What to call them:**
- **Pronouns:** _(optional)_
- **Timezone:**
- **Notes:**

## Context

_(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)_

---

The more you know, the better you can help. But remember - you're learning about a person, not building a dossier. Respect the difference.
EOF
    fi
    ${SUDO} chmod 644 "$template_path" || true
  done
}

install_openclaw() {
  log_info "Installing openclaw (CLI)..."

  if ! command -v openclaw >/dev/null 2>&1; then
    ${SUDO} npm install -g "openclaw@${OPENCLAW_VERSION}" || error_exit "E_INSTALL" "Failed to install openclaw."
  else
    if [ "${OPENCLAW_VERSION}" = "latest" ]; then
      local installed_version
      installed_version="$(openclaw --version 2>/dev/null | awk '{print $2}' | head -n 1 || true)"
      log_info "Updating openclaw from ${installed_version:-unknown} to latest..."
      ${SUDO} npm install -g "openclaw@latest" || error_exit "E_INSTALL" "Failed to install openclaw."
    else
      local installed_version
      installed_version="$(openclaw --version 2>/dev/null | awk '{print $2}' | head -n 1 || true)"
      if [ "${installed_version}" = "${OPENCLAW_VERSION}" ]; then
        log_info "openclaw ${installed_version} already installed."
      else
        log_info "Updating openclaw from ${installed_version:-unknown} to ${OPENCLAW_VERSION}..."
        ${SUDO} npm install -g "openclaw@${OPENCLAW_VERSION}" || error_exit "E_INSTALL" "Failed to install openclaw."
      fi
    fi
  fi

  OPENCLAW_BIN="$(command -v openclaw || true)"
  if [ -z "$OPENCLAW_BIN" ]; then
    local npm_root
    local openclaw_entry
    npm_root="$(npm root -g 2>/dev/null || true)"
    openclaw_entry="${npm_root%/}/openclaw/dist/entry.js"
    if [ -n "$npm_root" ] && [ -f "$openclaw_entry" ]; then
      log_warn "openclaw global bin was not linked by npm; repairing /usr/bin/openclaw."
      ${SUDO} chmod 755 "$openclaw_entry" || true
      ${SUDO} ln -sf "$openclaw_entry" /usr/bin/openclaw || error_exit "E_INSTALL" "Failed to repair openclaw binary link."
      OPENCLAW_BIN="$(command -v openclaw || true)"
    fi
  fi
  if [ -z "$OPENCLAW_BIN" ]; then
    error_exit "E_INSTALL" "openclaw binary not found after installation."
  fi
  if ! openclaw --version >/dev/null 2>&1; then
    local npm_root
    npm_root="$(npm root -g 2>/dev/null || true)"
    if [ -n "$npm_root" ] && [ -d "${npm_root%/}/openclaw" ]; then
      log_warn "openclaw binary failed initial execution; repairing missing runtime dependency json5."
      (cd "${npm_root%/}/openclaw" && ${SUDO} npm install --omit=dev "json5@^2.2.3") || true
    fi
  fi
  openclaw --version >/dev/null 2>&1 || error_exit "E_INSTALL" "openclaw binary is not executable after installation."
  repair_openclaw_packaged_templates
  log_info "openclaw installed at: ${OPENCLAW_BIN}"
}

disable_default_hermes_gateway() {
  if ! command -v systemctl >/dev/null 2>&1; then
    return 0
  fi
  ${SUDO} systemctl disable --now hermes-gateway.service >/dev/null 2>&1 || true
  ${SUDO} systemctl reset-failed hermes-gateway.service >/dev/null 2>&1 || true
}

install_hermes_agent() {
  case "${HERMES_AGENT_INSTALL_ENABLED,,}" in
    1|true|yes|on)
      ;;
    *)
      log_info "Hermes install skipped (HERMES_AGENT_INSTALL_ENABLED=${HERMES_AGENT_INSTALL_ENABLED})."
      return 0
      ;;
  esac

  report_phase "hermes_installing"
  log_info "Installing Hermes Agent..."
  ${SUDO} mkdir -p \
    "${HERMES_AGENT_HOME}" \
    "${HERMES_AGENT_DIR%/hermes-agent}" \
    "${INSTALL_DIR}/.config" \
    "${INSTALL_DIR}/.cache" \
    "${INSTALL_DIR}/.cache/uv" \
    "${INSTALL_DIR}/.local/share/uv" \
    "${INSTALL_DIR}/.local/bin" || error_exit "E_INSTALL" "Failed to create Hermes directories."
  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" \
    "${HERMES_AGENT_HOME%/*}" \
    "${HERMES_AGENT_HOME}" \
    "${HERMES_AGENT_DIR%/hermes-agent}" \
    "${INSTALL_DIR}/.config" \
    "${INSTALL_DIR}/.cache" \
    "${INSTALL_DIR}/.local" || error_exit "E_INSTALL" "Failed to prepare Hermes directory ownership."
  export PATH="${HERMES_AGENT_DIR}/venv/bin:${HERMES_AGENT_DIR}/node_modules/.bin:${INSTALL_DIR}/.local/bin:${PATH}"

  if [ -x "${HERMES_AGENT_DIR}/venv/bin/python" ] && "${HERMES_AGENT_DIR}/venv/bin/python" -m hermes_cli.main --help >/dev/null 2>&1; then
    log_info "Hermes Agent already installed at: ${HERMES_AGENT_DIR}"
    disable_default_hermes_gateway
    report_phase "hermes_installed"
    return 0
  fi

  curl -fsSL "${HERMES_AGENT_INSTALL_URL}" | run_as_clawsimple env -i \
    "HOME=${INSTALL_DIR}" \
    "USER=${CLAWSIMPLE_USER}" \
    "LOGNAME=${CLAWSIMPLE_USER}" \
    "SHELL=/bin/bash" \
    "HERMES_HOME=${HERMES_AGENT_HOME}" \
    "HERMES_INSTALL_DIR=${HERMES_AGENT_DIR}" \
    "XDG_CONFIG_HOME=${INSTALL_DIR}/.config" \
    "XDG_CACHE_HOME=${INSTALL_DIR}/.cache" \
    "XDG_DATA_HOME=${INSTALL_DIR}/.local/share" \
    "UV_CACHE_DIR=${INSTALL_DIR}/.cache/uv" \
    "UV_PYTHON_INSTALL_DIR=${INSTALL_DIR}/.local/share/uv/python" \
    "PATH=${PATH}" \
    bash -c 'cd "$1" && shift && exec bash -s -- "$@"' bash "${INSTALL_DIR}" --skip-setup --skip-browser --branch "${HERMES_AGENT_BRANCH}" --hermes-home "${HERMES_AGENT_HOME}" --dir "${HERMES_AGENT_DIR}" || error_exit "E_INSTALL" "Failed to install Hermes Agent."

  if [ ! -x "${HERMES_AGENT_DIR}/venv/bin/python" ]; then
    error_exit "E_INSTALL" "Hermes Agent Python runtime not found after installation."
  fi
  if ! "${HERMES_AGENT_DIR}/venv/bin/python" -m hermes_cli.main --help >/dev/null 2>&1; then
    error_exit "E_INSTALL" "Hermes Agent CLI is not available after installation."
  fi
  disable_default_hermes_gateway
  log_info "Hermes Agent installed at: ${HERMES_AGENT_DIR}"
  report_phase "hermes_installed"
}

write_config() {
  log_info "Writing configuration..."

  local existing_env="${INSTALL_DIR}/.env"
  local app_env="${INSTALL_DIR}/.env.app"
  local existing_api_base=""
  local existing_deploy_token=""
  local existing_searxng_base_url=""
  local existing_preset_proxy_base_url=""
  local existing_preset_proxy_model=""
  local existing_preset_proxy_models=""
  local existing_preset_proxy_key=""
  local existing_runner_notify_url=""
  local app_env_exists_before_write="0"

  if [ -f "${app_env}" ]; then
    app_env_exists_before_write="1"
  fi

  if [ -f "${existing_env}" ]; then
    existing_api_base="$(grep -E '^CLAWSIMPLE_API_BASE_URL=' "${existing_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    existing_runner_notify_url="$(grep -E '^RUNNER_NOTIFY_URL=' "${existing_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    existing_deploy_token="$(grep -E '^DEPLOY_AGENT_TOKEN=' "${existing_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    existing_searxng_base_url="$(grep -E '^SEARXNG_BASE_URL=' "${existing_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    existing_preset_proxy_base_url="$(grep -E '^PRESET_PROXY_BASE_URL=' "${existing_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    existing_preset_proxy_model="$(grep -E '^PRESET_PROXY_MODEL=' "${existing_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    existing_preset_proxy_models="$(grep -E '^PRESET_PROXY_MODELS=' "${existing_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    existing_preset_proxy_key="$(grep -E '^PRESET_PROXY_API_KEY=' "${existing_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
  fi

  if [ -f "${app_env}" ]; then
    if [ -z "${existing_api_base}" ]; then
      existing_api_base="$(grep -E '^CLAWSIMPLE_API_BASE_URL=' "${app_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    fi
    if [ -z "${existing_runner_notify_url}" ]; then
      existing_runner_notify_url="$(grep -E '^RUNNER_NOTIFY_URL=' "${app_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    fi
    if [ -z "${existing_deploy_token}" ]; then
      existing_deploy_token="$(grep -E '^DEPLOY_AGENT_TOKEN=' "${app_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    fi
    if [ -z "${existing_searxng_base_url}" ]; then
      existing_searxng_base_url="$(grep -E '^SEARXNG_BASE_URL=' "${app_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    fi
    if [ -z "${existing_preset_proxy_base_url}" ]; then
      existing_preset_proxy_base_url="$(grep -E '^PRESET_PROXY_BASE_URL=' "${app_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    fi
    if [ -z "${existing_preset_proxy_model}" ]; then
      existing_preset_proxy_model="$(grep -E '^PRESET_PROXY_MODEL=' "${app_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    fi
    if [ -z "${existing_preset_proxy_models}" ]; then
      existing_preset_proxy_models="$(grep -E '^PRESET_PROXY_MODELS=' "${app_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    fi
    if [ -z "${existing_preset_proxy_key}" ]; then
      existing_preset_proxy_key="$(grep -E '^PRESET_PROXY_API_KEY=' "${app_env}" | tail -n 1 | cut -d '=' -f2- | xargs || true)"
    fi
  fi

  if [ -f "${app_env}" ]; then
    local backup
    backup="${app_env}.bak.$(date +%s)"
    ${SUDO} cp "${app_env}" "$backup"
    log_warn "Existing .env.app backed up to ${backup}."
  fi

  local final_api_base="${CLAWSIMPLE_API_BASE_URL}"
  if [ -z "${final_api_base}" ] && [ -n "${existing_api_base}" ]; then
    final_api_base="${existing_api_base}"
  fi
  local final_runner_notify_url="${RUNNER_NOTIFY_URL}"
  if [ -z "${final_runner_notify_url}" ] && [ -n "${existing_runner_notify_url}" ]; then
    final_runner_notify_url="${existing_runner_notify_url}"
  fi

  local final_deploy_token="${DEPLOY_AGENT_TOKEN}"
  if [ -z "${final_deploy_token}" ] && [ -n "${existing_deploy_token}" ]; then
    local rotated_token=""
    if [ -n "${SID}" ] && [ -n "${final_api_base}" ]; then
      rotated_token="$(rotate_deploy_token "${final_api_base}" "${SID}" "${existing_deploy_token}" || true)"
    fi

    if [ -n "${rotated_token}" ]; then
      final_deploy_token="${rotated_token}"
      log_info "Rotated DEPLOY_AGENT_TOKEN via control-plane API."
    else
      final_deploy_token="${existing_deploy_token}"
      if [ "${app_env_exists_before_write}" = "0" ]; then
        log_warn "Rebuilding .env.app with existing DEPLOY_AGENT_TOKEN (rotation skipped/failed)."
      fi
    fi
  fi

  if [ -n "${SID}" ] && [ -z "${final_deploy_token}" ]; then
    error_exit "E_CONFIG" "DEPLOY_AGENT_TOKEN is missing for managed deployment."
  fi

  local final_searxng_base_url=""
  if [ -n "${final_api_base}" ] && [ -n "${SID}" ] && [ -n "${final_deploy_token}" ]; then
    final_searxng_base_url="${final_api_base%/}/api/deploy/${SID}/managed/web/search/searxng/${final_deploy_token}"
  fi

  local final_exa_base_url=""
  if [ -n "${final_api_base}" ] && [ -n "${SID}" ]; then
    final_exa_base_url="${final_api_base%/}/api/deploy/${SID}/managed/web/search/exa"
  fi

  local final_preset_proxy_base_url="${PRESET_PROXY_BASE_URL}"
  if [ -z "${final_preset_proxy_base_url}" ] && [ -n "${existing_preset_proxy_base_url}" ]; then
    final_preset_proxy_base_url="${existing_preset_proxy_base_url}"
  fi
  local final_preset_proxy_model="${PRESET_PROXY_MODEL}"
  if [ -z "${final_preset_proxy_model}" ] && [ -n "${existing_preset_proxy_model}" ]; then
    final_preset_proxy_model="${existing_preset_proxy_model}"
  fi
  local final_preset_proxy_models="${PRESET_PROXY_MODELS}"
  if [ -z "${final_preset_proxy_models}" ] && [ -n "${existing_preset_proxy_models}" ]; then
    final_preset_proxy_models="${existing_preset_proxy_models}"
  fi
  local final_preset_proxy_key="${PRESET_PROXY_KEY}"
  if [ -z "${final_preset_proxy_key}" ] && [ -n "${existing_preset_proxy_key}" ]; then
    final_preset_proxy_key="${existing_preset_proxy_key}"
  fi

  ${SUDO} tee "${app_env}" > /dev/null << EOF
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=${TG_TOKEN}
TELEGRAM_ALLOWED_USER_IDS=${TG_ALLOW}

# AI Configuration
PRESET_PROXY_BASE_URL=${final_preset_proxy_base_url}
PRESET_PROXY_MODEL=${final_preset_proxy_model}
PRESET_PROXY_MODELS=${final_preset_proxy_models}
PRESET_PROXY_API_KEY=${final_preset_proxy_key}
SID=${SID}
DEPLOY_AGENT_TOKEN=${final_deploy_token}
CLAWSIMPLE_API_BASE_URL=${final_api_base}
RUNNER_NOTIFY_URL=${final_runner_notify_url}
EXA_BASE_URL=${final_exa_base_url}
SEARXNG_BASE_URL=${final_searxng_base_url}
SEARXNG_URL=${final_searxng_base_url}

# Language
LANGUAGE=${INSTALL_LANG}

# Logs
LOG_LEVEL=info
LOG_DIR=${INSTALL_DIR}/logs
CLAWSIMPLE_SERVICE_NAME=${SERVICE_NAME}

# Service resilience + alerts
CLAWSIMPLE_RESTART_POLICY=${CLAWSIMPLE_RESTART_POLICY}
CLAWSIMPLE_START_LIMIT_INTERVAL_SEC=${CLAWSIMPLE_START_LIMIT_INTERVAL_SEC}
CLAWSIMPLE_START_LIMIT_BURST=${CLAWSIMPLE_START_LIMIT_BURST}
CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL=${CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL}

# Security hardening toggles
INSTALL_AUDITD=${INSTALL_AUDITD}
EOF

  ${SUDO} chmod 600 "${app_env}"
  ${SUDO} chown "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "${app_env}"

  # Backward compatibility: older scripts/services still read ${INSTALL_DIR}/.env.
  ${SUDO} ln -sfn "${app_env}" "${existing_env}"
  ${SUDO} chown -h "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "${existing_env}"
}

ensure_runtime_dirs() {
  # Ensure runtime log dir is writable by the service user.
  ${SUDO} mkdir -p /tmp/openclaw
  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" /tmp/openclaw
  ${SUDO} chmod 700 /tmp/openclaw

  # Ensure /tmp/jiti exists with correct permissions for Node.js/jiti
  ${SUDO} mkdir -p /tmp/jiti
  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" /tmp/jiti
  ${SUDO} chmod 755 /tmp/jiti
}

configure_sudo_policy() {
  local sudoers_path="/etc/sudoers.d/clawsimple-openclaw"

  case "$OPENCLAW_SUDO_MODE" in
    approved-any)
      log_warn "Enabling broad sudo mode: ${CLAWSIMPLE_USER} can run any sudo command without password."
      ${SUDO} tee "$sudoers_path" > /dev/null << EOF
# Managed by ClawSimple installer
Defaults:${CLAWSIMPLE_USER} !requiretty
${CLAWSIMPLE_USER} ALL=(root) NOPASSWD: ALL
EOF
      ${SUDO} chmod 440 "$sudoers_path"
      ${SUDO} visudo -cf "$sudoers_path" >/dev/null \
        || error_exit "E_CONFIG" "Invalid sudoers config for OPENCLAW_SUDO_MODE=${OPENCLAW_SUDO_MODE}."
      ;;
    strict|"")
      log_info "Using strict sudo mode (no broad sudo privileges)."
      if [ -f "$sudoers_path" ]; then
        ${SUDO} rm -f "$sudoers_path"
      fi
      ;;
    *)
      error_exit "E_CONFIG" "Invalid OPENCLAW_SUDO_MODE: ${OPENCLAW_SUDO_MODE}. Use 'strict' or 'approved-any'."
      ;;
  esac
}

init_openclaw_config() {
  local config_path="${INSTALL_DIR}/.openclaw/openclaw.json"

  if [ ! -f "$config_path" ]; then
    log_info "Initializing openclaw config..."

    run_openclaw onboard --non-interactive --accept-risk --mode local \
      --workspace "${INSTALL_DIR}/.openclaw/workspace" --gateway-port "${GATEWAY_PORT}" --skip-daemon --skip-channels --skip-skills --skip-ui --skip-health \
      || error_exit "E_CONFIG" "Failed to initialize openclaw config."
  else
    log_info "openclaw config already exists."
  fi
}

configure_web_tools_defaults() {
  local config_path="${INSTALL_DIR}/.openclaw/openclaw.json"
  local exa_base_url="${EXA_BASE_URL:-}"

  if [ ! -f "${config_path}" ]; then
    return
  fi

  node - "${config_path}" "${exa_base_url}" "${DEPLOY_AGENT_TOKEN}" <<'NODE'
const fs = require("fs");

const [configPath, exaBaseUrl, deployAgentToken] = process.argv.slice(2);

function ensureObject(parent, key) {
  const value = parent?.[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const next = {};
  parent[key] = next;
  return next;
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const tools = ensureObject(config, "tools");
const web = ensureObject(tools, "web");

// Search: always managed via Exa provider with custom baseUrl.
// The apiKey references $DEPLOY_AGENT_TOKEN from .env.app, resolved at runtime.
if (exaBaseUrl && deployAgentToken) {
  const search = ensureObject(web, "search");
  search.provider = "exa";

  const plugins = ensureObject(config, "plugins");
  const entries = ensureObject(plugins, "entries");
  const exa = ensureObject(entries, "exa");
  const exaConfig = ensureObject(exa, "config");
  const webSearch = ensureObject(exaConfig, "webSearch");
  webSearch.apiKey = "${DEPLOY_AGENT_TOKEN}";
  webSearch.baseUrl = exaBaseUrl;
}

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
NODE
}

configure_gateway() {
  log_info "Configuring gateway and channels..."

  # Build Telegram allowlist (tg:<id>) from comma-separated TG_ALLOW.
  local allow_entries=()
  local raw_ids
  IFS=',' read -r -a raw_ids <<< "$TG_ALLOW"
  for raw_id in "${raw_ids[@]}"; do
    local trimmed
    trimmed="$(echo "$raw_id" | xargs)"
    if [ -n "$trimmed" ]; then
      allow_entries+=("\"tg:${trimmed}\"")
    fi
  done

  local allow_json="[]"
  if [ ${#allow_entries[@]} -gt 0 ]; then
    allow_json="[$(IFS=,; echo "${allow_entries[*]}")]"
  fi

  local config_path="${INSTALL_DIR}/.openclaw/openclaw.json"
  ${SUDO} node - "$config_path" "$allow_json" "$TG_TOKEN" <<'NODE' \
    || error_exit "E_CONFIG" "Failed to configure gateway and Telegram channel."
const fs = require("fs");

const [configPath, allowJsonRaw, tgToken] = process.argv.slice(2);
const allowFrom = JSON.parse(allowJsonRaw || "[]");

function ensureObject(parent, key) {
  const value = parent?.[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const next = {};
  parent[key] = next;
  return next;
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const gateway = ensureObject(config, "gateway");
gateway.mode = "local";

const channels = ensureObject(config, "channels");
const existingTelegram = channels.telegram && typeof channels.telegram === "object"
  ? channels.telegram
  : {};
channels.telegram = {
  ...existingTelegram,
  enabled: true,
  dmPolicy: "allowlist",
  allowFrom,
  groupPolicy: "allowlist",
  groupAllowFrom: allowFrom,
  groups: { "*": { requireMention: false } },
  botToken: tgToken,
};

const plugins = ensureObject(config, "plugins");
const entries = ensureObject(plugins, "entries");
entries.telegram = {
  ...(entries.telegram && typeof entries.telegram === "object" ? entries.telegram : {}),
  enabled: true,
};
for (const pluginId of ["device-pair", "phone-control", "bonjour"]) {
  entries[pluginId] = {
    ...(entries[pluginId] && typeof entries[pluginId] === "object" ? entries[pluginId] : {}),
    enabled: false,
  };
}

const discovery = ensureObject(config, "discovery");
const mdns = ensureObject(discovery, "mdns");
mdns.mode = "off";

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
NODE

  if [ -n "$PRESET_PROXY_KEY" ]; then
    ${SUDO} node - "$config_path" "$PRESET_PROXY_MODEL" "$PRESET_PROXY_MODELS" "$PRESET_PROXY_BASE_URL" <<'NODE' \
      || error_exit "E_CONFIG" "Failed to configure preset proxy provider."
const fs = require("fs");

const [configPath, primaryModelRaw, modelsCsvRaw, baseUrlRaw] = process.argv.slice(2);
const providerId = "clawsimple";
const primaryModel = primaryModelRaw || "";
const modelsCsv = modelsCsvRaw || "";
const baseUrl = baseUrlRaw || "";

function ensureObject(parent, key) {
  const value = parent?.[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const next = {};
  parent[key] = next;
  return next;
}

function assertModelId(value) {
  if (!value || /["\\]/.test(value)) {
    throw new Error(`Invalid model id: ${value}`);
  }
}

assertModelId(primaryModel);
if (!baseUrl) throw new Error("PRESET_PROXY_BASE_URL is required.");

const modelIds = [primaryModel];
for (const raw of modelsCsv.split(",")) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === primaryModel) continue;
  assertModelId(trimmed);
  modelIds.push(trimmed);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const models = ensureObject(config, "models");
models.mode = "merge";
const providers = ensureObject(models, "providers");
providers[providerId] = {
  baseUrl,
  apiKey: "${PRESET_PROXY_API_KEY}",
  api: "openai-completions",
  models: modelIds.map((id) => ({ id, name: id })),
};

const agents = ensureObject(config, "agents");
const defaults = ensureObject(agents, "defaults");
defaults.model = {
  primary: `${providerId}/${primaryModel}`,
  ...(modelIds.length > 1
    ? { fallbacks: modelIds.slice(1).map((id) => `${providerId}/${id}`) }
    : {}),
};
defaults.models = Object.fromEntries(
  modelIds.map((id) => [`${providerId}/${id}`, {}]),
);

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
NODE
  else
    error_exit "E_CONFIG" "PRESET_PROXY_KEY is required; no AI provider configured."
  fi
}

configure_hermes_runtime() {
  case "${HERMES_AGENT_INSTALL_ENABLED,,}" in
    1|true|yes|on)
      ;;
    *)
      return 0
      ;;
  esac

  if [ ! -x "${HERMES_AGENT_DIR}/venv/bin/python" ]; then
    log_warn "Hermes runtime config skipped: Hermes Agent is not installed."
    return 0
  fi

  local config_path="${INSTALL_DIR}/.openclaw/openclaw.json"
  local app_env="${INSTALL_DIR}/.env.app"
  if [ ! -f "${config_path}" ] || [ ! -f "${app_env}" ]; then
    log_warn "Hermes runtime config skipped: OpenClaw config or .env.app is missing."
    return 0
  fi

  log_info "Configuring Hermes runtime..."
  ${SUDO} mkdir -p "${HERMES_AGENT_HOME}"

  ${SUDO} node - "${config_path}" "${app_env}" "${HERMES_AGENT_HOME}" <<'NODE'
const fs = require("fs");
const path = require("path");

const [configPath, envPath, hermesHome] = process.argv.slice(2);

function readEnv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function resolveEnvReference(value, env) {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (!match) return raw;
  return env[match[1]] || "";
}

function collectAllowedUsers(telegram) {
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
  pushValues(telegram.allowFrom);
  pushValues(telegram.groupAllowFrom);
  return values;
}

function buildConfigYaml({ model, providerId, baseUrl, providerModels, webBackend }) {
  const lines = [
    "model:",
    `  default: ${JSON.stringify(model)}`,
    `  provider: ${JSON.stringify(providerId)}`,
    `  base_url: ${JSON.stringify(baseUrl)}`,
  ];
  if (providerId !== "custom" && providerModels.length > 0) {
    lines.push(
      "providers:",
      `  ${providerId}:`,
      "    name: ClawSimple Managed",
      `    base_url: ${JSON.stringify(baseUrl)}`,
      "    key_env: OPENAI_API_KEY",
      `    default_model: ${JSON.stringify(model)}`,
      "    discover_models: false",
      "    models:",
    );
    for (const modelId of providerModels) {
      lines.push(`      ${JSON.stringify(modelId)}: {}`);
    }
  }
  if (webBackend) {
    lines.push("web:", `  backend: ${JSON.stringify(webBackend)}`);
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

function buildEnv({
  telegramBotToken,
  allowedUsers,
  baseUrl,
  apiKey,
  model,
  searxngBaseUrl,
}) {
  const lines = [
    "TERMINAL_MODAL_IMAGE=nikolaik/python-nodejs:python3.11-nodejs20",
    "TERMINAL_TIMEOUT=60",
    "TERMINAL_LIFETIME_SECONDS=300",
    `TELEGRAM_BOT_TOKEN=${JSON.stringify(telegramBotToken)}`,
    `TELEGRAM_ALLOWED_USERS=${JSON.stringify(allowedUsers.join(","))}`,
    `OPENAI_BASE_URL=${JSON.stringify(baseUrl)}`,
    `OPENAI_API_KEY=${JSON.stringify(apiKey)}`,
    `HERMES_MODEL=${JSON.stringify(model)}`,
  ];
  if (searxngBaseUrl) {
    lines.push(
      `SEARXNG_BASE_URL=${JSON.stringify(searxngBaseUrl)}`,
      `SEARXNG_URL=${JSON.stringify(searxngBaseUrl)}`,
      "SEARCH_CRAWL_MODE=managed",
    );
  }
  lines.push("API_SERVER_ENABLED=false", "");
  return lines.join("\n");
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const env = readEnv(fs.readFileSync(envPath, "utf8"));
const telegram = config.channels?.telegram && typeof config.channels.telegram === "object"
  ? config.channels.telegram
  : {};
const telegramBotToken =
  (typeof telegram.botToken === "string" ? telegram.botToken.trim() : "") ||
  env.TELEGRAM_BOT_TOKEN ||
  "";
const allowedUsers = collectAllowedUsers(telegram);
const fullModel =
  typeof config.agents?.defaults?.model === "string"
    ? config.agents.defaults.model.trim()
    : typeof config.agents?.defaults?.model?.primary === "string"
      ? config.agents.defaults.model.primary.trim()
      : "";
const providerId = fullModel.includes("/") ? fullModel.split("/")[0].trim() : "";
const model = providerId ? fullModel.split("/").slice(1).join("/").trim() : fullModel;
const provider = providerId ? config.models?.providers?.[providerId] : null;

if (!telegramBotToken || allowedUsers.length === 0 || !provider || !model) {
  process.exit(0);
}

const baseUrl = typeof provider.baseUrl === "string" ? provider.baseUrl.trim() : "";
const apiKey = resolveEnvReference(provider.apiKey, env);
if (!baseUrl || !apiKey) {
  process.exit(0);
}

const providerModels = Array.isArray(provider.models)
  ? provider.models
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && typeof item.id === "string") return item.id.trim();
        return "";
      })
      .filter(Boolean)
  : [];
const searxngBaseUrl = env.SEARXNG_BASE_URL || "";

fs.mkdirSync(hermesHome, { recursive: true });
fs.writeFileSync(
  path.join(hermesHome, "config.yaml"),
  buildConfigYaml({
    model,
    providerId,
    baseUrl,
    providerModels,
    webBackend: searxngBaseUrl ? "searxng" : "",
  }),
);
fs.writeFileSync(
  path.join(hermesHome, ".env"),
  buildEnv({
    telegramBotToken,
    allowedUsers,
    baseUrl,
    apiKey,
    model,
    searxngBaseUrl,
  }),
);
NODE

  if [ -f "${HERMES_AGENT_HOME}/.env" ]; then
    ${SUDO} chmod 600 "${HERMES_AGENT_HOME}/.env"
  fi
  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "${HERMES_AGENT_HOME%/*}" "${HERMES_AGENT_HOME}"
}

set_openclaw_main_telegram_enabled() {
  local enabled="$1"
  local config_path="${INSTALL_DIR}/.openclaw/openclaw.json"
  if [ ! -f "$config_path" ]; then
    return 0
  fi
  ${SUDO} node - "$config_path" "$enabled" <<'NODE'
const fs = require("fs");

const [configPath, enabledRaw] = process.argv.slice(2);
const enabled = enabledRaw === "true";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

if (!config.channels || typeof config.channels !== "object") config.channels = {};
if (!config.channels.telegram || typeof config.channels.telegram !== "object") {
  config.channels.telegram = {};
}
config.channels.telegram.enabled = enabled;

if (!config.plugins || typeof config.plugins !== "object") config.plugins = {};
if (!config.plugins.entries || typeof config.plugins.entries !== "object") {
  config.plugins.entries = {};
}
if (!config.plugins.entries.telegram || typeof config.plugins.entries.telegram !== "object") {
  config.plugins.entries.telegram = {};
}
config.plugins.entries.telegram.enabled = enabled;

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
NODE
}

discover_hermes_main_service() {
  local expected_home="${HERMES_AGENT_HOME}"
  local preferred="hermes-gateway-main.service"
  local unit=""

  if command -v systemctl >/dev/null 2>&1; then
    local preferred_home=""
    preferred_home="$(${SUDO} systemctl show "$preferred" -p Environment --value 2>/dev/null | tr ' ' '\n' | awk -F= '$1 == "HERMES_HOME" {print $2; exit}' || true)"
    if [ "$preferred_home" = "$expected_home" ]; then
      printf '%s' "${preferred%.service}"
      return 0
    fi

    while read -r unit _; do
      [ -z "$unit" ] && continue
      local home=""
      home="$(${SUDO} systemctl show "$unit" -p Environment --value 2>/dev/null | tr ' ' '\n' | awk -F= '$1 == "HERMES_HOME" {print $2; exit}' || true)"
      if [ "$home" = "$expected_home" ]; then
        printf '%s' "${unit%.service}"
        return 0
      fi
    done < <(${SUDO} systemctl list-unit-files 'hermes-gateway*.service' --no-legend --no-pager 2>/dev/null || true)
  fi

  printf '%s' "hermes-gateway"
}

install_hermes_main_gateway() {
  if [ ! -x "${HERMES_AGENT_DIR}/venv/bin/python" ]; then
    error_exit "E_INSTALL" "Hermes Agent Python runtime not found."
  fi
  if [ ! -f "${HERMES_AGENT_HOME}/.env" ] || [ ! -f "${HERMES_AGENT_HOME}/config.yaml" ]; then
    error_exit "E_CONFIG" "Hermes main runtime config is missing."
  fi

  local hermes_python="${HERMES_AGENT_DIR}/venv/bin/python"
  local hermes_bin_dir="${HERMES_AGENT_DIR}/venv/bin"
  local hermes_node_bin_dir="${HERMES_AGENT_DIR}/node_modules/.bin"
  ${SUDO} mkdir -p \
    "${HERMES_AGENT_HOME}" \
    "${INSTALL_DIR}/.config" \
    "${INSTALL_DIR}/.cache" \
    "${INSTALL_DIR}/.local/share"
  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" \
    "${HERMES_AGENT_HOME%/*}" \
    "${HERMES_AGENT_HOME}" \
    "${HERMES_AGENT_DIR}" \
    "${INSTALL_DIR}/.config" \
    "${INSTALL_DIR}/.cache" \
    "${INSTALL_DIR}/.local"

  {
    printf 'n\ny\n' | ${SUDO} env \
      HOME="${INSTALL_DIR}" \
      HERMES_HOME="${HERMES_AGENT_HOME}" \
      XDG_CONFIG_HOME="${INSTALL_DIR}/.config" \
      XDG_CACHE_HOME="${INSTALL_DIR}/.cache" \
      XDG_DATA_HOME="${INSTALL_DIR}/.local/share" \
      PATH="${hermes_bin_dir}:${hermes_node_bin_dir}:${INSTALL_DIR}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
      VIRTUAL_ENV="${HERMES_AGENT_DIR}/venv" \
      "$hermes_python" -m hermes_cli.main gateway install --system --run-as-user "$CLAWSIMPLE_USER" --force
  } >&2 \
    || error_exit "E_SERVICE" "Failed to install Hermes gateway service."

  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" \
    "${HERMES_AGENT_HOME%/*}" \
    "${HERMES_AGENT_HOME}" \
    "${HERMES_AGENT_DIR}" \
    "${INSTALL_DIR}/.config" \
    "${INSTALL_DIR}/.cache" \
    "${INSTALL_DIR}/.local"
  ${SUDO} systemctl daemon-reload

  local hermes_service_name
  hermes_service_name="$(discover_hermes_main_service)"
  if [ -z "$hermes_service_name" ]; then
    error_exit "E_SERVICE" "Hermes gateway service was not discovered."
  fi
  ${SUDO} systemctl enable "${hermes_service_name}.service"
  ${SUDO} systemctl restart "${hermes_service_name}.service"
  sleep 2
  if ! ${SUDO} systemctl is-active --quiet "${hermes_service_name}.service"; then
    error_exit "E_SERVICE" "Hermes gateway service failed to start."
  fi
  printf '%s' "$hermes_service_name"
}

write_main_runtime_state() {
  local active_runtime="$1"
  local status="$2"
  local hermes_service_name="${3:-}"
  local openclaw_state="${4:-unknown}"
  local hermes_state="${5:-inactive}"
  local state_dir="${INSTALL_DIR}/.clawsimple-agent/runtime-agents"
  local state_path="${state_dir}/main.json"
  ${SUDO} mkdir -p "$state_dir"
  ${SUDO} node - "$state_path" "$active_runtime" "$status" "$TARGET_AGENT_RUNTIME" "$hermes_service_name" "$openclaw_state" "$hermes_state" <<'NODE'
const fs = require("fs");

const [
  statePath,
  activeRuntime,
  status,
  targetRuntime,
  hermesServiceName,
  openclawState,
  hermesState,
] = process.argv.slice(2);
const payload = {
  agent_id: "main",
  account_id: "main",
  active_runtime: activeRuntime,
  target_runtime: targetRuntime,
  status,
  openclaw_service_state: openclawState,
  hermes_service_state: hermesState,
  updated_at: new Date().toISOString(),
};
if (hermesServiceName) payload.hermes_service_name = hermesServiceName;
fs.writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
NODE
  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "$state_dir"
}

configure_target_runtime() {
  case "$TARGET_AGENT_RUNTIME" in
    hermes)
      log_info "Activating Hermes runtime for main Agent..."
      set_openclaw_main_telegram_enabled false
      fix_openclaw_permissions
      local hermes_service_name
      hermes_service_name="$(install_hermes_main_gateway)"
      write_main_runtime_state "hermes" "succeeded" "$hermes_service_name" "inactive" "active"
      ;;
    openclaw)
      set_openclaw_main_telegram_enabled true
      ${SUDO} systemctl disable --now hermes-gateway-main.service >/dev/null 2>&1 || true
      ${SUDO} systemctl reset-failed hermes-gateway-main.service >/dev/null 2>&1 || true
      write_main_runtime_state "openclaw" "succeeded" "" "inactive" "inactive"
      ;;
  esac
}

fix_workspace_permissions() {
  log_info "Fixing workspace permissions..."
  ${SUDO} mkdir -p "${INSTALL_DIR}/.openclaw/workspace"
  ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "${INSTALL_DIR}/.openclaw/workspace"
  ${SUDO} find "${INSTALL_DIR}/.openclaw/workspace" -type d -exec chmod 700 {} \;
  # Backward compatibility: preserve permissions for legacy workspace path.
  if [ -d "${INSTALL_DIR}/data" ]; then
    ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "${INSTALL_DIR}/data"
    ${SUDO} find "${INSTALL_DIR}/data" -type d -exec chmod 700 {} \;
  fi
}

fix_openclaw_permissions() {
  ${SUDO} chown "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "${INSTALL_DIR}/.openclaw"
  ${SUDO} chmod 755 "${INSTALL_DIR}/.openclaw"
  ${SUDO} chmod 644 "${INSTALL_DIR}/.openclaw/openclaw.json" 2>/dev/null || true

  # Keep the mutable runtime trees owned by the service user without walking
  # large dependency caches such as plugin-runtime-deps/node_modules.
  for runtime_path in \
    "${INSTALL_DIR}/.openclaw/agents" \
    "${INSTALL_DIR}/.openclaw/canvas" \
    "${INSTALL_DIR}/.openclaw/identity" \
    "${INSTALL_DIR}/.openclaw/logs" \
    "${INSTALL_DIR}/.openclaw/tasks" \
    "${INSTALL_DIR}/.openclaw/telegram" \
    "${INSTALL_DIR}/.openclaw/workspace"; do
    if [ -e "$runtime_path" ]; then
      ${SUDO} chown -R "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "$runtime_path"
    fi
  done
}

create_service() {
  log_info "Creating systemd service..."
  local app_env="${INSTALL_DIR}/.env.app"
  local legacy_env="${INSTALL_DIR}/.env"

  ${SUDO} tee "/etc/systemd/system/${SERVICE_NAME}-failure@.service" > /dev/null << EOF
[Unit]
Description=ClawSimple Service Failure Handler (%i)
After=network.target

[Service]
Type=oneshot
User=root
ExecStart=/bin/bash -lc 'set -euo pipefail; TS="\$(date -u +%%FT%%TZ)"; UNIT="%i"; HOST="\$(hostname)"; APP_ENV="${app_env}"; LEGACY_ENV="${legacy_env}"; WEBHOOK=""; if [ -f "\$APP_ENV" ]; then WEBHOOK="\$(grep -E "^CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL=" "\$APP_ENV" | tail -n 1 | cut -d "=" -f2- | tr -d "\\r")"; fi; if [ -z "\$WEBHOOK" ] && [ -f "\$LEGACY_ENV" ]; then WEBHOOK="\$(grep -E "^CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL=" "\$LEGACY_ENV" | tail -n 1 | cut -d "=" -f2- | tr -d "\\r")"; fi; mkdir -p ${INSTALL_DIR}/logs; printf "%s unit=%s host=%s\n" "\$TS" "\$UNIT" "\$HOST" >> ${INSTALL_DIR}/logs/${SERVICE_NAME}-failures.log; /usr/bin/logger -t ${SERVICE_NAME} "failure captured unit=\$UNIT host=\$HOST ts=\$TS"; if [ -n "\$WEBHOOK" ] && command -v curl >/dev/null 2>&1; then MSG="clawsimple start-limit hit host=\$HOST unit=\$UNIT ts=\$TS"; curl -fsS -X POST "\$WEBHOOK" -H "Content-Type: application/json" -d "{\"content\":\"\$MSG\"}" >/dev/null || true; fi'
EOF

  ${SUDO} tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null << EOF
[Unit]
Description=ClawSimple Service
After=network.target
StartLimitIntervalSec=${CLAWSIMPLE_START_LIMIT_INTERVAL_SEC}
StartLimitBurst=${CLAWSIMPLE_START_LIMIT_BURST}
OnFailure=${SERVICE_NAME}-failure@%n.service

[Service]
Type=simple
User=${CLAWSIMPLE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-${legacy_env}
EnvironmentFile=-${app_env}
Environment=HOME=${INSTALL_DIR}
Environment=XDG_CONFIG_HOME=${INSTALL_DIR}/.clawsimple-agent/.config
Environment=OPENCLAW_DISABLE_BONJOUR=1
ExecStart=${OPENCLAW_BIN} gateway --port ${GATEWAY_PORT}
Restart=${CLAWSIMPLE_RESTART_POLICY}
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

  ${SUDO} systemctl daemon-reload
  ${SUDO} systemctl enable "${SERVICE_NAME}"
}

configure_auditd() {
  local enabled="${INSTALL_AUDITD,,}"
  case "$enabled" in
    1|true|yes|on)
      ;;
    *)
      log_info "auditd setup skipped (INSTALL_AUDITD=${INSTALL_AUDITD})."
      return 0
      ;;
  esac

  log_info "Configuring auditd for systemctl execution tracing (best-effort)..."
  if ! command -v apt-get >/dev/null 2>&1; then
    log_warn "auditd skipped: apt-get not available."
    return 0
  fi

  if ! ${SUDO} apt-get install -y auditd audispd-plugins >/dev/null 2>&1; then
    log_warn "auditd install failed; continuing without auditd."
    return 0
  fi

  ${SUDO} tee /etc/audit/rules.d/clawsimple-systemctl.rules > /dev/null << EOF
-w /usr/bin/systemctl -p x -k clawsimple_systemctl_exec
EOF

  if [ -f /etc/audit/auditd.conf ]; then
    ${SUDO} sed -i 's/^[[:space:]]*max_log_file[[:space:]]*=.*/max_log_file = 20/' /etc/audit/auditd.conf || true
    ${SUDO} sed -i 's/^[[:space:]]*num_logs[[:space:]]*=.*/num_logs = 5/' /etc/audit/auditd.conf || true
    ${SUDO} sed -i 's/^[[:space:]]*max_log_file_action[[:space:]]*=.*/max_log_file_action = ROTATE/' /etc/audit/auditd.conf || true
    ${SUDO} sed -i 's/^[[:space:]]*space_left_action[[:space:]]*=.*/space_left_action = SYSLOG/' /etc/audit/auditd.conf || true
    ${SUDO} sed -i 's/^[[:space:]]*admin_space_left_action[[:space:]]*=.*/admin_space_left_action = SYSLOG/' /etc/audit/auditd.conf || true
    ${SUDO} sed -i 's/^[[:space:]]*disk_full_action[[:space:]]*=.*/disk_full_action = SYSLOG/' /etc/audit/auditd.conf || true
    ${SUDO} sed -i 's/^[[:space:]]*disk_error_action[[:space:]]*=.*/disk_error_action = SYSLOG/' /etc/audit/auditd.conf || true
  fi

  ${SUDO} systemctl enable auditd >/dev/null 2>&1 || true
  ${SUDO} systemctl restart auditd >/dev/null 2>&1 || true
  if command -v augenrules >/dev/null 2>&1; then
    ${SUDO} augenrules --load >/dev/null 2>&1 || true
  fi
  log_info "auditd configuration applied."
}

create_jobs_runner() {
  local app_env="${INSTALL_DIR}/.env.app"
  local legacy_env="${INSTALL_DIR}/.env"
  local agent_state_dir="${INSTALL_DIR}/.clawsimple-agent"
  local gcloud_state_dir="${agent_state_dir}/gcloud-config"
  local jobs_user="${CLAWSIMPLE_USER}"
  if [ -z "$SID" ] || [ -z "$DEPLOY_AGENT_TOKEN" ] || [ -z "$CLAWSIMPLE_API_BASE_URL" ]; then
    log_warn "Skill jobs runner skipped (missing SID/DEPLOY_AGENT_TOKEN/CLAWSIMPLE_API_BASE_URL)."
    return 0
  fi

  log_info "Creating agent jobs runner..."

  local runner_source_path="${CLAWSIMPLE_RUNNER_SCRIPT_PATH:-}"
  if [ -n "$runner_source_path" ]; then
    if [ ! -f "$runner_source_path" ]; then
      error_exit "E_CONFIG" "CLAWSIMPLE_RUNNER_SCRIPT_PATH does not point to a file."
    fi
    log_info "Installing agent jobs runner from local override."
    if ! ${SUDO} cp "$runner_source_path" "${INSTALL_DIR}/bin/skill-jobs-runner.mjs"; then
      error_exit "E_CONFIG" "Failed to install local runner script."
    fi
  else
    log_info "Fetching canonical runner script..."
    if ! curl -fsSL \
      -H "authorization: Bearer ${DEPLOY_AGENT_TOKEN}" \
      "${CLAWSIMPLE_API_BASE_URL%/}/api/deploy/${SID}/runner/script" \
      | node -e '
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk.toString(); });
process.stdin.on("end", () => {
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { process.exit(1); }
  const script = typeof parsed.script === "string" ? parsed.script : "";
  if (!script.trim()) process.exit(1);
  process.stdout.write(script);
});
' \
      | ${SUDO} tee "${INSTALL_DIR}/bin/skill-jobs-runner.mjs" > /dev/null; then
      error_exit "E_CONFIG" "Failed to fetch canonical runner script."
    fi
  fi

  ${SUDO} chmod 755 "${INSTALL_DIR}/bin/skill-jobs-runner.mjs"
  ${SUDO} chown "$CLAWSIMPLE_USER:$CLAWSIMPLE_USER" "${INSTALL_DIR}/bin/skill-jobs-runner.mjs"
  ${SUDO} mkdir -p "${agent_state_dir}/.config/gogcli" "${gcloud_state_dir}/logs"
  ${SUDO} chmod 755 "${agent_state_dir}" "${agent_state_dir}/.config" "${agent_state_dir}/.config/gogcli" "${gcloud_state_dir}" "${gcloud_state_dir}/logs"
  ${SUDO} chown -R "${jobs_user}:${jobs_user}" "${agent_state_dir}"

  ${SUDO} tee "/etc/systemd/system/${SERVICE_NAME}-jobs-failure@.service" > /dev/null << EOF
[Unit]
Description=ClawSimple Agent Jobs Failure Handler (%i)
After=network.target

[Service]
Type=oneshot
User=root
ExecStart=/bin/bash -lc 'set -euo pipefail; TS="\$(date -u +%%FT%%TZ)"; UNIT="%i"; mkdir -p ${INSTALL_DIR}/logs; printf "%s unit=%s\\n" "\$TS" "\$UNIT" >> ${INSTALL_DIR}/logs/${SERVICE_NAME}-jobs-failures.log; /usr/bin/logger -t ${SERVICE_NAME}-jobs "failure captured unit=\$UNIT ts=\$TS"'
EOF

  ${SUDO} tee "/etc/systemd/system/${SERVICE_NAME}-jobs.service" > /dev/null << EOF
[Unit]
Description=ClawSimple Agent Jobs Runner
After=network.target ${SERVICE_NAME}.service
StartLimitIntervalSec=${JOBS_START_LIMIT_INTERVAL_SEC}
StartLimitBurst=${JOBS_START_LIMIT_BURST}
OnFailure=${SERVICE_NAME}-jobs-failure@%n.service

[Service]
Type=simple
User=${jobs_user}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-${legacy_env}
EnvironmentFile=-${app_env}
Environment=HOME=${INSTALL_DIR}
Environment=SID=${SID}
Environment=CLAWSIMPLE_INSTALL_DIR=${INSTALL_DIR}
ExecStart=/usr/bin/node ${INSTALL_DIR}/bin/skill-jobs-runner.mjs
Restart=always
RestartSec=${JOBS_RESTART_SEC}

[Install]
WantedBy=multi-user.target
EOF

  ${SUDO} systemctl daemon-reload
  ${SUDO} systemctl enable "${SERVICE_NAME}-jobs"
}

start_service() {
  log_info "Starting ${SERVICE_NAME} service..."
  fix_workspace_permissions
  if ${SUDO} systemctl is-active --quiet "${SERVICE_NAME}"; then
    ${SUDO} systemctl restart "${SERVICE_NAME}"
  else
    ${SUDO} systemctl start "${SERVICE_NAME}"
  fi

  sleep 3

  if ${SUDO} systemctl is-active --quiet "${SERVICE_NAME}"; then
    log_info "Service started successfully."
  else
    error_exit "E_SERVICE" "Service failed to start. Check: journalctl -u ${SERVICE_NAME}"
  fi

  if ${SUDO} systemctl is-enabled --quiet "${SERVICE_NAME}-jobs" 2>/dev/null; then
    if ${SUDO} systemctl is-active --quiet "${SERVICE_NAME}-jobs"; then
      ${SUDO} systemctl restart "${SERVICE_NAME}-jobs"
    else
      ${SUDO} systemctl start "${SERVICE_NAME}-jobs"
    fi
    sleep 2
    if ! ${SUDO} systemctl is-active --quiet "${SERVICE_NAME}-jobs"; then
      error_exit "E_SERVICE" "Jobs runner failed to start. Check: journalctl -u ${SERVICE_NAME}-jobs"
    fi
  fi

}

health_check() {
  log_info "Running health check..."

  if ${SUDO} systemctl is-active --quiet "${SERVICE_NAME}"; then
    log_info "✓ Service is running"
  else
    error_exit "E_HEALTH" "Service is not running."
  fi

  if [ "$TARGET_AGENT_RUNTIME" = "hermes" ]; then
    local state_path="${INSTALL_DIR}/.clawsimple-agent/runtime-agents/main.json"
    local hermes_service_name=""
    if [ -f "$state_path" ]; then
      hermes_service_name="$(node -e '
const fs = require("fs");
try {
  const parsed = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const serviceName = typeof parsed.hermes_service_name === "string" ? parsed.hermes_service_name.trim() : "";
  if (serviceName) process.stdout.write(serviceName);
} catch {}
' "$state_path" 2>/dev/null || true)"
    fi
    [ -z "$hermes_service_name" ] && error_exit "E_HEALTH" "Hermes gateway service is not recorded."
    if ${SUDO} systemctl is-active --quiet "${hermes_service_name}.service"; then
      log_info "✓ Hermes gateway is running"
    else
      error_exit "E_HEALTH" "Hermes gateway is not running."
    fi
  fi

  log_info "Recent logs:"
  ${SUDO} journalctl -u "${SERVICE_NAME}" -n 5 --no-pager
  report_phase "health_verified"
}

completion_report() {
  report_event "completed" "" "" "$(collect_runtime_metadata_json 2>/dev/null || true)"

  echo ""
  echo "=========================================="
  echo "  ClawSimple Installation Complete!"
  echo "=========================================="
  echo ""
  echo "Service Status:"
  ${SUDO} systemctl status "${SERVICE_NAME}" --no-pager -l
  echo ""
  echo "Useful Commands:"
  echo "  Status:   sudo systemctl status ${SERVICE_NAME}"
  echo "  Logs:     sudo journalctl -u ${SERVICE_NAME} -f"
  echo "  Restart:  sudo systemctl restart ${SERVICE_NAME}"
  echo "  Stop:     sudo systemctl stop ${SERVICE_NAME}"
  echo ""
  echo "Installation Directory: ${INSTALL_DIR}"
  echo "Config File: ${INSTALL_DIR}/.env"
  echo ""
}

main() {
  echo "=========================================="
  echo "  ClawSimple Installer v${INSTALLER_VERSION}"
  echo "=========================================="
  echo ""

  ensure_privileges
  parse_args "$@"
  detect_os
  report_event "started"
  install_dependencies
  create_user
  create_directories
  install_openclaw
  install_hermes_agent
  write_config
  ensure_runtime_dirs
  report_phase "runtime_installed"
  configure_sudo_policy
  init_openclaw_config
  configure_web_tools_defaults
  configure_gateway
  configure_hermes_runtime
  fix_workspace_permissions
  fix_openclaw_permissions
  report_phase "bot_configured"
  create_service
  configure_target_runtime
  configure_auditd
  create_jobs_runner
  start_service
  report_phase "service_started"
  health_check
  report_runtime_metadata "health_verified"
  completion_report

  log_info "Installation completed successfully!"
}

main "$@"
