import { revalidateTag } from "next/cache";

export const LANDING_PRESET_MODELS_CACHE_TAG = "landing-page-preset-models";

export function revalidateLandingPresetModels() {
  revalidateTag(LANDING_PRESET_MODELS_CACHE_TAG, { expire: 0 });
}
