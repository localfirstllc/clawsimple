import { unstable_cache } from "next/cache";
import {
  listActivePresetModels,
  resolveModelPrice,
} from "@/lib/billing/model-pricing";
import { LANDING_PRESET_MODELS_CACHE_TAG } from "@/lib/billing/preset-model-cache";

export const getCachedLandingPresetModels = unstable_cache(
  async () => {
    const rows = await listActivePresetModels();
    const models = (
      await Promise.all(
        rows.map(async (row) => {
          const price = await resolveModelPrice({
            seatPlan: "seat-standard",
            modelId: row.modelId,
          });
          return price
            ? {
                id: row.id,
                model_id: row.modelId,
                display_name: row.displayName,
                provider: row.provider,
                tier: row.tier,
                is_default: row.isDefault,
                sort_order: row.sortOrder,
                unit_price_usd: price.unitPriceUsd,
              }
            : null;
        }),
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null);
    return models;
  },
  [LANDING_PRESET_MODELS_CACHE_TAG],
  { tags: [LANDING_PRESET_MODELS_CACHE_TAG], revalidate: false },
);
