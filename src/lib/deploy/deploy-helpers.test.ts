import { describe, expect, it } from "vitest";
import {
  isMissingTelegramTableError,
  isTelegramLinkUniqueViolation,
  normalizeTargetRuntime,
  parseListEnv,
  readTargetRuntimeFromFingerprint,
  sanitizeServerName,
  TELEGRAM_USER_ID_RE,
} from "@/lib/deploy/deploy-helpers";

describe("TELEGRAM_USER_ID_RE", () => {
  it("accepts 4-20 digit strings", () => {
    expect(TELEGRAM_USER_ID_RE.test("1234")).toBe(true);
    expect(TELEGRAM_USER_ID_RE.test("1234567890")).toBe(true);
    expect(TELEGRAM_USER_ID_RE.test("12345678901234567890")).toBe(true);
  });

  it("rejects non-digit characters", () => {
    expect(TELEGRAM_USER_ID_RE.test("1234a")).toBe(false);
    expect(TELEGRAM_USER_ID_RE.test("abcde")).toBe(false);
    expect(TELEGRAM_USER_ID_RE.test("12-34")).toBe(false);
    expect(TELEGRAM_USER_ID_RE.test("12 34")).toBe(false);
  });

  it("rejects too short or too long strings", () => {
    expect(TELEGRAM_USER_ID_RE.test("123")).toBe(false);
    expect(TELEGRAM_USER_ID_RE.test("123456789012345678901")).toBe(false); // 21 digits
  });

  it("rejects empty string", () => {
    expect(TELEGRAM_USER_ID_RE.test("")).toBe(false);
  });
});

describe("sanitizeServerName", () => {
  it("lowercases input", () => {
    expect(sanitizeServerName("MyServer")).toBe("myserver");
  });

  it("replaces illegal characters with dashes", () => {
    expect(sanitizeServerName("my server_name")).toBe("my-server-name");
  });

  it("collapses multiple dashes", () => {
    expect(sanitizeServerName("my---server")).toBe("my-server");
  });

  it("strips leading and trailing dashes", () => {
    expect(sanitizeServerName("-server-")).toBe("server");
    expect(sanitizeServerName("!!!hello!!!")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(sanitizeServerName("")).toBe("");
  });

  it("handles special characters", () => {
    expect(sanitizeServerName("test@#$%^&*()server")).toBe("test-server");
  });
});

describe("normalizeTargetRuntime", () => {
  it("returns hermes as default", () => {
    expect(normalizeTargetRuntime(undefined)).toBe("hermes");
    expect(normalizeTargetRuntime("")).toBe("hermes");
    expect(normalizeTargetRuntime(null)).toBe("hermes");
  });

  it("returns valid runtime values as-is", () => {
    expect(normalizeTargetRuntime("hermes")).toBe("hermes");
    expect(normalizeTargetRuntime("openclaw")).toBe("openclaw");
  });

  it("is case-insensitive", () => {
    expect(normalizeTargetRuntime("Hermes")).toBe("hermes");
    expect(normalizeTargetRuntime("OPENCLAW")).toBe("openclaw");
  });

  it("trims whitespace", () => {
    expect(normalizeTargetRuntime("  hermes  ")).toBe("hermes");
  });

  it("throws on unknown values", () => {
    expect(() => normalizeTargetRuntime("unknown")).toThrow(
      "target_runtime must be hermes or openclaw",
    );
  });
});

describe("readTargetRuntimeFromFingerprint", () => {
  it("reads active runtime first", () => {
    expect(
      readTargetRuntimeFromFingerprint({ active_runtime: "openclaw" }),
    ).toBe("openclaw");
  });

  it("falls back to target runtime", () => {
    expect(readTargetRuntimeFromFingerprint({ target_runtime: "hermes" })).toBe(
      "hermes",
    );
  });

  it("reads nested main runtime", () => {
    expect(
      readTargetRuntimeFromFingerprint({
        agent_runtimes: { main: { target_runtime: "openclaw" } },
      }),
    ).toBe("openclaw");
  });

  it("ignores invalid values", () => {
    expect(
      readTargetRuntimeFromFingerprint({ active_runtime: "bad" }),
    ).toBeNull();
    expect(readTargetRuntimeFromFingerprint(null)).toBeNull();
  });
});

describe("parseListEnv", () => {
  const fallback = ["nbg1", "hel1"];

  it("returns fallback for undefined", () => {
    expect(parseListEnv(undefined, fallback)).toEqual(fallback);
  });

  it("returns fallback for empty string", () => {
    expect(parseListEnv("", fallback)).toEqual(fallback);
  });

  it("splits by comma", () => {
    expect(parseListEnv("nbg1,hel1,fsn1", fallback)).toEqual([
      "nbg1",
      "hel1",
      "fsn1",
    ]);
  });

  it("splits by whitespace", () => {
    expect(parseListEnv("nbg1 hel1 fsn1", fallback)).toEqual([
      "nbg1",
      "hel1",
      "fsn1",
    ]);
  });

  it("deduplicates", () => {
    expect(parseListEnv("nbg1,nbg1,hel1", fallback)).toEqual(["nbg1", "hel1"]);
  });

  it("lowercases", () => {
    expect(parseListEnv("NBG1,HEL1", fallback)).toEqual(["nbg1", "hel1"]);
  });

  it("filters blank entries", () => {
    expect(parseListEnv("nbg1,,hel1", fallback)).toEqual(["nbg1", "hel1"]);
  });
});

describe("isMissingTelegramTableError", () => {
  it("detects 42P01 on the error itself", () => {
    expect(isMissingTelegramTableError({ code: "42P01" })).toBe(true);
  });

  it("detects 42P01 on the cause", () => {
    expect(isMissingTelegramTableError({ cause: { code: "42P01" } })).toBe(
      true,
    );
  });

  it("detects the table-not-found message on the error", () => {
    expect(
      isMissingTelegramTableError({
        message: 'relation "telegram_account_link" does not exist',
      }),
    ).toBe(true);
  });

  it("detects the table-not-found message on the cause", () => {
    expect(
      isMissingTelegramTableError({
        cause: { message: 'relation "telegram_account_link" does not exist' },
      }),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isMissingTelegramTableError(new Error("something else"))).toBe(
      false,
    );
    expect(isMissingTelegramTableError({})).toBe(false);
    expect(isMissingTelegramTableError(null)).toBe(false);
    expect(isMissingTelegramTableError(undefined)).toBe(false);
  });
});

describe("isTelegramLinkUniqueViolation", () => {
  it("detects 23505 on the error itself", () => {
    expect(isTelegramLinkUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("detects 23505 on the cause", () => {
    expect(isTelegramLinkUniqueViolation({ cause: { code: "23505" } })).toBe(
      true,
    );
  });

  it("detects unique constraint violation by name in message", () => {
    expect(
      isTelegramLinkUniqueViolation({
        message:
          "duplicate key value violates unique constraint telegram_account_link_telegram_user_id_unique",
      }),
    ).toBe(true);
  });

  it("detects unique constraint violation by name in cause message", () => {
    expect(
      isTelegramLinkUniqueViolation({
        cause: { message: "telegram_account_link_telegram_user_id_unique" },
      }),
    ).toBe(true);
  });

  it("detects Key (telegram_user_id)= pattern in message", () => {
    expect(
      isTelegramLinkUniqueViolation({
        message: "Key (telegram_user_id)=(12345) already exists",
      }),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isTelegramLinkUniqueViolation(new Error("something else"))).toBe(
      false,
    );
    expect(isTelegramLinkUniqueViolation({ code: "42P01" })).toBe(false);
  });
});
