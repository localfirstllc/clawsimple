import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { assessManagedSearchCrawlChargeMock, finalizeManagedSearchCrawlUsageMock } = vi.hoisted(
  () => ({
    assessManagedSearchCrawlChargeMock: vi.fn(),
    finalizeManagedSearchCrawlUsageMock: vi.fn(),
  })
);

vi.mock("../billing/managed-search-crawl", () => ({
  getManagedExaRequestPriceUsd: vi.fn(() => 0.01),
  getManagedSearchCrawlRequestPriceUsd: vi.fn(() => 0.02),
}));

vi.mock("./managed-search-crawl-proxy", () => ({
  assessManagedSearchCrawlCharge: assessManagedSearchCrawlChargeMock,
  finalizeManagedSearchCrawlUsage: finalizeManagedSearchCrawlUsageMock,
}));

import { handleManagedSearxngSearch } from "./managed-web";
import {
  buildManagedExaSearchBodyFromSearxngParams,
  buildManagedSearxngSearchPayload,
  normalizeManagedWebSearchResults,
  resolveManagedWebProvider,
} from "./managed-web-shared";

describe("managed web helpers", () => {
  it("maps operations to provider ids", () => {
    expect(resolveManagedWebProvider("search")).toBe("exa-search");
    expect(resolveManagedWebProvider("fetch")).toBe("cloudflare-browser-rendering");
  });

  it("normalizes Exa payloads into managed web search results", () => {
    expect(
      normalizeManagedWebSearchResults({
        results: [
          {
            title: "OpenAI",
            url: "https://openai.com",
            highlights: ["first", "second"],
            text: "full text",
            publishedDate: "2026-04-03",
          },
          {
            title: "Missing URL",
          },
        ],
      })
    ).toEqual([
      {
        title: "OpenAI",
        url: "https://openai.com",
        description: "first\nsecond",
        content: "full text",
        publishedDate: "2026-04-03",
      },
    ]);
  });

  it("builds a default Exa request body from SearXNG query params", () => {
    expect(
      buildManagedExaSearchBodyFromSearxngParams(
        new URLSearchParams({
          q: "latest ai news",
          format: "json",
        })
      )
    ).toEqual({
      query: "latest ai news",
      numResults: 10,
      type: "auto",
      contents: {
        summary: true,
        highlights: true,
      },
    });
  });

  it("maps Exa results into SearXNG-compatible JSON", () => {
    expect(
      buildManagedSearxngSearchPayload({
        results: [
          {
            title: "OpenAI",
            url: "https://openai.com",
            summary: "summary text",
          },
          {
            title: "Fallback highlights",
            url: "https://example.com",
            highlights: ["first", "second"],
          },
        ],
      })
    ).toEqual({
      results: [
        {
          title: "OpenAI",
          url: "https://openai.com",
          content: "summary text",
        },
        {
          title: "Fallback highlights",
          url: "https://example.com",
          content: "first\nsecond",
        },
      ],
    });
  });
});

describe("handleManagedSearxngSearch", () => {
  const fetchMock = vi.fn();
  const originalManagedExaApiKey = process.env.MANAGED_EXA_API_KEY;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.MANAGED_EXA_API_KEY = "managed-exa-key";
    assessManagedSearchCrawlChargeMock.mockResolvedValue({
      id: "charge-1",
    });
    finalizeManagedSearchCrawlUsageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    if (originalManagedExaApiKey === undefined) {
      delete process.env.MANAGED_EXA_API_KEY;
    } else {
      process.env.MANAGED_EXA_API_KEY = originalManagedExaApiKey;
    }
  });

  it("returns a SearXNG-compatible response mapped from Exa", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "OpenAI",
              url: "https://openai.com",
              summary: "summary text",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const response = await handleManagedSearxngSearch(
      new NextRequest("https://example.com/search?q=openai&format=json"),
      {} as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          title: "OpenAI",
          url: "https://openai.com",
          content: "summary text",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.exa.ai/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-api-key": "managed-exa-key",
          "x-exa-integration": "openclaw",
        }),
        body: JSON.stringify({
          query: "openai",
          numResults: 10,
          type: "auto",
          contents: {
            summary: true,
            highlights: true,
          },
        }),
      })
    );
    expect(finalizeManagedSearchCrawlUsageMock).toHaveBeenCalledTimes(1);
  });

  it("keeps diagnostic upstream details when Exa fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "upstream unavailable" }), {
        status: 502,
        headers: {
          "content-type": "application/json",
        },
      })
    );

    const response = await handleManagedSearxngSearch(
      new NextRequest("https://example.com/search?q=openai&format=json"),
      {} as never
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "managed search upstream error",
      upstreamProvider: "exa-search",
      upstreamStatus: 502,
      detail: {
        error: "upstream unavailable",
      },
    });
  });
});
