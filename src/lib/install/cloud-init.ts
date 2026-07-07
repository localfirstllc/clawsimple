type CloudInitEnv = {
  TG_TOKEN: string;
  TG_ALLOW: string;
  PRESET_PROXY_BASE_URL?: string;
  PRESET_PROXY_MODEL?: string;
  PRESET_PROXY_MODELS?: string;
  PRESET_PROXY_API_KEY?: string;
  SID?: string;
  LANG?: string;
  NONINTERACTIVE?: string;
  OPENCLAW_VERSION?: string;
  OPENCLAW_SUDO_MODE?: string;
  DEPLOY_AGENT_TOKEN?: string;
  CLAWSIMPLE_API_BASE_URL?: string;
  RUNNER_NOTIFY_URL?: string;
  CLAWSIMPLE_RESTART_POLICY?: string;
  CLAWSIMPLE_START_LIMIT_INTERVAL_SEC?: string;
  CLAWSIMPLE_START_LIMIT_BURST?: string;
  CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL?: string;
  INSTALL_AUDITD?: string;
  CLAWSIMPLE_INSTALL_DIR?: string;
  CLAWSIMPLE_SERVICE_NAME?: string;
  GATEWAY_PORT?: string;
  TARGET_AGENT_RUNTIME?: string;
  INSTALL_EVENT_TOKEN?: string;
};

import { gzipSync } from "zlib";

function encodeBase64(value: string | Buffer) {
  return Buffer.from(value).toString("base64");
}

/**
 * Shell-quote a value so it is safe to use after `KEY=value` in a sourced
 * dotenv file.  We use single quotes and escape any embedded single quote
 * as `'\''` (end quote, escaped quote, resume quote).
 */
function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function buildCloudInit(params: {
  env: CloudInitEnv;
  installScript: string;
  rootPassword?: string;
  completionToken?: string;
  completionUrl?: string;
  statusCheckerPublicKey?: string;
}) {
  const envLines = Object.entries(params.env)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${shellQuote(String(value))}`)
    .join("\n");

  const envB64 = encodeBase64(envLines);
  const scriptGzip = gzipSync(params.installScript);
  const scriptB64 = encodeBase64(scriptGzip);

  const cmdParts = [
    '/tmp/install-bot.sh --noninteractive',
    '--tg-token "$TG_TOKEN"',
    '--tg-allow "$TG_ALLOW"',
  ];

  if (params.env.PRESET_PROXY_BASE_URL) {
    cmdParts.push('--preset-proxy-base-url "$PRESET_PROXY_BASE_URL"');
  }

  if (params.env.PRESET_PROXY_MODEL) {
    cmdParts.push('--preset-proxy-model "$PRESET_PROXY_MODEL"');
  }

  if (params.env.PRESET_PROXY_MODELS) {
    cmdParts.push('--preset-proxy-models "$PRESET_PROXY_MODELS"');
  }

  if (params.env.PRESET_PROXY_API_KEY) {
    cmdParts.push('--preset-proxy-key "$PRESET_PROXY_API_KEY"');
  }

  if (params.env.TARGET_AGENT_RUNTIME) {
    cmdParts.push('--target-runtime "$TARGET_AGENT_RUNTIME"');
  }

  const command = cmdParts.join(" ");

  // Build password authentication and user config
  let usersConfig = "";
  let sshPwAuthConfig = "";
  let chpasswdConfig = "";

  if (params.rootPassword) {
    sshPwAuthConfig = "ssh_pwauth: true\n";
    // Configure chpasswd to set password and disable expiration
    chpasswdConfig = `chpasswd:
  expire: false
  users:
    - name: root
      password: "${params.rootPassword}"
      type: text
`;
  } else {
    // Even without password, ensure we don't have expired password issues
    // though usually only relevant if setting a password.
    // However, for Hetzner, if we don't set a password, they do.
    // To be safe, let's explicitly unlock/expire false if we are managing keys.
    chpasswdConfig = `chpasswd:
  expire: false
`;
  }

  const authorizedKeys = params.statusCheckerPublicKey 
    ? [`command="/usr/local/bin/status-check.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ${params.statusCheckerPublicKey}`]
    : [];

  // Always configure root user if we have password or keys
  if (params.rootPassword || authorizedKeys.length > 0) {
    usersConfig = `users:
  - name: root
${params.rootPassword ? `    lock_passwd: false` : ""}
${authorizedKeys.length > 0 ? `    ssh_authorized_keys:
${authorizedKeys.map(k => `      - '${k}'`).join('\n')}` : ""}
`;
  }
  
  // Status checker script
  const statusCheckScript = `#!/bin/bash
if [ -f /var/lib/cloud/instance/boot-finished ]; then
  echo "STATUS:COMPLETED"
  exit 0
fi
if [ -f /var/lib/cloud/instance/boot-error ]; then
  echo "STATUS:FAILED"
  exit 1
fi
echo "STATUS:RUNNING"
exit 0
`;
  const statusCheckScriptB64 = encodeBase64(statusCheckScript);

  return `#cloud-config
${sshPwAuthConfig}${chpasswdConfig}${usersConfig}write_files:
  - path: /tmp/clawsimple.env
    permissions: '0600'
    encoding: b64
    content: ${envB64}
  - path: /tmp/install-bot.sh
    permissions: '0755'
    encoding: gzip+base64
    content: ${scriptB64}
${params.statusCheckerPublicKey ? `  - path: /usr/local/bin/status-check.sh
    permissions: '0755'
    encoding: b64
    content: ${statusCheckScriptB64}` : ""}
runcmd:
  - |
      set -e
      set -a
      . /tmp/clawsimple.env
      set +a
      ${command}${params.completionToken && params.completionUrl ? `
      
      # Notify backend of deployment completion
      sleep 5
      for i in {1..3}; do
        if curl -X POST "${params.completionUrl}" \\
          -H "Content-Type: application/json" \\
          -d '{"token": "${params.completionToken}"}' \\
          --max-time 30 \\
          --connect-timeout 10 \\
          --retry 2 \\
          --silent \\
          --show-error; then
          echo "✅ Deployment completion notification sent"
          break
        else
          echo "⚠️  Completion notification failed (attempt $i/3)"
          sleep 5
        fi
      done` : ""}
`;
}
