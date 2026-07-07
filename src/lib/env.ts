export function readPublicEnv(
  value: string | undefined,
  fallback?: string,
): string | undefined {
  const normalized = value?.trim();

  if (normalized) {
    return normalized;
  }

  return fallback;
}
