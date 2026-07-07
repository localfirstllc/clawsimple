function parseRedeployNumber(rawValue: string | undefined, fallback: number) {
  const parsed = Number(rawValue ?? fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getRedeployLimit() {
  return parseRedeployNumber(process.env.REDEPLOY_LIMIT, 10);
}

export function getRedeployWindowDays() {
  return parseRedeployNumber(process.env.REDEPLOY_WINDOW_DAYS, 30);
}
