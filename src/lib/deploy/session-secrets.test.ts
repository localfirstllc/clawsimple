import { describe, expect, it, afterEach } from "vitest";
import { sealSessionSecret, openSessionSecret } from "./session-secrets";

// Generate a valid 32-byte key and base64-encode it.
// 32 random bytes as base64
const KEY_32 = Buffer.from("0123456789abcdef0123456789abcdef"); // 32 bytes
const VALID_KEY_B64 = KEY_32.toString("base64");

describe("sealSessionSecret", () => {
  afterEach(() => {
    delete process.env.DEPLOY_SESSION_SECRET_KEY;
    delete process.env.DEPLOY_JOB_SECRET_KEY;
  });

  it("returns v1:iv:tag:ct format", () => {
    process.env.DEPLOY_SESSION_SECRET_KEY = VALID_KEY_B64;
    const sealed = sealSessionSecret("hello");
    const parts = sealed.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    // iv is 12 bytes -> 16 base64 chars
    expect(Buffer.from(parts[1], "base64").length).toBe(12);
    // tag is 16 bytes -> 24 base64 chars
    expect(Buffer.from(parts[2], "base64").length).toBe(16);
    // ct should be decodable base64
    expect(() => Buffer.from(parts[3], "base64")).not.toThrow();
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    process.env.DEPLOY_SESSION_SECRET_KEY = VALID_KEY_B64;
    const sealed1 = sealSessionSecret("hello");
    const sealed2 = sealSessionSecret("hello");
    expect(sealed1).not.toBe(sealed2);
  });

  it("throws when no key is configured", () => {
    expect(() => sealSessionSecret("hello")).toThrow("Missing env: DEPLOY_SESSION_SECRET_KEY");
  });

  it("throws when key is not 32 bytes", () => {
    process.env.DEPLOY_SESSION_SECRET_KEY = Buffer.from("short").toString("base64");
    expect(() => sealSessionSecret("hello")).toThrow(
      "DEPLOY_SESSION_SECRET_KEY must be base64-encoded 32 bytes"
    );
  });

  it("falls back to DEPLOY_JOB_SECRET_KEY when DEPLOY_SESSION_SECRET_KEY is absent", () => {
    process.env.DEPLOY_JOB_SECRET_KEY = VALID_KEY_B64;
    const sealed = sealSessionSecret("hello");
    expect(sealed.startsWith("v1:")).toBe(true);
  });
});

describe("openSessionSecret", () => {
  afterEach(() => {
    delete process.env.DEPLOY_SESSION_SECRET_KEY;
    delete process.env.DEPLOY_JOB_SECRET_KEY;
  });

  it("round-trips plaintext of various lengths and characters", () => {
    process.env.DEPLOY_SESSION_SECRET_KEY = VALID_KEY_B64;
    const plaintexts = [
      "hello",
      "",
      "a".repeat(100),
      "🔐 token with emoji and unicode ñéü",
      "1234567890:AAH-tgk_test_bot_token_here",
      "v1:some:sealed:looking:string",
    ];
    for (const pt of plaintexts) {
      const sealed = sealSessionSecret(pt);
      const opened = openSessionSecret(sealed);
      expect(opened).toBe(pt);
    }
  });

  it("throws on tampered ciphertext", () => {
    process.env.DEPLOY_SESSION_SECRET_KEY = VALID_KEY_B64;
    const sealed = sealSessionSecret("hello");
    const parts = sealed.split(":");
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${Buffer.from("tampered-data").toString("base64")}`;
    expect(() => openSessionSecret(tampered)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    process.env.DEPLOY_SESSION_SECRET_KEY = VALID_KEY_B64;
    const sealed = sealSessionSecret("hello");
    const parts = sealed.split(":");
    const badTag = Buffer.from("a".repeat(16)).toString("base64");
    const tampered = `${parts[0]}:${parts[1]}:${badTag}:${parts[3]}`;
    expect(() => openSessionSecret(tampered)).toThrow();
  });

  it("throws on invalid format", () => {
    process.env.DEPLOY_SESSION_SECRET_KEY = VALID_KEY_B64;
    expect(() => openSessionSecret("not-valid")).toThrow("Invalid sealed secret");
    expect(() => openSessionSecret("v2:iv:tag:ct")).toThrow("Invalid sealed secret");
    expect(() => openSessionSecret("v1:iv:tag")).toThrow("Invalid sealed secret");
  });
});
