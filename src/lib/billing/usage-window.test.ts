import { describe, expect, it } from "vitest";
import { getMonthlyUsageWindow, toDayStringUTC } from "@/lib/billing/usage-window";

describe("getMonthlyUsageWindow", () => {
  const anchor = new Date("2026-01-15T00:00:00Z");

  it("returns window starting at anchor when now is within first month", () => {
    const now = new Date("2026-01-20T00:00:00Z");
    const { start, end } = getMonthlyUsageWindow(anchor, now);
    expect(start.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("advances window when now is beyond the first month", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const { start, end } = getMonthlyUsageWindow(anchor, now);
    // After Jan 15: Feb 15, then Mar 15. March 1 is between Feb 15 and Mar 15.
    expect(start.toISOString()).toBe("2026-02-15T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("advances window across year boundary", () => {
    const anchor2 = new Date("2026-11-01T00:00:00Z");
    const now = new Date("2027-01-15T00:00:00Z");
    const { start, end } = getMonthlyUsageWindow(anchor2, now);
    expect(start.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-02-01T00:00:00.000Z");
  });

  it("clamps day but does not advance if now is still within the window", () => {
    const jan31 = new Date("2026-01-31T00:00:00Z");
    const now = new Date("2026-02-15T00:00:00Z");
    const { start, end } = getMonthlyUsageWindow(jan31, now);
    // start stays at Jan 31 because Feb 15 < Feb 28 (clamped next window start)
    expect(start.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("clamps end-of-month anchor forward once now exceeds the clamped boundary", () => {
    const jan31 = new Date("2026-01-31T00:00:00Z");
    const now = new Date("2026-03-01T00:00:00Z");
    const { start, end } = getMonthlyUsageWindow(jan31, now);
    // Now past Feb 28, so window advanced to Feb 28
    expect(start.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-28T00:00:00.000Z");
  });

  it("walks backward when now is before anchor", () => {
    const now = new Date("2025-12-20T00:00:00Z");
    const { start, end } = getMonthlyUsageWindow(anchor, now);
    expect(start.toISOString()).toBe("2025-12-15T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("throws on invalid anchorStart", () => {
    expect(() =>
      getMonthlyUsageWindow(new Date("invalid"))
    ).toThrow("invalid anchorStart");
  });

  it("preserves time components in window boundaries", () => {
    const anchorWithTime = new Date("2026-06-01T08:30:45.123Z");
    const now = new Date("2026-06-15T12:00:00Z");
    const { start, end } = getMonthlyUsageWindow(anchorWithTime, now);
    expect(start.toISOString()).toBe("2026-06-01T08:30:45.123Z");
    expect(end.toISOString()).toBe("2026-07-01T08:30:45.123Z");
  });

  it("handles leap year end-of-month clamping", () => {
    // 2028 is a leap year
    const jan31 = new Date("2028-01-31T00:00:00Z");
    const now = new Date("2028-03-01T00:00:00Z");
    const { start, end } = getMonthlyUsageWindow(jan31, now);
    // Mar 1 >= Feb 29, so window advanced to Feb 29
    expect(start.toISOString()).toBe("2028-02-29T00:00:00.000Z"); // leap
    expect(end.toISOString()).toBe("2028-03-29T00:00:00.000Z");
  });
});

describe("toDayStringUTC", () => {
  it("returns YYYY-MM-DD string", () => {
    const date = new Date("2026-06-15T12:34:56.789Z");
    expect(toDayStringUTC(date)).toBe("2026-06-15");
  });

  it("pads single-digit month and day", () => {
    const date = new Date("2026-01-05T00:00:00Z");
    expect(toDayStringUTC(date)).toBe("2026-01-05");
  });
});
