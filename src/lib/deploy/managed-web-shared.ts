export type ManagedWebOperation = "search" | "fetch";
export type ManagedWebProvider = "exa-search" | "cloudflare-browser-rendering";

const DEFAULT_MANAGED_SEARXNG_RESULT_COUNT = 10;

type ExaResultRecord = {
  title?: unknown;
  url?: unknown;
  summary?: unknown;
  text?: unknown;
  highlights?: unknown;
  publishedDate?: unknown;
};

export function resolveManagedWebProvider(
  operation: ManagedWebOperation
): ManagedWebProvider {
  return operation === "search" ? "exa-search" : "cloudflare-browser-rendering";
}

export function normalizeManagedWebSearchResults(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as ExaResultRecord;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url) return [];

    const highlights = Array.isArray(record.highlights)
      ? record.highlights
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [];

    const summary =
      typeof record.summary === "string" && record.summary.trim()
        ? record.summary.trim()
        : highlights.join("\n");

    return [
      {
        title:
          typeof record.title === "string" && record.title.trim() ? record.title.trim() : url,
        url,
        description: summary,
        content:
          typeof record.text === "string" && record.text.trim() ? record.text.trim() : undefined,
        publishedDate:
          typeof record.publishedDate === "string" && record.publishedDate.trim()
            ? record.publishedDate.trim()
            : undefined,
      },
    ];
  });
}

export function buildManagedExaSearchBodyFromSearxngParams(searchParams: URLSearchParams) {
  const query = searchParams.get("q")?.trim() || "";
  if (!query) {
    return { error: "q is required", status: 400 } as const;
  }

  const format = searchParams.get("format")?.trim().toLowerCase();
  if (format && format !== "json") {
    return { error: "format must be json", status: 400 } as const;
  }

  return {
    query,
    numResults: DEFAULT_MANAGED_SEARXNG_RESULT_COUNT,
    type: "auto",
    contents: {
      summary: true,
      highlights: true,
    },
  } as const;
}

export function normalizeManagedSearxngSearchResults(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as ExaResultRecord;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url) return [];

    const highlights = Array.isArray(record.highlights)
      ? record.highlights
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [];
    const summary =
      typeof record.summary === "string" && record.summary.trim()
        ? record.summary.trim()
        : highlights.join("\n");

    return [
      {
        title:
          typeof record.title === "string" && record.title.trim() ? record.title.trim() : url,
        url,
        ...(summary ? { content: summary } : {}),
      },
    ];
  });
}

export function buildManagedSearxngSearchPayload(payload: unknown) {
  return {
    results: normalizeManagedSearxngSearchResults(payload),
  };
}
