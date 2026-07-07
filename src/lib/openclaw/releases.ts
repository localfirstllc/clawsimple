import { unstable_cache } from "next/cache";
import { siteConfig } from "@/config/site";

const OPENCLAW_PACKAGE_URL = "https://registry.npmjs.org/openclaw/latest";
const HERMES_AGENT_LATEST_RELEASE_URL =
  "https://api.github.com/repos/NousResearch/hermes-agent/releases/latest";
const OPENCLAW_RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;
const HERMES_AGENT_RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;
const PUBLIC_RELEASE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const OPENCLAW_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HERMES_AGENT_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

let cachedVersion: string | null = null;
let cachedAt = 0;
let cachedHermesAgentVersion: string | null = null;
let cachedHermesAgentVersionAt = 0;

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function getClawSimpleBaseUrl() {
  return (
    trimToNull(process.env.BETTER_AUTH_URL) ??
    trimToNull(process.env.BETTER_AUTH_BASE_URL) ??
    trimToNull(process.env.NEXT_PUBLIC_APP_URL) ??
    siteConfig.url
  );
}

export async function fetchLatestOpenClawVersion(options?: {
  force?: boolean;
}): Promise<string> {
  const force = options?.force === true;
  const now = Date.now();
  if (!force && cachedVersion && now - cachedAt < OPENCLAW_RELEASE_CACHE_TTL_MS) {
    return cachedVersion;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(OPENCLAW_PACKAGE_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`registry request failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      version?: unknown;
    };
    const version =
      typeof payload.version === "string" ? payload.version.trim() : "";
    if (!OPENCLAW_VERSION_PATTERN.test(version)) {
      throw new Error("registry returned an invalid openclaw version");
    }

    cachedVersion = version;
    cachedAt = now;
    return version;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPublicOpenClawVersion(options?: {
  force?: boolean;
}): Promise<string | null> {
  if (options?.force) {
    return fetchLatestOpenClawVersion(options).catch(() => null);
  }
  return getCachedPublicOpenClawVersion().catch(() => null);
}

async function fetchLatestHermesAgentReleaseVersion(options?: {
  force?: boolean;
}): Promise<string> {
  const force = options?.force === true;
  const now = Date.now();
  if (
    !force &&
    cachedHermesAgentVersion &&
    now - cachedHermesAgentVersionAt < HERMES_AGENT_RELEASE_CACHE_TTL_MS
  ) {
    return cachedHermesAgentVersion;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(HERMES_AGENT_LATEST_RELEASE_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "clawsimple-release-check",
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `GitHub release request failed (${response.status}): ${body.slice(0, 200)}`
      );
    }

    const payload = (await response.json()) as {
      tag_name?: unknown;
      name?: unknown;
    };
    const version =
      trimToNull(typeof payload.tag_name === "string" ? payload.tag_name : null) ??
      trimToNull(typeof payload.name === "string" ? payload.name : null) ??
      "";
    if (!HERMES_AGENT_VERSION_PATTERN.test(version)) {
      throw new Error("GitHub returned an invalid Hermes Agent version");
    }

    cachedHermesAgentVersion = version;
    cachedHermesAgentVersionAt = now;
    return version;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPublicHermesAgentVersion(options?: {
  force?: boolean;
}): Promise<string | null> {
  if (options?.force) {
    return fetchLatestHermesAgentReleaseVersion(options).catch(() => null);
  }
  return getCachedPublicHermesAgentVersion().catch(() => null);
}

export async function fetchLatestHermesAgentVersion(options?: {
  force?: boolean;
}): Promise<string> {
  const manualVersion = trimToNull(process.env.HERMES_AGENT_RELEASE_VERSION);
  if (manualVersion && HERMES_AGENT_VERSION_PATTERN.test(manualVersion)) {
    return manualVersion;
  }

  return fetchLatestHermesAgentReleaseVersion(options);
}

const getCachedPublicOpenClawVersion = unstable_cache(
  () => fetchLatestOpenClawVersion({ force: true }),
  ["public-openclaw-latest-version"],
  { revalidate: PUBLIC_RELEASE_CACHE_TTL_SECONDS }
);

const getCachedPublicHermesAgentVersion = unstable_cache(
  () => fetchLatestHermesAgentReleaseVersion({ force: true }),
  ["public-hermes-agent-latest-version"],
  { revalidate: PUBLIC_RELEASE_CACHE_TTL_SECONDS }
);
