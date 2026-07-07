import { describe, expect, it } from "vitest";
import { readPublicEnv } from "./env";

describe("readPublicEnv", () => {
  it("trims whitespace around environment values", () => {
    expect(readPublicEnv("  test-value \n")).toBe("test-value");
  });

  it("returns the fallback when the value is blank", () => {
    expect(readPublicEnv(" \n ", "fallback")).toBe("fallback");
  });

  it("returns undefined when both value and fallback are missing", () => {
    expect(readPublicEnv(undefined)).toBeUndefined();
  });
});
