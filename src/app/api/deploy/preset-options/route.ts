import { NextResponse } from "next/server";
import { listActivePresetModels, resolveModelPrice } from "@/lib/billing/model-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  type ModelData = {
    id?: string;
    modelId: string;
    displayName: string;
    provider: string;
    tier: string | null;
    sortOrder: number;
    isDefault: boolean;
  };

  const rows = await listActivePresetModels();
  const models: ModelData[] = rows as unknown as ModelData[];

  const modelsWithPrice = (
    await Promise.all(
      models.map(async (row) => {
        const price = await resolveModelPrice({
          seatPlan: "seat-standard",
          modelId: row.modelId,
        });
        return price
          ? {
              id: "id" in row ? row.id : row.modelId,
              model_id: row.modelId,
              display_name: row.displayName,
              provider: row.provider,
              tier: row.tier ?? null,
              is_default: row.isDefault,
              sort_order: row.sortOrder,
              unit_price_usd: price.unitPriceUsd,
            }
          : null;
      })
    )
  ).filter((m): m is NonNullable<typeof m> => m !== null);

  return NextResponse.json({
    models: modelsWithPrice,
  });
}
