import { and, desc, eq, gt, isNull, lte, or, count } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  deployPresetModels,
  deployPresetPricingRules,
} from "@/lib/db/schema";

export type ManagedSeatPlan = "seat-standard" | "seat-max";
export type ModelPricingSource = "model" | "tier" | "fallback";

export type ActivePresetModel = {
  id: string;
  modelId: string;
  displayName: string;
  provider: string;
  tier: string | null;
  isDefault: boolean;
  sortOrder: number;
};

export type ResolvedModelPrice = {
  unitPriceUsd: number;
  source: ModelPricingSource;
  ruleId: string | null;
  tier: string | null;
};

function parseUsd(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

async function findEffectiveRuleByModel(params: {
  seatPlan: ManagedSeatPlan;
  modelId: string;
  at: Date;
}) {
  const rows = await db
    .select({
      id: deployPresetPricingRules.id,
      unitPriceUsd: deployPresetPricingRules.unitPriceUsd,
      tier: deployPresetPricingRules.tier,
    })
    .from(deployPresetPricingRules)
    .where(
      and(
        eq(deployPresetPricingRules.isActive, true),
        eq(deployPresetPricingRules.seatPlan, params.seatPlan),
        eq(deployPresetPricingRules.modelId, params.modelId),
        lte(deployPresetPricingRules.effectiveFrom, params.at),
        orRuleNotExpired(params.at)
      )
    )
    .orderBy(desc(deployPresetPricingRules.effectiveFrom))
    .limit(1);
  return rows[0] ?? null;
}

async function findEffectiveRuleByTier(params: {
  seatPlan: ManagedSeatPlan;
  tier: string;
  at: Date;
}) {
  const rows = await db
    .select({
      id: deployPresetPricingRules.id,
      unitPriceUsd: deployPresetPricingRules.unitPriceUsd,
      tier: deployPresetPricingRules.tier,
    })
    .from(deployPresetPricingRules)
    .where(
      and(
        eq(deployPresetPricingRules.isActive, true),
        eq(deployPresetPricingRules.seatPlan, params.seatPlan),
        eq(
          deployPresetPricingRules.tier,
          params.tier as "economy" | "standard" | "premium"
        ),
        lte(deployPresetPricingRules.effectiveFrom, params.at),
        orRuleNotExpired(params.at)
      )
    )
    .orderBy(desc(deployPresetPricingRules.effectiveFrom))
    .limit(1);
  return rows[0] ?? null;
}

function orRuleNotExpired(at: Date) {
  return or(
    isNull(deployPresetPricingRules.effectiveTo),
    gt(deployPresetPricingRules.effectiveTo, at)
  );
}

export async function listActivePresetModels(): Promise<ActivePresetModel[]> {
  const rows = await db
    .select({
      id: deployPresetModels.id,
      modelId: deployPresetModels.modelId,
      displayName: deployPresetModels.displayName,
      provider: deployPresetModels.provider,
      tier: deployPresetModels.tier,
      isDefault: deployPresetModels.isDefault,
      sortOrder: deployPresetModels.sortOrder,
      createdAt: deployPresetModels.createdAt,
    })
    .from(deployPresetModels)
    .where(eq(deployPresetModels.isActive, true))
    .orderBy(
      desc(deployPresetModels.isDefault),
      deployPresetModels.sortOrder,
      deployPresetModels.createdAt
    );

  return rows.map((row) => ({
    id: row.id,
    modelId: row.modelId,
    displayName: row.displayName,
    provider: row.provider,
    tier: row.tier,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
  }));
}

export async function hasAnyPresetModels(): Promise<boolean> {
  const result = await db.select({ count: count() }).from(deployPresetModels);
  return (result[0]?.count ?? 0) > 0;
}

/**
 * Deactivate a model by modelId. Returns true if the model was newly
 * deactivated (was active), false if it was already inactive or doesn't exist.
 */
export async function deactivateModel(modelId: string): Promise<boolean> {
  const existing = await db
    .select({ isActive: deployPresetModels.isActive })
    .from(deployPresetModels)
    .where(eq(deployPresetModels.modelId, modelId))
    .limit(1);
  if (!existing.length || !existing[0].isActive) return false;
  await db
    .update(deployPresetModels)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(deployPresetModels.modelId, modelId));
  return true;
}

export async function resolveModelPrice(params: {
  seatPlan: ManagedSeatPlan;
  modelId?: string | null;
  at?: Date;
}): Promise<ResolvedModelPrice | null> {
  const at = params.at ?? new Date();
  const modelId = params.modelId?.trim() || null;
  // Pricing policy is unified for managed seats: we always resolve via standard rules.
  // Keep seatPlan in the signature for compatibility with existing call sites.
  const normalizedSeatPlan: ManagedSeatPlan = "seat-standard";

  if (modelId) {
    const modelRule = await findEffectiveRuleByModel({
      seatPlan: normalizedSeatPlan,
      modelId,
      at,
    });
    if (modelRule) {
      const unit = parseUsd(modelRule.unitPriceUsd);
      if (unit !== null) {
        return {
          unitPriceUsd: unit,
          source: "model",
          ruleId: modelRule.id,
          tier: modelRule.tier ?? null,
        };
      }
    }

    const modelRows = await db
      .select({
        tier: deployPresetModels.tier,
      })
      .from(deployPresetModels)
      .where(
        and(
          eq(deployPresetModels.isActive, true),
          eq(deployPresetModels.modelId, modelId)
        )
      )
      .limit(1);
    const tier = modelRows[0]?.tier ?? null;

    if (tier) {
      const tierRule = await findEffectiveRuleByTier({
        seatPlan: normalizedSeatPlan,
        tier,
        at,
      });
      if (tierRule) {
        const unit = parseUsd(tierRule.unitPriceUsd);
        if (unit !== null) {
          return {
            unitPriceUsd: unit,
            source: "tier",
            ruleId: tierRule.id,
            tier,
          };
        }
      }
    }
  }

  // If model tier is missing or no tier-specific rule exists, fallback to standard tier rule.
  const standardTierRule = await findEffectiveRuleByTier({
    seatPlan: normalizedSeatPlan,
    tier: "standard",
    at,
  });
  if (standardTierRule) {
    const unit = parseUsd(standardTierRule.unitPriceUsd);
    if (unit !== null) {
      return {
        unitPriceUsd: unit,
        source: "tier",
        ruleId: standardTierRule.id,
        tier: "standard",
      };
    }
  }

  return null;
}
