const ATTRIBUTION_STORAGE_KEY = "clawsimple.ads.attribution";
const MAX_METADATA_LENGTH = 500;

export const TRACKED_ATTRIBUTION_QUERY_PARAMS = [
  "gclid",
  "gbraid",
  "wbraid",
  "gad_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "msclkid",
] as const;

export type AttributionQueryParam = (typeof TRACKED_ATTRIBUTION_QUERY_PARAMS)[number];

export type StoredAttribution = Partial<
  Record<AttributionQueryParam, string> & {
    site: string;
    landing_path: string;
    landing_url: string;
    landing_referrer: string;
    referrer: string;
    checkout_path: string;
    checkout_url: string;
    locale: string;
    checkout_context: string;
    entry_point: string;
  }
>;

function isBrowser() {
  return typeof window !== "undefined";
}

function trimValue(value: string) {
  return value.trim().slice(0, MAX_METADATA_LENGTH);
}

function sanitizeValue(value: unknown) {
  if (typeof value !== "string") return "";
  return trimValue(value);
}

function buildCurrentBrowserContext() {
  if (!isBrowser()) return {};

  const href = window.location.href;
  const path = `${window.location.pathname}${window.location.search}`;
  const referrer = document.referrer ?? "";

  return {
    site: trimValue(window.location.hostname),
    checkout_path: trimValue(path),
    checkout_url: trimValue(href),
    referrer: trimValue(referrer),
  } satisfies StoredAttribution;
}

export function readStoredAttribution(): StoredAttribution {
  if (!isBrowser()) return {};
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredAttribution;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function storeAttributionFromSearchParams(searchParams: URLSearchParams) {
  if (!isBrowser()) return;

  const nextValue: StoredAttribution = {};
  for (const key of TRACKED_ATTRIBUTION_QUERY_PARAMS) {
    const value = searchParams.get(key);
    if (value) nextValue[key] = trimValue(value);
  }

  try {
    const current = readStoredAttribution();
    const browserContext = buildCurrentBrowserContext();
    const merged = {
      ...current,
      ...nextValue,
      ...browserContext,
    } satisfies StoredAttribution;

    if (!merged.landing_path) {
      merged.landing_path = browserContext.checkout_path ?? "";
    }
    if (!merged.landing_url) {
      merged.landing_url = browserContext.checkout_url ?? "";
    }
    if (!merged.landing_referrer) {
      merged.landing_referrer = browserContext.referrer ?? "";
    }
    if (!merged.site && browserContext.site) {
      merged.site = browserContext.site;
    }

    window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage failures; tracking should remain best-effort.
  }
}

export function buildCheckoutAttributionPayload(extra: {
  locale?: string;
  checkoutContext?: string;
  entryPoint?: string;
} = {}): StoredAttribution {
  const stored = readStoredAttribution();
  const browserContext = buildCurrentBrowserContext();

  return {
    ...stored,
    ...browserContext,
    ...(extra.locale ? { locale: trimValue(extra.locale) } : {}),
    ...(extra.checkoutContext
      ? { checkout_context: trimValue(extra.checkoutContext) }
      : {}),
    ...(extra.entryPoint ? { entry_point: trimValue(extra.entryPoint) } : {}),
  };
}

export function toStripeAttributionMetadata(
  input: Record<string, unknown> | null | undefined,
  fallbackSite = ""
) {
  const metadata: Record<string, string> = {};
  const allowedKeys = new Set<string>([
    "site",
    "landing_path",
    "landing_url",
    "landing_referrer",
    "checkout_path",
    "checkout_url",
    "referrer",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "gbraid",
    "wbraid",
    "gad_source",
    "fbclid",
    "msclkid",
    "locale",
    "checkout_context",
    "entry_point",
  ]);

  for (const [key, rawValue] of Object.entries(input ?? {})) {
    if (!allowedKeys.has(key)) continue;
    const value = sanitizeValue(rawValue);
    if (!value) continue;
    metadata[key] = value;
  }

  if (!metadata.site && fallbackSite.trim()) {
    metadata.site = trimValue(fallbackSite);
  }

  return metadata;
}
