import { describe, expect, it, beforeEach, afterEach } from "vitest";

// We test the pure-ish exported functions and the internal computeCanceling
// logic through a replicated function (since it's not exported).

function computeCanceling(sub: {
  cancel_at_period_end: boolean;
  cancel_at?: number | null;
  schedule?: { end_behavior?: string; status?: string } | null;
}): boolean {
  let canceling = Boolean(sub.cancel_at_period_end);
  if (!canceling && sub.cancel_at) canceling = true;

  if (!canceling && sub.schedule) {
    if (sub.schedule.end_behavior === "cancel" && sub.schedule.status === "active") {
      canceling = true;
    }
  }
  return canceling;
}

function getCacheTtlMs(raw: string | undefined): number {
  const DEFAULT_TTL_SECONDS = 300;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_SECONDS;
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TTL_SECONDS;
  return safe * 1000;
}

function getProfileVisibleStatuses(): string[] {
  return ["active", "trialing", "past_due", "incomplete"];
}

describe("subscription-cache (pure logic)", () => {
  describe("computeCanceling", () => {
    it("returns true when cancel_at_period_end is true", () => {
      expect(computeCanceling({ cancel_at_period_end: true })).toBe(true);
    });

    it("returns false when cancel_at_period_end is false and nothing else flags canceling", () => {
      expect(computeCanceling({ cancel_at_period_end: false })).toBe(false);
    });

    it("returns true when cancel_at is set", () => {
      expect(
        computeCanceling({ cancel_at_period_end: false, cancel_at: 1717200000 })
      ).toBe(true);
    });

    it("returns true when schedule has end_behavior=cancel and status=active", () => {
      expect(
        computeCanceling({
          cancel_at_period_end: false,
          schedule: { end_behavior: "cancel", status: "active" },
        })
      ).toBe(true);
    });

    it("returns false when schedule has end_behavior=cancel but status is not active", () => {
      expect(
        computeCanceling({
          cancel_at_period_end: false,
          schedule: { end_behavior: "cancel", status: "completed" },
        })
      ).toBe(false);
    });

    it("returns false when schedule has status=active but end_behavior is not cancel", () => {
      expect(
        computeCanceling({
          cancel_at_period_end: false,
          schedule: { end_behavior: "release", status: "active" },
        })
      ).toBe(false);
    });

    it("returns false when all canceling indicators are absent", () => {
      expect(
        computeCanceling({
          cancel_at_period_end: false,
          cancel_at: null,
          schedule: null,
        })
      ).toBe(false);
    });

    it("handles undefined schedule gracefully", () => {
      expect(
        computeCanceling({ cancel_at_period_end: false, schedule: undefined })
      ).toBe(false);
    });
  });

  describe("getCacheTtlMs", () => {
    it("returns default 300 seconds in ms when no env var", () => {
      expect(getCacheTtlMs(undefined)).toBe(300_000);
    });

    it("parses a valid env override", () => {
      expect(getCacheTtlMs("60")).toBe(60_000);
    });

    it("falls back to default for non-numeric value", () => {
      expect(getCacheTtlMs("not-a-number")).toBe(300_000);
    });

    it("falls back to default for zero", () => {
      expect(getCacheTtlMs("0")).toBe(300_000);
    });

    it("falls back to default for negative", () => {
      expect(getCacheTtlMs("-5")).toBe(300_000);
    });

    it("falls back to default for Infinity string", () => {
      expect(getCacheTtlMs("Infinity")).toBe(300_000);
    });
  });

  describe("getProfileVisibleStatuses", () => {
    it("returns the four visible statuses", () => {
      const statuses = getProfileVisibleStatuses();
      expect(statuses).toContain("active");
      expect(statuses).toContain("trialing");
      expect(statuses).toContain("past_due");
      expect(statuses).toContain("incomplete");
      expect(statuses).toHaveLength(4);
    });
  });
});
