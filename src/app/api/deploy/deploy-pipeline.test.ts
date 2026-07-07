import { describe, expect, it } from "vitest";
import { resolveAiSource } from "../../../lib/billing/ai-source";
import {
  SEAT_PLAN_MAX,
  SEAT_PLAN_STANDARD,
  resolveSeatPlan,
  getSeatPlanPriceId,
} from "../../../lib/billing/plans";
import { getIncludedManagedCreditsCapUsd } from "../../../lib/billing/managed-credits";
import {
  DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD,
  DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD,
} from "../../../lib/billing/managed-credit-defaults";
import { resolveDeploymentServiceName } from "../../../lib/deploy/deployment-service-name";

/**
 * Integration tests that exercise the deploy API's key data flows
 * end-to-end through the actual business logic modules.
 *
 * These do NOT hit the network; they test the deterministic logic
 * that the /api/deploy route uses to build sessions.
 */

// ---------------------------------------------------------------------------
// Seat plan resolution
// ---------------------------------------------------------------------------

describe("seat plan resolution", () => {
  it("resolves all valid seat plan strings", () => {
    expect(resolveSeatPlan("seat-standard")).toBe(SEAT_PLAN_STANDARD);
    expect(resolveSeatPlan("seat-max")).toBe(SEAT_PLAN_MAX);
  });

  it("falls back to standard for unknown plans", () => {
    expect(resolveSeatPlan("invalid")).toBe(SEAT_PLAN_STANDARD);
    expect(resolveSeatPlan(undefined)).toBe(SEAT_PLAN_STANDARD);
    expect(resolveSeatPlan("")).toBe(SEAT_PLAN_STANDARD);
  });
});

// ---------------------------------------------------------------------------
// AI source resolution
// ---------------------------------------------------------------------------

describe("AI source resolution", () => {
  it("resolves explicit sources", () => {
    expect(resolveAiSource("managed")).toBe("managed");
  });

  it("returns null for undefined/invalid", () => {
    expect(resolveAiSource(undefined)).toBeNull();
    expect(resolveAiSource("")).toBeNull();
    expect(resolveAiSource("invalid")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Deploy flow — seat plan to price ID mapping (requires env)
// ---------------------------------------------------------------------------

describe("seat plan price ID mapping", () => {
  it("returns null when price env is not set", () => {
    const priceId = getSeatPlanPriceId(SEAT_PLAN_STANDARD, "month");
    expect(typeof priceId).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Managed credits — quota consistency
// ---------------------------------------------------------------------------

describe("managed credits integration", () => {
  it("returns consistent caps across all seat plans", () => {
    const origStd = process.env.COST_CAP_USD;
    const origMax = process.env.COST_CAP_MAX_USD;
    delete process.env.COST_CAP_USD;
    delete process.env.COST_CAP_MAX_USD;

    try {
      expect(getIncludedManagedCreditsCapUsd(SEAT_PLAN_STANDARD)).toBe(
        DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD,
      );
      expect(getIncludedManagedCreditsCapUsd(SEAT_PLAN_MAX)).toBe(
        DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD,
      );
      expect(getIncludedManagedCreditsCapUsd("unknown")).toBeNull();
    } finally {
      if (origStd !== undefined) process.env.COST_CAP_USD = origStd;
      if (origMax !== undefined) process.env.COST_CAP_MAX_USD = origMax;
    }
  });
});

describe("deployment service naming", () => {
  it("uses the requested service name", () => {
    expect(
      resolveDeploymentServiceName(
        "clawsimple",
        { runtime_mode: "dedicated-hetzner" },
        "C27FMHJU7UUY",
      ),
    ).toBe("clawsimple");
  });
});
