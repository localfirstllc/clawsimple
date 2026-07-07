import { describe, expect, it, afterEach } from "vitest";
import { getGraceMinutes } from "./stripe";

describe("getGraceMinutes", () => {
  afterEach(() => {
    delete process.env.GRACE_MINUTES_DEFAULT;
  });

  it("returns 60 by default when env is not set", () => {
    expect(getGraceMinutes()).toBe(60);
  });

  it("returns env override", () => {
    process.env.GRACE_MINUTES_DEFAULT = "30";
    expect(getGraceMinutes()).toBe(30);
  });

  it("falls back to 60 for invalid values", () => {
    process.env.GRACE_MINUTES_DEFAULT = "not-a-number";
    expect(getGraceMinutes()).toBe(60);
  });

  it("falls back to 60 for zero", () => {
    process.env.GRACE_MINUTES_DEFAULT = "0";
    expect(getGraceMinutes()).toBe(60);
  });

  it("falls back to 60 for negative", () => {
    process.env.GRACE_MINUTES_DEFAULT = "-5";
    expect(getGraceMinutes()).toBe(60);
  });

  it("falls back to 60 for empty string", () => {
    process.env.GRACE_MINUTES_DEFAULT = "";
    expect(getGraceMinutes()).toBe(60);
  });
});
