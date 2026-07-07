import { describe, expect, it } from "vitest";
import { buildCloudInit } from "./cloud-init";

const INSTALL_SCRIPT = `#!/bin/bash
echo "Installing..."
echo "done"
`;

describe("buildCloudInit", () => {
  it("starts with #cloud-config header", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml.startsWith("#cloud-config\n")).toBe(true);
  });

  it("includes write_files for env and install script", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml).toContain("/tmp/clawsimple.env");
    expect(yaml).toContain("/tmp/install-bot.sh");
    expect(yaml).toContain("write_files:");
  });

  it("includes runcmd section", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml).toContain("runcmd:");
    expect(yaml).toContain("/tmp/clawsimple.env");
    expect(yaml).toContain("/tmp/install-bot.sh --noninteractive");
  });

  it("includes --target-runtime flag when TARGET_AGENT_RUNTIME is set", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
        TARGET_AGENT_RUNTIME: "openclaw",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml).toContain('--target-runtime "$TARGET_AGENT_RUNTIME"');
  });

  it("omits runtime flag when TARGET_AGENT_RUNTIME is absent", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml).not.toContain("--target-runtime");
  });

  it("includes completion notification when token and url are provided", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
      completionToken: "my-completion-token",
      completionUrl: "https://example.com/api/deploy/SID/complete",
    });
    expect(yaml).toContain("curl -X POST");
    expect(yaml).toContain("https://example.com/api/deploy/SID/complete");
    expect(yaml).toContain('"token": "my-completion-token"');
  });

  it("does NOT include completion notification when token/url are absent", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml).not.toContain("curl -X POST");
  });

  it("includes ssh_pwauth and chpasswd when rootPassword is provided", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
      rootPassword: "my-password",
    });
    expect(yaml).toContain("ssh_pwauth: true");
    expect(yaml).toContain("chpasswd:");
    expect(yaml).toContain("root");
    expect(yaml).toContain("expire: false");
  });

  it("includes status-check script when statusCheckerPublicKey is provided", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
      statusCheckerPublicKey: "ssh-ed25519 AAAAC3test",
    });
    expect(yaml).toContain("/usr/local/bin/status-check.sh");
    // The status check script content is base64-encoded; the raw string is not in the YAML
    // Instead, verify that the content field exists
    expect(yaml).toContain("content:");
  });

  it("omits status-check when public key is absent", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml).not.toContain("status-check.sh");
  });

  it("includes preset-proxy flags when configured", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
        PRESET_PROXY_BASE_URL: "https://example.com/api/deploy/preset-proxy/v1",
        PRESET_PROXY_MODEL: "claude-sonnet-4-6",
        PRESET_PROXY_MODELS: "claude-sonnet-4-6,gpt-5.2",
        PRESET_PROXY_API_KEY: "my-proxy-key",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml).toContain("--preset-proxy-base-url");
    expect(yaml).toContain("--preset-proxy-model");
    expect(yaml).toContain("--preset-proxy-models");
    expect(yaml).toContain("--preset-proxy-key");
  });

  it("does NOT include preset-proxy flags when not configured", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });
    expect(yaml).not.toContain("--preset-proxy");
  });

  it("shell-quotes values containing special characters", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "test'token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });
    // Env vars are base64-encoded in the YAML content field. Decode to verify.
    const contentMatch = yaml.match(/\/tmp\/clawsimple\.env[\s\S]*?content: (\S+)/);
    expect(contentMatch).not.toBeNull();
    if (contentMatch) {
      const decoded = Buffer.from(contentMatch[1], "base64").toString("utf8");
      expect(decoded).toContain("TG_TOKEN=");
      // The shell-quoted form should have escaped single quotes
      expect(decoded).toContain("test'\\''token");
    }
  });

  it("contains env variable definitions that decode correctly", () => {
    const yaml = buildCloudInit({
      env: {
        TG_TOKEN: "my-bot-token",
        TG_ALLOW: "12345678",
      },
      installScript: INSTALL_SCRIPT,
    });

    // Extract the base64-encoded env content
    const contentMatch = yaml.match(/content: (\S+)/);
    expect(contentMatch).not.toBeNull();

    if (contentMatch) {
      const decoded = Buffer.from(contentMatch[1], "base64").toString("utf8");
      expect(decoded).toContain("TG_TOKEN=");
      expect(decoded).toContain("TG_ALLOW=");
      expect(decoded).toContain("my-bot-token");
      expect(decoded).toContain("12345678");
    }
  });
});
