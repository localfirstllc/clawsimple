import { randomUUID } from "crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { deployPresetPricingRules } from "@/lib/db/schema";
import { siteConfig } from "@/config/site";
import { revalidateLandingPresetModels } from "@/lib/billing/preset-model-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_TIERS = new Set(["economy", "standard", "premium"]);

async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== "admin") {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { session };
}

function parseSeatPlan(value: unknown): "seat-standard" | "seat-max" | null {
  return value === "seat-standard" || value === "seat-max" ? value : null;
}

function parseUsd(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(6);
}

function parseTier(value: unknown): "economy" | "standard" | "premium" | null {
  if (typeof value !== "string") return null;
  const tier = value.trim().toLowerCase();
  if (!tier) return null;
  if (!ALLOWED_TIERS.has(tier)) return null;
  return tier as "economy" | "standard" | "premium";
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const seatPlanFilter = parseSeatPlan(
    request.nextUrl.searchParams.get("seat_plan"),
  );
  const activeRaw = request.nextUrl.searchParams.get("is_active");
  const activeFilter =
    activeRaw === "true" ? true : activeRaw === "false" ? false : null;

  const where = and(
    seatPlanFilter
      ? eq(deployPresetPricingRules.seatPlan, seatPlanFilter)
      : undefined,
    activeFilter === null
      ? undefined
      : eq(deployPresetPricingRules.isActive, activeFilter),
  );

  const rows = await db
    .select({
      id: deployPresetPricingRules.id,
      seatPlan: deployPresetPricingRules.seatPlan,
      modelId: deployPresetPricingRules.modelId,
      tier: deployPresetPricingRules.tier,
      unitPriceUsd: deployPresetPricingRules.unitPriceUsd,
      effectiveFrom: deployPresetPricingRules.effectiveFrom,
      effectiveTo: deployPresetPricingRules.effectiveTo,
      isActive: deployPresetPricingRules.isActive,
      createdAt: deployPresetPricingRules.createdAt,
      updatedAt: deployPresetPricingRules.updatedAt,
    })
    .from(deployPresetPricingRules)
    .where(where)
    .orderBy(
      asc(deployPresetPricingRules.seatPlan),
      desc(deployPresetPricingRules.effectiveFrom),
      asc(sql`coalesce(${deployPresetPricingRules.modelId}, '')`),
      asc(sql`coalesce(${deployPresetPricingRules.tier}::text, '')`),
    );

  return NextResponse.json({
    pricing_rules: rows.map((row) => ({
      id: row.id,
      seat_plan: row.seatPlan,
      model_id: row.modelId,
      tier: row.tier,
      unit_price_usd: Number(row.unitPriceUsd),
      effective_from: row.effectiveFrom.toISOString(),
      effective_to: row.effectiveTo ? row.effectiveTo.toISOString() : null,
      is_active: row.isActive,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const payload = (await request.json().catch(() => null)) as {
    seat_plan?: string;
    model_id?: string | null;
    tier?: string | null;
    unit_price_usd?: number;
    effective_from?: string;
    effective_to?: string | null;
    is_active?: boolean;
  } | null;
  if (!payload)
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  const seatPlan = parseSeatPlan(payload.seat_plan);
  if (!seatPlan) {
    return NextResponse.json(
      { error: "seat_plan must be seat-standard or seat-max" },
      { status: 400 },
    );
  }

  const modelId =
    typeof payload.model_id === "string"
      ? payload.model_id.trim() || null
      : null;
  const rawTier = typeof payload.tier === "string" ? payload.tier : "";
  const tier = parseTier(rawTier);
  if (rawTier.trim() && !tier) {
    return NextResponse.json(
      { error: "tier must be one of: economy, standard, premium" },
      { status: 400 },
    );
  }
  if (!modelId && !tier) {
    return NextResponse.json(
      { error: "model_id or tier is required" },
      { status: 400 },
    );
  }
  if (modelId && tier) {
    return NextResponse.json(
      { error: "model_id and tier cannot both be set" },
      { status: 400 },
    );
  }

  const unitPriceUsd = parseUsd(payload.unit_price_usd);
  if (!unitPriceUsd) {
    return NextResponse.json(
      { error: "unit_price_usd is invalid" },
      { status: 400 },
    );
  }

  const priceNum = Number(unitPriceUsd);
  if (
    priceNum <= siteConfig.pricing.limits.minModelPriceUsd ||
    priceNum > siteConfig.pricing.limits.maxModelPriceUsd
  ) {
    return NextResponse.json(
      {
        error: `unit_price_usd must be > ${siteConfig.pricing.limits.minModelPriceUsd} and <= ${siteConfig.pricing.limits.maxModelPriceUsd}`,
      },
      { status: 400 },
    );
  }

  const effectiveFrom = payload.effective_from
    ? new Date(payload.effective_from)
    : new Date();
  if (!Number.isFinite(effectiveFrom.getTime())) {
    return NextResponse.json(
      { error: "effective_from is invalid" },
      { status: 400 },
    );
  }
  let effectiveTo: Date | null = null;
  if (payload.effective_to) {
    effectiveTo = new Date(payload.effective_to);
    if (!Number.isFinite(effectiveTo.getTime())) {
      return NextResponse.json(
        { error: "effective_to is invalid" },
        { status: 400 },
      );
    }
  }

  const rows = await db
    .insert(deployPresetPricingRules)
    .values({
      id: randomUUID(),
      seatPlan,
      modelId,
      tier,
      unitPriceUsd,
      effectiveFrom,
      effectiveTo,
      isActive: payload.is_active !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({
      id: deployPresetPricingRules.id,
      seatPlan: deployPresetPricingRules.seatPlan,
      modelId: deployPresetPricingRules.modelId,
      tier: deployPresetPricingRules.tier,
      unitPriceUsd: deployPresetPricingRules.unitPriceUsd,
      effectiveFrom: deployPresetPricingRules.effectiveFrom,
      effectiveTo: deployPresetPricingRules.effectiveTo,
      isActive: deployPresetPricingRules.isActive,
      createdAt: deployPresetPricingRules.createdAt,
      updatedAt: deployPresetPricingRules.updatedAt,
    });

  const created = rows[0];
  revalidateLandingPresetModels();

  return NextResponse.json({
    pricing_rule: {
      id: created.id,
      seat_plan: created.seatPlan,
      model_id: created.modelId,
      tier: created.tier,
      unit_price_usd: Number(created.unitPriceUsd),
      effective_from: created.effectiveFrom.toISOString(),
      effective_to: created.effectiveTo
        ? created.effectiveTo.toISOString()
        : null,
      is_active: created.isActive,
      created_at: created.createdAt.toISOString(),
      updated_at: created.updatedAt.toISOString(),
    },
  });
}
