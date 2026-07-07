import { describe, expect, it } from "vitest";

import { isMaintenanceModeEnabled } from "./maintenance-mode";

describe("isMaintenanceModeEnabled", () => {
  it("enables maintenance mode for explicit truthy values", () => {
    expect(isMaintenanceModeEnabled("1")).toBe(true);
    expect(isMaintenanceModeEnabled("true")).toBe(true);
    expect(isMaintenanceModeEnabled(" TRUE ")).toBe(true);
  });

  it("handles quoted values copied into Vercel env vars", () => {
    expect(isMaintenanceModeEnabled('"1\\n"')).toBe(true);
    expect(isMaintenanceModeEnabled("'1'")).toBe(true);
  });

  it("keeps maintenance mode off for empty and falsey values", () => {
    expect(isMaintenanceModeEnabled(undefined)).toBe(false);
    expect(isMaintenanceModeEnabled("")).toBe(false);
    expect(isMaintenanceModeEnabled("0")).toBe(false);
    expect(isMaintenanceModeEnabled("false")).toBe(false);
  });
});
