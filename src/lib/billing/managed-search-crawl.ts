function parseUsd(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(6));
}

function roundUsd(value: number) {
  return Number(value.toFixed(6));
}

export function getManagedExaRequestPriceUsd() {
  return parseUsd(process.env.MANAGED_EXA_REQUEST_PRICE_USD, 0.01);
}

export function getManagedSearchCrawlRequestPriceUsd() {
  return parseUsd(process.env.MANAGED_SEARCH_CRAWL_REQUEST_PRICE_USD, 0.02);
}

export function getManagedSearchCrawlCharge(params: {
  includedCapUsd: number | null;
  existingCostUsd: number;
  unitPriceUsd: number;
}) {
  if (params.includedCapUsd === null || params.includedCapUsd < 0) {
    return {
      projectedCostUsd: roundUsd(params.existingCostUsd + params.unitPriceUsd),
      coveredByPlanUsd: roundUsd(params.unitPriceUsd),
      creditsToChargeUsd: 0,
      exceedsIncludedCap: false,
    };
  }

  const remainingCoveredUsd = roundUsd(
    Math.max(0, params.includedCapUsd - params.existingCostUsd)
  );
  const coveredByPlanUsd = roundUsd(Math.min(params.unitPriceUsd, remainingCoveredUsd));
  const creditsToChargeUsd = roundUsd(
    Math.max(0, params.unitPriceUsd - coveredByPlanUsd)
  );
  const projectedCostUsd = roundUsd(params.existingCostUsd + params.unitPriceUsd);

  return {
    projectedCostUsd,
    coveredByPlanUsd,
    creditsToChargeUsd,
    exceedsIncludedCap: projectedCostUsd > params.includedCapUsd,
  };
}
