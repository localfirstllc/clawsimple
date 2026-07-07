import { describe, expect, it } from "vitest";
import { getIncludedManagedCreditsCapUsd } from "./managed-credits";
import {
  DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD,
  DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD,
} from "./managed-credit-defaults";

describe("managed-credits", () => {
  it("returns a configured cap for all supported seat plans", () => {
    process.env.COST_CAP_USD = "15";
    process.env.COST_CAP_MAX_USD = "30";

    expect(getIncludedManagedCreditsCapUsd("seat-standard")).toBe(15);
    expect(getIncludedManagedCreditsCapUsd("seat-max")).toBe(30);
    expect(getIncludedManagedCreditsCapUsd("unknown")).toBeNull();
  });

  it("falls back to pricing defaults when env caps are absent", () => {
    delete process.env.COST_CAP_USD;
    delete process.env.COST_CAP_MAX_USD;

    expect(getIncludedManagedCreditsCapUsd("seat-standard")).toBe(
      DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD,
    );
    expect(getIncludedManagedCreditsCapUsd("seat-max")).toBe(
      DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD,
    );
  });
});
