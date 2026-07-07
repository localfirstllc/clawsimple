// Pure helpers extracted from src/app/api/deploy/route.ts so they are
// independently testable without duplicating implementation details.

export const TELEGRAM_USER_ID_RE = /^\d{4,20}$/;

export function sanitizeServerName(value: string) {
  const trimmed = value.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  return sanitized.replace(/^-+|-+$/g, "");
}

export function normalizeTargetRuntime(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "hermes";
  if (raw === "hermes" || raw === "openclaw") return raw;
  throw new Error("target_runtime must be hermes or openclaw");
}

export function readTargetRuntimeFromFingerprint(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fingerprint = value as Record<string, unknown>;
  const candidates = [
    fingerprint.active_runtime,
    fingerprint.target_runtime,
    (
      fingerprint.agent_runtimes as
        | { main?: Record<string, unknown> }
        | undefined
    )?.main?.active_runtime,
    (
      fingerprint.agent_runtimes as
        | { main?: Record<string, unknown> }
        | undefined
    )?.main?.target_runtime,
  ];
  for (const candidate of candidates) {
    const raw =
      typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
    if (raw === "hermes" || raw === "openclaw") return raw;
  }
  return null;
}

export function parseListEnv(raw: string | undefined, fallback: string[]) {
  if (!raw) return fallback;
  const values = raw
    .split(/[,\s]+/g)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const unique = Array.from(new Set(values));
  return unique.length > 0 ? unique : fallback;
}

export function isMissingTelegramTableError(error: unknown) {
  const err = error as { code?: string; message?: string; cause?: unknown };
  const cause = err?.cause as { code?: string; message?: string } | undefined;
  const message = err?.message ?? "";
  const causeMessage = cause?.message ?? "";
  return (
    err?.code === "42P01" ||
    cause?.code === "42P01" ||
    message.includes('relation "telegram_account_link" does not exist') ||
    causeMessage.includes('relation "telegram_account_link" does not exist')
  );
}

export function isTelegramLinkUniqueViolation(error: unknown) {
  const err = error as
    | { code?: string; message?: string; cause?: unknown }
    | undefined;
  const cause = err?.cause as { code?: string; message?: string } | undefined;
  const message = err?.message ?? "";
  const causeMessage = cause?.message ?? "";
  return (
    err?.code === "23505" ||
    cause?.code === "23505" ||
    message.includes("telegram_account_link_telegram_user_id_unique") ||
    causeMessage.includes("telegram_account_link_telegram_user_id_unique") ||
    causeMessage.includes("Key (telegram_user_id)=") ||
    message.includes("Key (telegram_user_id)=")
  );
}
