import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { deployPresetPricingRules } from "@/lib/db/schema";
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const targetId = id?.trim();
  if (!targetId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

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

  const patch: Partial<typeof deployPresetPricingRules.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (payload.seat_plan !== undefined) {
    const seatPlan = parseSeatPlan(payload.seat_plan);
    if (!seatPlan) {
      return NextResponse.json(
        { error: "seat_plan must be seat-standard or seat-max" },
        { status: 400 },
      );
    }
    patch.seatPlan = seatPlan;
  }
  if ("model_id" in payload) {
    patch.modelId =
      typeof payload.model_id === "string"
        ? payload.model_id.trim() || null
        : null;
  }
  if ("tier" in payload) {
    if (payload.tier === null) {
      patch.tier = null;
    } else if (typeof payload.tier === "string") {
      const parsedTier = parseTier(payload.tier);
      if (payload.tier.trim() && !parsedTier) {
        return NextResponse.json(
          { error: "tier must be one of: economy, standard, premium" },
          { status: 400 },
        );
      }
      patch.tier = parsedTier;
    } else {
      patch.tier = null;
    }
  }
  if ("unit_price_usd" in payload) {
    const usd = parseUsd(payload.unit_price_usd);
    if (!usd) {
      return NextResponse.json(
        { error: "unit_price_usd is invalid" },
        { status: 400 },
      );
    }
    patch.unitPriceUsd = usd;
  }
  if ("effective_from" in payload) {
    if (!payload.effective_from) {
      return NextResponse.json(
        { error: "effective_from is invalid" },
        { status: 400 },
      );
    }
    const date = new Date(payload.effective_from);
    if (!Number.isFinite(date.getTime())) {
      return NextResponse.json(
        { error: "effective_from is invalid" },
        { status: 400 },
      );
    }
    patch.effectiveFrom = date;
  }
  if ("effective_to" in payload) {
    const effectiveToRaw = payload.effective_to;
    if (
      effectiveToRaw === null ||
      effectiveToRaw === "" ||
      effectiveToRaw === undefined
    ) {
      patch.effectiveTo = null;
    } else {
      const date = new Date(effectiveToRaw);
      if (!Number.isFinite(date.getTime())) {
        return NextResponse.json(
          { error: "effective_to is invalid" },
          { status: 400 },
        );
      }
      patch.effectiveTo = date;
    }
  }
  if (typeof payload.is_active === "boolean") {
    patch.isActive = payload.is_active;
  }

  if (Object.keys(patch).length === 1 && patch.updatedAt) {
    return NextResponse.json({ error: "no changes provided" }, { status: 400 });
  }
  if (patch.modelId && patch.tier) {
    return NextResponse.json(
      { error: "model_id and tier cannot both be set" },
      { status: 400 },
    );
  }

  const rows = await db
    .update(deployPresetPricingRules)
    .set(patch)
    .where(eq(deployPresetPricingRules.id, targetId))
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
  const updated = rows[0];
  if (!updated) {
    return NextResponse.json(
      { error: "pricing rule not found" },
      { status: 404 },
    );
  }

  revalidateLandingPresetModels();

  return NextResponse.json({
    pricing_rule: {
      id: updated.id,
      seat_plan: updated.seatPlan,
      model_id: updated.modelId,
      tier: updated.tier,
      unit_price_usd: Number(updated.unitPriceUsd),
      effective_from: updated.effectiveFrom.toISOString(),
      effective_to: updated.effectiveTo
        ? updated.effectiveTo.toISOString()
        : null,
      is_active: updated.isActive,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    },
  });
}
