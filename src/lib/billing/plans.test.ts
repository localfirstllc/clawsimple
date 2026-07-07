import { describe, expect, it, afterEach } from "vitest";
import {
  SEAT_PLAN_MAX,
  SEAT_PLAN_STANDARD,
  resolveSeatPlan,
  resolveSeatMetaFromPriceId,
} from "./plans";

describe("resolveSeatPlan", () => {
  it("returns seat-standard for standard", () => {
    expect(resolveSeatPlan("seat-standard")).toBe(SEAT_PLAN_STANDARD);
  });

  it("returns seat-max for max", () => {
    expect(resolveSeatPlan("seat-max")).toBe(SEAT_PLAN_MAX);
  });

  it("falls back to standard for unknown values", () => {
    expect(resolveSeatPlan("invalid")).toBe(SEAT_PLAN_STANDARD);
    expect(resolveSeatPlan(undefined)).toBe(SEAT_PLAN_STANDARD);
    expect(resolveSeatPlan("")).toBe(SEAT_PLAN_STANDARD);
    expect(resolveSeatPlan(null)).toBe(SEAT_PLAN_STANDARD);
  });
});

describe("resolveSeatMetaFromPriceId", () => {
  afterEach(() => {
    delete process.env.STRIPE_SEAT_PRICE_ID;
    delete process.env.STRIPE_SEAT_PRICE_ID_YEARLY;
    delete process.env.STRIPE_SEAT_PRICE_ID_MAX;
    delete process.env.STRIPE_SEAT_PRICE_ID_MAX_YEARLY;
  });

  it("returns null for empty priceId", () => {
    expect(resolveSeatMetaFromPriceId("")).toBeNull();
  });

  it("resolves standard monthly", () => {
    process.env.STRIPE_SEAT_PRICE_ID = "price_std_month";
    expect(resolveSeatMetaFromPriceId("price_std_month")).toEqual({
      seatPlan: SEAT_PLAN_STANDARD,
      billingInterval: "month",
    });
  });

  it("resolves standard yearly", () => {
    process.env.STRIPE_SEAT_PRICE_ID_YEARLY = "price_std_year";
    expect(resolveSeatMetaFromPriceId("price_std_year")).toEqual({
      seatPlan: SEAT_PLAN_STANDARD,
      billingInterval: "year",
    });
  });

  it("resolves max monthly", () => {
    process.env.STRIPE_SEAT_PRICE_ID_MAX = "price_max_month";
    expect(resolveSeatMetaFromPriceId("price_max_month")).toEqual({
      seatPlan: SEAT_PLAN_MAX,
      billingInterval: "month",
    });
  });

  it("resolves max yearly", () => {
    process.env.STRIPE_SEAT_PRICE_ID_MAX_YEARLY = "price_max_year";
    expect(resolveSeatMetaFromPriceId("price_max_year")).toEqual({
      seatPlan: SEAT_PLAN_MAX,
      billingInterval: "year",
    });
  });

  it("returns null for unknown priceId", () => {
    process.env.STRIPE_SEAT_PRICE_ID = "price_std_month";
    expect(resolveSeatMetaFromPriceId("price_unknown")).toBeNull();
  });

  it("handles comma/whitespace-separated multi-value env vars", () => {
    process.env.STRIPE_SEAT_PRICE_ID = "price_1, price_2, price_3";
    expect(resolveSeatMetaFromPriceId("price_2")).toEqual({
      seatPlan: SEAT_PLAN_STANDARD,
      billingInterval: "month",
    });
    expect(resolveSeatMetaFromPriceId("price_99")).toBeNull();
  });
});

// parseEnvIdList is not exported, but test it through resolveSeatMetaFromPriceId
// which uses it internally. Also verify it via includesEnvId behavior.
// Actually, let's test through getSeatPlanPriceIds which directly calls parseEnvIdList.
import { getSeatPlanPriceIds, getSeatPlanPriceId } from "./plans";

describe("getSeatPlanPriceIds", () => {
  afterEach(() => {
    delete process.env.STRIPE_SEAT_PRICE_ID;
    delete process.env.STRIPE_SEAT_PRICE_ID_YEARLY;
    delete process.env.STRIPE_SEAT_PRICE_ID_MAX;
    delete process.env.STRIPE_SEAT_PRICE_ID_MAX_YEARLY;
  });

  it("returns empty array when env is not set", () => {
    expect(getSeatPlanPriceIds(SEAT_PLAN_STANDARD, "month")).toEqual([]);
  });

  it("returns parsed price ids from single env var", () => {
    process.env.STRIPE_SEAT_PRICE_ID = "price_abc";
    expect(getSeatPlanPriceIds(SEAT_PLAN_STANDARD, "month")).toEqual(["price_abc"]);
  });

  it("returns parsed price ids from comma-separated env var", () => {
    process.env.STRIPE_SEAT_PRICE_ID = "price_a, price_b";
    expect(getSeatPlanPriceIds(SEAT_PLAN_STANDARD, "month")).toEqual(["price_a", "price_b"]);
  });

  it("returns correct price ids for max plan", () => {
    process.env.STRIPE_SEAT_PRICE_ID_MAX = "price_max_a, price_max_b";
    expect(getSeatPlanPriceIds(SEAT_PLAN_MAX, "month")).toEqual(["price_max_a", "price_max_b"]);
  });

  it("returns correct price ids for yearly standard", () => {
    process.env.STRIPE_SEAT_PRICE_ID_YEARLY = "price_std_yr";
    expect(getSeatPlanPriceIds(SEAT_PLAN_STANDARD, "year")).toEqual(["price_std_yr"]);
  });

  it("returns correct price ids for yearly max", () => {
    process.env.STRIPE_SEAT_PRICE_ID_MAX_YEARLY = "price_max_yr";
    expect(getSeatPlanPriceIds(SEAT_PLAN_MAX, "year")).toEqual(["price_max_yr"]);
  });
});

describe("getSeatPlanPriceId", () => {
  afterEach(() => {
    delete process.env.STRIPE_SEAT_PRICE_ID;
  });

  it("returns first price id", () => {
    process.env.STRIPE_SEAT_PRICE_ID = "price_a, price_b";
    expect(getSeatPlanPriceId(SEAT_PLAN_STANDARD, "month")).toBe("price_a");
  });

  it("returns empty string when no price ids configured", () => {
    expect(getSeatPlanPriceId(SEAT_PLAN_STANDARD, "month")).toBe("");
  });
});
