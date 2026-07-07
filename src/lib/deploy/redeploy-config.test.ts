import { afterEach, describe, expect, it } from "vitest";
import { getRedeployLimit, getRedeployWindowDays } from "./redeploy-config";

describe("redeploy config helpers", () => {
  afterEach(() => {
    delete process.env.REDEPLOY_LIMIT;
    delete process.env.REDEPLOY_WINDOW_DAYS;
  });

  it("uses defaults when env values are missing", () => {
    expect(getRedeployLimit()).toBe(10);
    expect(getRedeployWindowDays()).toBe(30);
  });

  it("uses defaults when env values are invalid", () => {
    process.env.REDEPLOY_LIMIT = "oops";
    process.env.REDEPLOY_WINDOW_DAYS = "NaN";

    expect(getRedeployLimit()).toBe(10);
    expect(getRedeployWindowDays()).toBe(30);
  });

  it("accepts valid numeric overrides", () => {
    process.env.REDEPLOY_LIMIT = "5";
    process.env.REDEPLOY_WINDOW_DAYS = "14";

    expect(getRedeployLimit()).toBe(5);
    expect(getRedeployWindowDays()).toBe(14);
  });
});
