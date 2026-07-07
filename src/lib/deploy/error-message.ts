export function toUserFriendlyDeployError(
  input: string | null | undefined,
): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const normalized = raw.toUpperCase();

  // Generic health-check failure in our backend. Most frequent root cause
  // observed in production is Telegram long-poll conflict (409).
  if (normalized === "E_HEALTH") {
    return "Deployment health check did not pass in time. This can be temporary; if your bot works, you can ignore this message.";
  }

  if (normalized.includes("GETUPDATES") && normalized.includes("CONFLICT")) {
    return "Telegram reports this bot token is already used elsewhere. Stop the other bot instance or use a new token.";
  }

  if (normalized === "E_INSTALL") {
    return "Server setup did not complete. Please contact support if the bot does not recover soon.";
  }

  if (normalized === "E_CONFIG") {
    return "Deployment configuration is incomplete. Please check token and settings, then contact support if it still fails.";
  }

  return raw;
}
