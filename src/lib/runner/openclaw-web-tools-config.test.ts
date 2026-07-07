import { describe, expect, it } from "vitest";

import {
  applyOpenClawManagedWebToolsOverrides,
  deriveOpenClawManagedWebToolsOverrides,
  isOfficialFirecrawlManagedHostAllowed,
} from "./openclaw-web-tools-config.mjs";

describe("openclaw managed web tools config", () => {
  it("recognizes the official Firecrawl hostname allowlist", () => {
    expect(isOfficialFirecrawlManagedHostAllowed("https://api.firecrawl.dev")).toBe(true);
    expect(isOfficialFirecrawlManagedHostAllowed("https://api.firecrawl.dev/v2/scrape")).toBe(
      true
    );
    expect(
      isOfficialFirecrawlManagedHostAllowed("https://uncombustive-declaredly-garland.ngrok-free.dev")
    ).toBe(false);
  });

  it("uses Exa directly for managed search and disables managed Firecrawl fetch for unsupported hosts", () => {
    expect(
      deriveOpenClawManagedWebToolsOverrides({
        exaMode: "managed",
        searchCrawlMode: "managed",
        firecrawlBaseUrl: "https://uncombustive-declaredly-garland.ngrok-free.dev",
      })
    ).toMatchObject({
      searchProvider: "exa",
      disableFirecrawlFetch: true,
      firecrawlManagedHostAllowed: false,
      firecrawlHost: "uncombustive-declaredly-garland.ngrok-free.dev",
    });
  });

  it("keeps managed Firecrawl enabled for official-host configurations", () => {
    expect(
      deriveOpenClawManagedWebToolsOverrides({
        exaMode: "managed",
        searchCrawlMode: "managed",
        firecrawlBaseUrl: "https://api.firecrawl.dev",
      })
    ).toMatchObject({
      searchProvider: "exa",
      disableFirecrawlFetch: false,
      firecrawlManagedHostAllowed: true,
      firecrawlHost: "api.firecrawl.dev",
    });
  });

  it("keeps Exa selected for BYOK search", () => {
    expect(
      deriveOpenClawManagedWebToolsOverrides({
        exaMode: "byok",
        searchCrawlMode: "managed",
        firecrawlBaseUrl: "https://api.firecrawl.dev",
      })
    ).toMatchObject({
      searchProvider: "exa",
      disableFirecrawlFetch: false,
    });
  });

  it("patches openclaw config without disturbing unrelated fields", () => {
    const config = {
      tools: {
        profile: "coding",
      },
    };

    const changed = applyOpenClawManagedWebToolsOverrides(
      config,
      deriveOpenClawManagedWebToolsOverrides({
        exaMode: "managed",
        searchCrawlMode: "managed",
        firecrawlBaseUrl: "https://example.ngrok-free.dev",
      })
    );

    expect(changed).toBe(true);
    expect(config).toEqual({
      tools: {
        profile: "coding",
        web: {
          search: {
            provider: "exa",
          },
          fetch: {
            firecrawl: {
              enabled: false,
            },
          },
        },
      },
    });
  });
});
