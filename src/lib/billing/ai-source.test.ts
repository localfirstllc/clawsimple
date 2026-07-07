import { describe, expect, it } from "vitest";
import { resolveAiSource, AI_SOURCE_MANAGED } from "@/lib/billing/ai-source";

describe("resolveAiSource", () => {
  it('returns "managed" for the managed constant', () => {
    expect(resolveAiSource(AI_SOURCE_MANAGED)).toBe("managed");
  });

  it('returns "managed" for the string "managed"', () => {
    expect(resolveAiSource("managed")).toBe("managed");
  });

  it("returns null for undefined", () => {
    expect(resolveAiSource(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveAiSource("")).toBeNull();
  });

  it("returns null for unknown string", () => {
    expect(resolveAiSource("something-else")).toBeNull();
    expect(resolveAiSource("openai")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(resolveAiSource(null)).toBeNull();
  });
});

describe("AI_SOURCE_MANAGED", () => {
  it("equals the string 'managed'", () => {
    expect(AI_SOURCE_MANAGED).toBe("managed");
  });
});
