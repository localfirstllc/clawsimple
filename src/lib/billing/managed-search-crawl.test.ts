import { afterEach, describe, expect, it } from "vitest";
import {
  getManagedExaRequestPriceUsd,
  getManagedSearchCrawlCharge,
  getManagedSearchCrawlRequestPriceUsd,
} from "./managed-search-crawl";

describe("managed search/crawl pricing", () => {
  afterEach(() => {
    delete process.env.MANAGED_EXA_REQUEST_PRICE_USD;
    delete process.env.MANAGED_SEARCH_CRAWL_REQUEST_PRICE_USD;
  });

  it("uses defaults when env vars are absent", () => {
    expect(getManagedExaRequestPriceUsd()).toBe(0.01);
    expect(getManagedSearchCrawlRequestPriceUsd()).toBe(0.02);
  });

  it("supports env overrides", () => {
    process.env.MANAGED_EXA_REQUEST_PRICE_USD = "0.015";
    process.env.MANAGED_SEARCH_CRAWL_REQUEST_PRICE_USD = "0.03";

    expect(getManagedExaRequestPriceUsd()).toBe(0.015);
    expect(getManagedSearchCrawlRequestPriceUsd()).toBe(0.03);
  });

  it("computes how much of a request is covered by plan allowance", () => {
    expect(
      getManagedSearchCrawlCharge({
        includedCapUsd: 2,
        existingCostUsd: 1.99,
        unitPriceUsd: 0.02,
      })
    ).toEqual({
      projectedCostUsd: 2.01,
      coveredByPlanUsd: 0.01,
      creditsToChargeUsd: 0.01,
      exceedsIncludedCap: true,
    });
  });

  it("keeps creditsToCharge at zero while the request stays within the included cap", () => {
    expect(
      getManagedSearchCrawlCharge({
        includedCapUsd: 5,
        existingCostUsd: 0.5,
        unitPriceUsd: 0.02,
      })
    ).toEqual({
      projectedCostUsd: 0.52,
      coveredByPlanUsd: 0.02,
      creditsToChargeUsd: 0,
      exceedsIncludedCap: false,
    });
  });
});
