import { randomUUID } from "crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
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

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const rows = await db
    .select({
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
    })
    .from(deployPresetModels)
    .orderBy(
      desc(deployPresetModels.isDefault),
      asc(deployPresetModels.sortOrder),
      asc(deployPresetModels.createdAt),
    );

  const now = new Date();
  const modelIds = rows.map((row) => row.modelId);
  const pricingRows =
    modelIds.length > 0
      ? await db
          .select({
            modelId: deployPresetPricingRules.modelId,
            unitPriceUsd: deployPresetPricingRules.unitPriceUsd,
          })
          .from(deployPresetPricingRules)
          .where(
            and(
              eq(deployPresetPricingRules.seatPlan, "seat-standard"),
              eq(deployPresetPricingRules.isActive, true),
              inArray(deployPresetPricingRules.modelId, modelIds),
              lte(deployPresetPricingRules.effectiveFrom, now),
              or(
                isNull(deployPresetPricingRules.effectiveTo),
                gt(deployPresetPricingRules.effectiveTo, now),
              ),
            ),
          )
          .orderBy(desc(deployPresetPricingRules.effectiveFrom))
      : [];

  const pricingByModel = new Map<string, number>();
  for (const row of pricingRows) {
    if (!row.modelId) continue;
    if (pricingByModel.has(row.modelId)) continue;
    pricingByModel.set(row.modelId, Number(row.unitPriceUsd));
  }

  return NextResponse.json({
    models: rows.map((row) => ({
      id: row.id,
      model_id: row.modelId,
      display_name: row.displayName,
      provider: row.provider,
      tier: row.tier,
      is_active: row.isActive,
      is_default: row.isDefault,
      sort_order: row.sortOrder,
      pricing_usd: pricingByModel.get(row.modelId) ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

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

  const modelId = payload.model_id?.trim();
  const displayName = payload.display_name?.trim();
  const provider = payload.provider?.trim();
  const rawTier = typeof payload.tier === "string" ? payload.tier : "";
  const tier = parseTier(rawTier);
  if (rawTier.trim() && !tier) {
    return NextResponse.json(
      { error: "tier must be one of: economy, standard, premium" },
      { status: 400 },
    );
  }
  const isActive = payload.is_active !== false;
  const isDefault = payload.is_default === true;
  const sortOrder =
    typeof payload.sort_order === "number" &&
    Number.isFinite(payload.sort_order)
      ? Math.trunc(payload.sort_order)
      : 0;

  if (!modelId || !displayName || !provider) {
    return NextResponse.json(
      { error: "model_id, display_name, provider are required" },
      { status: 400 },
    );
  }

  const now = new Date();
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

  if (isDefault) {
    await db
      .update(deployPresetModels)
      .set({ isDefault: false, updatedAt: now })
      .where(eq(deployPresetModels.isDefault, true));
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
      .insert(deployPresetModels)
      .values({
        id: randomUUID(),
        modelId,
        displayName,
        provider,
        tier,
        isActive,
        isDefault,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
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
        { error: `model_id already exists: ${modelId}` },
        { status: 409 },
      );
    }
    throw error;
  }
  const inserted = rows[0];

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
          eq(deployPresetPricingRules.modelId, inserted.modelId),
          eq(deployPresetPricingRules.isActive, true),
          isNull(deployPresetPricingRules.effectiveTo),
        ),
      );

    await db.insert(deployPresetPricingRules).values({
      id: randomUUID(),
      seatPlan: "seat-standard",
      modelId: inserted.modelId,
      tier: null,
      unitPriceUsd: pricingUsd.toFixed(6),
      effectiveFrom: now,
      effectiveTo: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  revalidateLandingPresetModels();

  return NextResponse.json({
    model: {
      id: inserted.id,
      model_id: inserted.modelId,
      display_name: inserted.displayName,
      provider: inserted.provider,
      tier: inserted.tier,
      is_active: inserted.isActive,
      is_default: inserted.isDefault,
      sort_order: inserted.sortOrder,
      pricing_usd: pricingUsd,
      created_at: inserted.createdAt.toISOString(),
      updated_at: inserted.updatedAt.toISOString(),
    },
  });
}
