export const AI_SOURCE_MANAGED = "managed";

export type AiSource = typeof AI_SOURCE_MANAGED;

export function resolveAiSource(value: unknown): AiSource | null {
  if (value === AI_SOURCE_MANAGED) return AI_SOURCE_MANAGED;
  return null;
}
