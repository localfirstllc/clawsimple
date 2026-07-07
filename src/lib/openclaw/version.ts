const OPENCLAW_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function normalizeRuntimeVersion(
  value: string | null | undefined,
  runtimeNamePattern: RegExp
) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  if (OPENCLAW_VERSION_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(runtimeNamePattern);
  const normalized = match?.[1]?.trim() ?? "";
  return OPENCLAW_VERSION_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeOpenClawVersion(value: string | null | undefined) {
  return normalizeRuntimeVersion(
    value,
    /openclaw\s+([A-Za-z0-9][A-Za-z0-9._-]{0,63})/i
  );
}

export function normalizeHermesAgentVersion(value: string | null | undefined) {
  return normalizeRuntimeVersion(
    value,
    /hermes(?:\s+agent)?\s+([A-Za-z0-9][A-Za-z0-9._-]{0,63})/i
  );
}

export function isOpenClawVersionMatch(
  currentVersion: string | null | undefined,
  targetVersion: string | null | undefined
) {
  const normalizedTarget = normalizeOpenClawVersion(targetVersion);
  if (!normalizedTarget) return false;
  return normalizeOpenClawVersion(currentVersion) === normalizedTarget;
}

export function isHermesAgentVersionMatch(
  currentVersion: string | null | undefined,
  targetVersion: string | null | undefined
) {
  const normalizedTarget = normalizeHermesAgentVersion(targetVersion);
  if (!normalizedTarget) return false;
  return normalizeHermesAgentVersion(currentVersion) === normalizedTarget;
}
