import { and, desc, eq, gt, isNull, lte, ne, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { deployPresetModels, deployPresetPricingRules } from "@/lib/db/schema";
import { siteConfig } from "@/config/site";
import { revalidateLandingPresetModels } from "@/lib/billing/preset-model-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_TIERS = new Set(["economy", "standard", "premium"]);

function getDbErrorMeta(error: unknown) {
  const top = error as { code?: string; constraint?: string; cause?: unknown };
  const cause = top?.cause as
    | { code?: string; constraint?: string }
    | undefined;
  return {
    code: top?.code ?? cause?.code,
    constraint: top?.constraint ?? cause?.constraint,
  };
}

function parseTier(value: unknown): "economy" | "standard" | "premium" | null {
  if (typeof value !== "string") return null;
  const tier = value.trim().toLowerCase();
  if (!tier) return null;
  if (!ALLOWED_TIERS.has(tier)) return null;
  return tier as "economy" | "standard" | "premium";
}

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
    model_id?: string;
    display_name?: string;
    provider?: string;
    tier?: string | null;
    pricing_usd?: number | string | null;
    is_active?: boolean;
    is_default?: boolean;
    sort_order?: number;
  } | null;
  if (!payload) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const now = new Date();
  const existingRows = await db
    .select({
      id: deployPresetModels.id,
      modelId: deployPresetModels.modelId,
    })
    .from(deployPresetModels)
    .where(eq(deployPresetModels.id, targetId))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: "model not found" }, { status: 404 });
  }

  const patch: Partial<typeof deployPresetModels.$inferInsert> = {
    updatedAt: now,
  };
  if (typeof payload.model_id === "string")
    patch.modelId = payload.model_id.trim();
  if (typeof payload.display_name === "string")
    patch.displayName = payload.display_name.trim();
  if (typeof payload.provider === "string")
    patch.provider = payload.provider.trim();
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
  if (typeof payload.is_active === "boolean")
    patch.isActive = payload.is_active;
  if (typeof payload.is_default === "boolean")
    patch.isDefault = payload.is_default;
  if (
    typeof payload.sort_order === "number" &&
    Number.isFinite(payload.sort_order)
  ) {
    patch.sortOrder = Math.trunc(payload.sort_order);
  }
  const pricingRaw = payload.pricing_usd;
  const pricingUsd =
    pricingRaw === null || pricingRaw === undefined || pricingRaw === ""
      ? null
      : Number(pricingRaw);
  if (
    pricingUsd !== null &&
    (!Number.isFinite(pricingUsd) ||
      pricingUsd <= siteConfig.pricing.limits.minModelPriceUsd ||
      pricingUsd > siteConfig.pricing.limits.maxModelPriceUsd)
  ) {
    return NextResponse.json(
      {
        error: `pricing_usd must be > ${siteConfig.pricing.limits.minModelPriceUsd} and <= ${siteConfig.pricing.limits.maxModelPriceUsd}`,
      },
      { status: 400 },
    );
  }

  if (Object.keys(patch).length === 1 && patch.updatedAt) {
    return NextResponse.json({ error: "no changes provided" }, { status: 400 });
  }

  if (patch.isDefault === true) {
    await db
      .update(deployPresetModels)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(deployPresetModels.isDefault, true),
          ne(deployPresetModels.id, targetId),
        ),
      );
  }

  let rows: Array<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    tier: "economy" | "standard" | "premium" | null;
    isActive: boolean;
    isDefault: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  try {
    rows = await db
      .update(deployPresetModels)
      .set(patch)
      .where(eq(deployPresetModels.id, targetId))
      .returning({
        id: deployPresetModels.id,
        modelId: deployPresetModels.modelId,
        displayName: deployPresetModels.displayName,
        provider: deployPresetModels.provider,
        tier: deployPresetModels.tier,
        isActive: deployPresetModels.isActive,
        isDefault: deployPresetModels.isDefault,
        sortOrder: deployPresetModels.sortOrder,
        createdAt: deployPresetModels.createdAt,
        updatedAt: deployPresetModels.updatedAt,
      });
  } catch (error) {
    const dbError = getDbErrorMeta(error);
    if (
      dbError?.code === "23505" &&
      dbError?.constraint === "deploy_preset_models_model_id_unique"
    ) {
      return NextResponse.json(
        { error: `model_id already exists: ${patch.modelId}` },
        { status: 409 },
      );
    }
    throw error;
  }

  const updated = rows[0] ?? null;

  if (!updated) {
    return NextResponse.json({ error: "model not found" }, { status: 404 });
  }

  if (existing.modelId !== updated.modelId) {
    await db
      .update(deployPresetPricingRules)
      .set({ modelId: updated.modelId, updatedAt: now })
      .where(
        and(
          eq(deployPresetPricingRules.seatPlan, "seat-standard"),
          eq(deployPresetPricingRules.modelId, existing.modelId),
          eq(deployPresetPricingRules.isActive, true),
        ),
      );
  }

  if (pricingUsd !== null) {
    await db
      .update(deployPresetPricingRules)
      .set({
        effectiveTo: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(deployPresetPricingRules.seatPlan, "seat-standard"),
          eq(deployPresetPricingRules.modelId, updated.modelId),
          eq(deployPresetPricingRules.isActive, true),
          lte(deployPresetPricingRules.effectiveFrom, now),
          or(
            isNull(deployPresetPricingRules.effectiveTo),
            gt(deployPresetPricingRules.effectiveTo, now),
          ),
        ),
      );

    await db.insert(deployPresetPricingRules).values({
      id: randomUUID(),
      seatPlan: "seat-standard",
      modelId: updated.modelId,
      tier: null,
      unitPriceUsd: pricingUsd.toFixed(6),
      effectiveFrom: now,
      effectiveTo: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  const currentPricingRows = await db
    .select({
      unitPriceUsd: deployPresetPricingRules.unitPriceUsd,
    })
    .from(deployPresetPricingRules)
    .where(
      and(
        eq(deployPresetPricingRules.seatPlan, "seat-standard"),
        eq(deployPresetPricingRules.modelId, updated.modelId),
        eq(deployPresetPricingRules.isActive, true),
        lte(deployPresetPricingRules.effectiveFrom, now),
        or(
          isNull(deployPresetPricingRules.effectiveTo),
          gt(deployPresetPricingRules.effectiveTo, now),
        ),
      ),
    )
    .orderBy(desc(deployPresetPricingRules.effectiveFrom))
    .limit(1);
  const pricingValue =
    currentPricingRows[0]?.unitPriceUsd !== undefined
      ? Number(currentPricingRows[0].unitPriceUsd)
      : null;

  revalidateLandingPresetModels();

  return NextResponse.json({
    model: {
      id: updated.id,
      model_id: updated.modelId,
      display_name: updated.displayName,
      provider: updated.provider,
      tier: updated.tier,
      is_active: updated.isActive,
      is_default: updated.isDefault,
      sort_order: updated.sortOrder,
      pricing_usd: pricingValue,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    },
  });
}
