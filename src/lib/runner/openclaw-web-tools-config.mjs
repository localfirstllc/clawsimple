const OFFICIAL_FIRECRAWL_ALLOWED_HOSTS = new Set(["api.firecrawl.dev"]);

function normalizeMode(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeHostname(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function ensureObject(parent, key) {
  const value = parent?.[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const next = {};
  parent[key] = next;
  return next;
}

export function isOfficialFirecrawlManagedHostAllowed(baseUrl) {
  const hostname = normalizeHostname(baseUrl);
  return OFFICIAL_FIRECRAWL_ALLOWED_HOSTS.has(hostname);
}

export function deriveOpenClawManagedWebToolsOverrides(params = {}) {
  const exaMode = normalizeMode(params.exaMode);
  const searchCrawlMode = normalizeMode(params.searchCrawlMode);
  const firecrawlBaseUrl = typeof params.firecrawlBaseUrl === "string" ? params.firecrawlBaseUrl : "";
  const firecrawlHost = normalizeHostname(firecrawlBaseUrl);
  const firecrawlManagedHostAllowed = isOfficialFirecrawlManagedHostAllowed(firecrawlBaseUrl);
  const searchProvider =
    exaMode === "managed" ? "exa" : exaMode === "byok" ? "exa" : "";
  const disableFirecrawlFetch =
    searchCrawlMode === "managed" && firecrawlHost !== "" && !firecrawlManagedHostAllowed;

  return {
    searchProvider,
    disableFirecrawlFetch,
    firecrawlHost,
    firecrawlManagedHostAllowed,
  };
}

export function applyOpenClawManagedWebToolsOverrides(config, overrides = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return false;
  }

  let changed = false;
  const tools = ensureObject(config, "tools");
  const web = ensureObject(tools, "web");

  if (typeof overrides.searchProvider === "string" && overrides.searchProvider) {
    const search = ensureObject(web, "search");
    if (search.provider !== overrides.searchProvider) {
      search.provider = overrides.searchProvider;
      changed = true;
    }
  }

  if (overrides.disableFirecrawlFetch) {
    const fetch = ensureObject(web, "fetch");
    const firecrawl = ensureObject(fetch, "firecrawl");
    if (firecrawl.enabled !== false) {
      firecrawl.enabled = false;
      changed = true;
    }
  }

  return changed;
}
