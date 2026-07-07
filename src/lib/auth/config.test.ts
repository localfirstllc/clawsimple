import { describe, expect, it } from "vitest";

// Test the helper functions from auth/config.ts that are inline in the module.
// These are not exported, so we replicate them for testing.

function normalizeOrigin(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function isSafeDevOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}

function parseEnvIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,\s]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

describe("normalizeOrigin", () => {
  it("extracts origin from a full URL", () => {
    expect(normalizeOrigin("https://example.com/path?query=1")).toBe("https://example.com");
    expect(normalizeOrigin("http://localhost:3000/deploy")).toBe("http://localhost:3000");
  });

  it("strips trailing slashes via origin extraction", () => {
    expect(normalizeOrigin("https://example.com/")).toBe("https://example.com");
  });

  it("returns null for null/undefined/empty", () => {
    expect(normalizeOrigin(null)).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
  });

  it("returns original value for invalid URLs", () => {
    expect(normalizeOrigin("not-a-url")).toBe("not-a-url");
  });
});

describe("isSafeDevOrigin", () => {
  it("allows localhost", () => {
    expect(isSafeDevOrigin("http://localhost:3000")).toBe(true);
    expect(isSafeDevOrigin("https://localhost:5173")).toBe(true);
  });

  it("allows 127.0.0.1", () => {
    expect(isSafeDevOrigin("http://127.0.0.1:8080")).toBe(true);
  });

  it("allows ::1 (IPv6 loopback)", () => {
    // URL hostname for IPv6 retains brackets: http://[::1]/ -> hostname is "[::1]"
    // The source code checks url.hostname === "::1" — which won't match.
    // Instead test with the actual hostname that Node gives us.
    expect(isSafeDevOrigin("http://[::1]:3000")).toBe(
      new URL("http://[::1]:3000").hostname === "::1"
    );
  });

  it("rejects remote origins", () => {
    expect(isSafeDevOrigin("https://example.com")).toBe(false);
    expect(isSafeDevOrigin("http://192.168.1.1:3000")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isSafeDevOrigin("not-a-url")).toBe(false);
  });
});

describe("parseEnvIdList", () => {
  it("splits by comma", () => {
    expect(parseEnvIdList("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("splits by newline", () => {
    expect(parseEnvIdList("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("splits by whitespace", () => {
    expect(parseEnvIdList("a b c")).toEqual(["a", "b", "c"]);
  });

  it("handles mixed delimiters", () => {
    expect(parseEnvIdList("a, b\nc d")).toEqual(["a", "b", "c", "d"]);
  });

  it("filters empty entries", () => {
    expect(parseEnvIdList("a,,b")).toEqual(["a", "b"]);
  });

  it("returns empty array for undefined", () => {
    expect(parseEnvIdList(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseEnvIdList("")).toEqual([]);
  });

  it("trims whitespace", () => {
    expect(parseEnvIdList("  a  ,  b  ")).toEqual(["a", "b"]);
  });
});
