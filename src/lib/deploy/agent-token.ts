import crypto from "crypto";

export function generateDeployAgentToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashDeployAgentToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function timingSafeTokenHashEqual(
  expectedHash: string,
  token: string
) {
  const actualHash = hashDeployAgentToken(token);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function getBearerToken(value: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return "";
  return trimmed.slice(7).trim();
}
