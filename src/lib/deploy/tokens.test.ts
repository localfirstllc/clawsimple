import crypto from "crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  generateCompletionToken,
  verifyCompletionToken,
  generatePresetProxyToken,
  verifyPresetProxyToken,
  generateInstallEventToken,
  verifyInstallEventToken,
} from "./tokens";

const TEST_SECRET = "test-completion-secret-min-32-bytes!";

function hmacSign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

describe("generateCompletionToken", () => {
  beforeEach(() => {
    process.env.COMPLETION_TOKEN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.COMPLETION_TOKEN_SECRET;
  });

  it("generates a token in sid:timestamp:hex format", () => {
    const token = generateCompletionToken("test-sid");
    const parts = token.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("test-sid");
    const ts = Number(parts[1]);
    expect(Number.isFinite(ts)).toBe(true);
    expect(Math.abs(Date.now() - ts)).toBeLessThan(5000);
    expect(/^[a-f0-9]+$/i.test(parts[2])).toBe(true);
  });

  it("throws when COMPLETION_TOKEN_SECRET is not set", () => {
    delete process.env.COMPLETION_TOKEN_SECRET;
    expect(() => generateCompletionToken("test-sid")).toThrow(
      "COMPLETION_TOKEN_SECRET not configured"
    );
  });
});

describe("verifyCompletionToken", () => {
  beforeEach(() => {
    process.env.COMPLETION_TOKEN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.COMPLETION_TOKEN_SECRET;
  });

  it("accepts a valid token", () => {
    const token = generateCompletionToken("test-sid");
    expect(verifyCompletionToken(token, "test-sid", TEST_SECRET)).toBe(true);
  });

  it("rejects when sid does not match", () => {
    const token = generateCompletionToken("test-sid");
    expect(verifyCompletionToken(token, "wrong-sid", TEST_SECRET)).toBe(false);
  });

  it("rejects tokens older than 24 hours", () => {
    const oldTimestamp = (Date.now() - 25 * 60 * 60 * 1000).toString();
    const signature = hmacSign(`test-sid:${oldTimestamp}`, TEST_SECRET);
    const expiredToken = `test-sid:${oldTimestamp}:${signature}`;
    expect(verifyCompletionToken(expiredToken, "test-sid", TEST_SECRET)).toBe(false);
  });

  it("rejects tokens with a future timestamp", () => {
    const futureTimestamp = (Date.now() + 60_000).toString();
    const signature = hmacSign(`test-sid:${futureTimestamp}`, TEST_SECRET);
    const futureToken = `test-sid:${futureTimestamp}:${signature}`;
    expect(verifyCompletionToken(futureToken, "test-sid", TEST_SECRET)).toBe(false);
  });

  it("rejects tampered signatures", () => {
    const token = generateCompletionToken("test-sid");
    const parts = token.split(":");
    const tampered = `${parts[0]}:${parts[1]}:${"0".repeat(64)}`;
    expect(verifyCompletionToken(tampered, "test-sid", TEST_SECRET)).toBe(false);
  });

  it("rejects malformed tokens (wrong segment count)", () => {
    expect(verifyCompletionToken("only-one-segment", "test-sid", TEST_SECRET)).toBe(false);
    expect(verifyCompletionToken("a:b:c:d", "test-sid", TEST_SECRET)).toBe(false);
  });

  it("rejects tokens with non-numeric timestamps", () => {
    const signature = hmacSign("test-sid:not-a-number", TEST_SECRET);
    const badToken = `test-sid:not-a-number:${signature}`;
    expect(verifyCompletionToken(badToken, "test-sid", TEST_SECRET)).toBe(false);
  });
});

describe("generatePresetProxyToken", () => {
  beforeEach(() => {
    process.env.COMPLETION_TOKEN_SECRET = TEST_SECRET;
    delete process.env.DEPLOY_PRESET_PROXY_TOKEN_SECRET;
  });

  afterEach(() => {
    delete process.env.COMPLETION_TOKEN_SECRET;
    delete process.env.DEPLOY_PRESET_PROXY_TOKEN_SECRET;
  });

  it("generates a token in sid:hex format", () => {
    const token = generatePresetProxyToken("test-sid");
    const parts = token.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("test-sid");
    expect(/^[a-f0-9]+$/i.test(parts[1])).toBe(true);
  });

  it("uses DEPLOY_PRESET_PROXY_TOKEN_SECRET over COMPLETION_TOKEN_SECRET when both are set", () => {
    const altSecret = "alt-proxy-secret-at-least-32-bytes!!";
    process.env.DEPLOY_PRESET_PROXY_TOKEN_SECRET = altSecret;
    const token = generatePresetProxyToken("test-sid");
    expect(verifyPresetProxyToken(token, "test-sid", altSecret)).toBe(true);
    expect(verifyPresetProxyToken(token, "test-sid", TEST_SECRET)).toBe(false);
  });

  it("falls back to COMPLETION_TOKEN_SECRET when DEPLOY_PRESET_PROXY_TOKEN_SECRET is absent", () => {
    const token = generatePresetProxyToken("test-sid");
    expect(verifyPresetProxyToken(token, "test-sid", TEST_SECRET)).toBe(true);
  });

  it("throws when neither DEPLOY_PRESET_PROXY_TOKEN_SECRET nor COMPLETION_TOKEN_SECRET is set", () => {
    delete process.env.COMPLETION_TOKEN_SECRET;
    expect(() => generatePresetProxyToken("test-sid")).toThrow(
      "DEPLOY_PRESET_PROXY_TOKEN_SECRET (or COMPLETION_TOKEN_SECRET) not configured"
    );
  });
});

describe("verifyPresetProxyToken", () => {
  beforeEach(() => {
    process.env.COMPLETION_TOKEN_SECRET = TEST_SECRET;
    delete process.env.DEPLOY_PRESET_PROXY_TOKEN_SECRET;
  });

  afterEach(() => {
    delete process.env.COMPLETION_TOKEN_SECRET;
    delete process.env.DEPLOY_PRESET_PROXY_TOKEN_SECRET;
  });

  it("accepts a valid token", () => {
    const token = generatePresetProxyToken("test-sid");
    expect(verifyPresetProxyToken(token, "test-sid", TEST_SECRET)).toBe(true);
  });

  it("rejects when sid does not match", () => {
    const token = generatePresetProxyToken("test-sid");
    expect(verifyPresetProxyToken(token, "wrong-sid", TEST_SECRET)).toBe(false);
  });

  it("rejects tampered signatures", () => {
    const goodSignature = hmacSign("test-sid", TEST_SECRET);
    const badSignature = (goodSignature[0] === "a" ? "b" : "a") + goodSignature.slice(1);
    expect(verifyPresetProxyToken(`test-sid:${badSignature}`, "test-sid", TEST_SECRET)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    expect(verifyPresetProxyToken("no-colon", "test-sid", TEST_SECRET)).toBe(false);
    expect(verifyPresetProxyToken("a:b:c", "test-sid", TEST_SECRET)).toBe(false);
  });
});

describe("generateInstallEventToken", () => {
  beforeEach(() => {
    process.env.COMPLETION_TOKEN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.COMPLETION_TOKEN_SECRET;
  });

  it("generates a token in sid:hex format", () => {
    const token = generateInstallEventToken("test-sid");
    const parts = token.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("test-sid");
    expect(/^[a-f0-9]+$/i.test(parts[1])).toBe(true);
  });

  it("throws when COMPLETION_TOKEN_SECRET is not set", () => {
    delete process.env.COMPLETION_TOKEN_SECRET;
    expect(() => generateInstallEventToken("test-sid")).toThrow(
      "COMPLETION_TOKEN_SECRET not configured"
    );
  });
});

describe("verifyInstallEventToken", () => {
  beforeEach(() => {
    process.env.COMPLETION_TOKEN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.COMPLETION_TOKEN_SECRET;
  });

  it("returns the sid for a valid token", () => {
    const token = generateInstallEventToken("test-sid");
    expect(verifyInstallEventToken(token)).toBe("test-sid");
  });

  it("returns null for a tampered signature", () => {
    const goodSignature = hmacSign("test-sid", TEST_SECRET);
    const badSignature = (goodSignature[0] === "a" ? "b" : "a") + goodSignature.slice(1);
    expect(verifyInstallEventToken(`test-sid:${badSignature}`)).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    expect(verifyInstallEventToken("no-colon")).toBeNull();
    expect(verifyInstallEventToken("a:b:c")).toBeNull();
  });

  it("returns sid via backward-compat path when COMPLETION_TOKEN_SECRET is absent", () => {
    delete process.env.COMPLETION_TOKEN_SECRET;
    expect(verifyInstallEventToken("test-sid:any-signature")).toBe("test-sid");
  });
});
