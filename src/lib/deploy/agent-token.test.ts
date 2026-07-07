import { describe, expect, it } from "vitest";
import { generateDeployAgentToken, hashDeployAgentToken, timingSafeTokenHashEqual, getBearerToken } from "./agent-token";

describe("generateDeployAgentToken", () => {
  it("generates a base64url string of correct length (24 random bytes)", () => {
    const token = generateDeployAgentToken();
    // 24 bytes in base64url is 32 characters (no padding)
    expect(token.length).toBe(32);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
  });

  it("generates unique tokens each call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateDeployAgentToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("hashDeployAgentToken", () => {
  it("returns a 64-char hex string", () => {
    const hash = hashDeployAgentToken("test-token");
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it("produces the same hash for the same input", () => {
    const h1 = hashDeployAgentToken("test-token");
    const h2 = hashDeployAgentToken("test-token");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different inputs", () => {
    const h1 = hashDeployAgentToken("test-token-1");
    const h2 = hashDeployAgentToken("test-token-2");
    expect(h1).not.toBe(h2);
  });
});

describe("timingSafeTokenHashEqual", () => {
  it("returns true when expected hash matches the token's hash", () => {
    const token = "my-secret-agent-token";
    const hash = hashDeployAgentToken(token);
    expect(timingSafeTokenHashEqual(hash, token)).toBe(true);
  });

  it("returns false when token does not match the expected hash", () => {
    const hash = hashDeployAgentToken("real-token");
    expect(timingSafeTokenHashEqual(hash, "wrong-token")).toBe(false);
  });

  it("returns false for invalid hex hash", () => {
    expect(timingSafeTokenHashEqual("not-hex", "any-token")).toBe(false);
  });

  it("returns false for mismatched hex lengths", () => {
    expect(timingSafeTokenHashEqual("a".repeat(10), "any-token")).toBe(false);
  });
});

describe("getBearerToken", () => {
  it("extracts token after 'Bearer '", () => {
    expect(getBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("is case-insensitive", () => {
    expect(getBearerToken("bearer abc123")).toBe("abc123");
    expect(getBearerToken("BEARER abc123")).toBe("abc123");
  });

  it("trims whitespace", () => {
    expect(getBearerToken("  Bearer abc123  ")).toBe("abc123");
  });

  it("returns empty string for null", () => {
    expect(getBearerToken(null)).toBe("");
  });

  it("returns empty string when no Bearer prefix", () => {
    expect(getBearerToken("abc123")).toBe("");
    expect(getBearerToken("")).toBe("");
  });
});
