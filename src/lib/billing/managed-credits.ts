import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD,
  DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD,
} from "@/lib/billing/managed-credit-defaults";
import { deployPresetUsageSeatDaily } from "@/lib/db/schema";

export type ManagedSeatPlan = "seat-standard" | "seat-max";

function parseUsd(raw: string | undefined, fallback: number) {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getIncludedManagedCreditsCapUsd(
  seatPlan: string | null | undefined,
) {
  const standardCap = parseUsd(
    process.env.COST_CAP_USD,
    DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD,
  );
  const maxCap = parseUsd(
    process.env.COST_CAP_MAX_USD,
    DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD,
  );
  if (seatPlan === "seat-standard") return standardCap;
  if (seatPlan === "seat-max") return maxCap;
  return null;
}

export async function getExistingUnifiedCostUsd(params: {
  seatIdentity: string;
  startDay: string;
  endDay: string;
}): Promise<number> {
  const rows = await db
    .select({
      costUsd: sql<string>`coalesce(sum(${deployPresetUsageSeatDaily.costEstimatedUsd}), 0)::text`,
    })
    .from(deployPresetUsageSeatDaily)
    .where(
      and(
        eq(deployPresetUsageSeatDaily.seatId, params.seatIdentity),
        gte(deployPresetUsageSeatDaily.day, params.startDay),
        lte(deployPresetUsageSeatDaily.day, params.endDay),
      ),
    );

  return Number(rows[0]?.costUsd ?? "0");
}
