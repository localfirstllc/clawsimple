export const SEAT_PLAN_STANDARD = "seat-standard";
export const SEAT_PLAN_MAX = "seat-max";

export type SeatPlan =
  | typeof SEAT_PLAN_STANDARD
  | typeof SEAT_PLAN_MAX;

function parseEnvIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,\s]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function includesEnvId(raw: string | undefined, priceId: string): boolean {
  if (!raw || !priceId) return false;
  const ids = parseEnvIdList(raw);
  return ids.includes(priceId);
}

export function getSeatPlanPriceIds(
  plan: SeatPlan,
  interval: "month" | "year" = "month"
): string[] {
  if (interval === "year") {
    if (plan === SEAT_PLAN_MAX) {
      return parseEnvIdList(process.env.STRIPE_SEAT_PRICE_ID_MAX_YEARLY);
    }
    return parseEnvIdList(process.env.STRIPE_SEAT_PRICE_ID_YEARLY);
  }

  if (plan === SEAT_PLAN_MAX) {
    return parseEnvIdList(process.env.STRIPE_SEAT_PRICE_ID_MAX);
  }
  return parseEnvIdList(process.env.STRIPE_SEAT_PRICE_ID);
}

export function resolveSeatPlan(value: unknown): SeatPlan {
  if (value === SEAT_PLAN_MAX) return SEAT_PLAN_MAX;
  return SEAT_PLAN_STANDARD;
}

export function getSeatPlanPriceId(plan: SeatPlan, interval: 'month' | 'year' = 'month') {
  return getSeatPlanPriceIds(plan, interval)[0] ?? "";
}

export function resolveSeatMetaFromPriceId(priceId: string): {
  seatPlan: SeatPlan;
  billingInterval: "month" | "year";
} | null {
  if (!priceId) return null;

  const standardMonthly = process.env.STRIPE_SEAT_PRICE_ID;
  const standardYearly = process.env.STRIPE_SEAT_PRICE_ID_YEARLY;
  const maxMonthly = process.env.STRIPE_SEAT_PRICE_ID_MAX;
  const maxYearly = process.env.STRIPE_SEAT_PRICE_ID_MAX_YEARLY;

  if (includesEnvId(standardMonthly, priceId)) {
    return { seatPlan: SEAT_PLAN_STANDARD, billingInterval: "month" };
  }
  if (includesEnvId(standardYearly, priceId)) {
    return { seatPlan: SEAT_PLAN_STANDARD, billingInterval: "year" };
  }
  if (includesEnvId(maxMonthly, priceId)) {
    return { seatPlan: SEAT_PLAN_MAX, billingInterval: "month" };
  }
  if (includesEnvId(maxYearly, priceId)) {
    return { seatPlan: SEAT_PLAN_MAX, billingInterval: "year" };
  }
  return null;
}
