import crypto from "crypto";

/**
 * Timing-safe hex comparison. Validates hex format and equal length
 * before calling crypto.timingSafeEqual to avoid throwing on mismatch.
 */
function safeTimingEqualHex(signature: string, expectedHex: string) {
  if (!/^[a-f0-9]+$/i.test(signature)) return false;
  if (signature.length !== expectedHex.length) return false;

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expectedHex, "hex");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Generate a secure completion token for a deployment session.
 * Token format: {sid}:{timestamp}:{hmac_signature}
 */
export function generateCompletionToken(sid: string): string {
  const secret = process.env.COMPLETION_TOKEN_SECRET;
  if (!secret) {
    throw new Error("COMPLETION_TOKEN_SECRET not configured");
  }

  const payload = `${sid}:${Date.now()}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const signature = hmac.digest("hex");

  return `${payload}:${signature}`;
}

/**
 * Verify a completion token for a deployment session.
 * Checks signature validity, SID match, and timestamp (24h expiry).
 */
export function verifyCompletionToken(
  token: string,
  sid: string,
  secret: string,
): boolean {
  const parts = token.split(":");
  if (parts.length !== 3) return false;

  const [tokenSid, timestamp, signature] = parts;

  // Verify SID matches
  if (tokenSid !== sid) return false;

  // Verify timestamp is valid and not expired (24 hours)
  const tokenTime = parseInt(timestamp, 10);
  if (Number.isNaN(tokenTime)) return false;

  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (now - tokenTime > maxAge || tokenTime > now) return false;

  // Verify HMAC signature
  const payload = `${tokenSid}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSig = hmac.digest("hex");

  // Timing-safe comparison to prevent timing attacks
  return safeTimingEqualHex(signature, expectedSig);
}

/**
 * Generate a token used by deployed servers to call the ClawSimple preset proxy.
 * Token format: {sid}:{hmac_signature}
 *
 * Unlike completion tokens, this token is intended to live for a long time and does not expire
 * by timestamp. Rotate the secret to invalidate old tokens.
 */
export function generatePresetProxyToken(sid: string): string {
  const secret =
    process.env.DEPLOY_PRESET_PROXY_TOKEN_SECRET ??
    process.env.COMPLETION_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "DEPLOY_PRESET_PROXY_TOKEN_SECRET (or COMPLETION_TOKEN_SECRET) not configured",
    );
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(sid);
  const signature = hmac.digest("hex");
  return `${sid}:${signature}`;
}

export function verifyPresetProxyToken(
  token: string,
  sid: string,
  secret: string,
): boolean {
  const parts = token.split(":");
  if (parts.length !== 2) return false;

  const [tokenSid, signature] = parts;
  if (tokenSid !== sid) return false;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(sid);
  const expectedSig = hmac.digest("hex");

  return safeTimingEqualHex(signature, expectedSig);
}

/**
 * Generate a short-lived HMAC token for the /api/install/events endpoint.
 * Token = sid:hmac(COMPLETION_TOKEN_SECRET, sid)
 * Passed to the VM via cloud-init as INSTALL_EVENT_TOKEN.
 */
export function generateInstallEventToken(sid: string): string {
  const secret = process.env.COMPLETION_TOKEN_SECRET;
  if (!secret) {
    throw new Error("COMPLETION_TOKEN_SECRET not configured");
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(sid);
  const signature = hmac.digest("hex");
  return `${sid}:${signature}`;
}

/**
 * Verify an install event token, returning the validated SID or null.
 */
export function verifyInstallEventToken(token: string): string | null {
  const parts = token.split(":");
  if (parts.length !== 2) return null;

  const [sid, signature] = parts;
  if (!sid) return null;

  const secret = process.env.COMPLETION_TOKEN_SECRET;
  if (!secret) {
    return null;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(sid);
  const expectedSig = hmac.digest("hex");

  if (!safeTimingEqualHex(signature, expectedSig)) return null;
  return sid;
}
