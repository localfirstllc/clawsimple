export function isMaintenanceModeEnabled(value: string | undefined): boolean {
  if (!value) return false;

  const normalized = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "")
    .trim()
    .toLowerCase();

  return normalized === "1" || normalized === "true";
}
