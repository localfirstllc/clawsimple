import { BlockList, isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { verifyDeployAgentAccess } from "./agent-jobs";
import { getManagedProxyToken } from "./managed-proxy-auth";
import {
  loadManagedProxySession,
  type ManagedProxySession,
} from "./managed-search-crawl-proxy";

function getClientIp(request: NextRequest) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "";
}

function isRequestFromDeploymentIp(request: NextRequest, session: ManagedProxySession) {
  const clientIp = getClientIp(request);
  if (!clientIp) return false;

  const allowedIps = [
    typeof session.serverFingerprint?.server_ipv4 === "string"
      ? session.serverFingerprint.server_ipv4.trim()
      : "",
    typeof session.serverFingerprint?.server_ipv6 === "string"
      ? session.serverFingerprint.server_ipv6.trim()
      : "",
  ].filter(Boolean);

  return allowedIps.some((allowedIp) => matchesAllowedIp(clientIp, allowedIp));
}

function matchesAllowedIp(clientIp: string, allowedIp: string) {
  if (!clientIp || !allowedIp) return false;
  if (clientIp === allowedIp) return true;

  const slashIndex = allowedIp.indexOf("/");
  if (slashIndex === -1) return false;

  const network = allowedIp.slice(0, slashIndex).trim();
  const prefix = Number.parseInt(allowedIp.slice(slashIndex + 1).trim(), 10);
  const type = isIP(clientIp);
  if (!network || !Number.isInteger(prefix) || type === 0) return false;

  const list = new BlockList();
  try {
    list.addSubnet(network, prefix, type === 4 ? "ipv4" : "ipv6");
    return list.check(clientIp, type === 4 ? "ipv4" : "ipv6");
  } catch {
    return false;
  }
}

export async function loadManagedSessionForRoute(
  request: NextRequest,
  sid: string,
  options?: { fallbackToken?: string }
): Promise<Response | ManagedProxySession> {
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const session = await loadManagedProxySession(sid);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const token =
    getManagedProxyToken(request) ||
    (typeof options?.fallbackToken === "string" ? options.fallbackToken.trim() : "");

  // IP-only fallback is gated behind an opt-in env var. It is off by default
  // because serverFingerprint.server_ipv* can be poisoned by an unauthenticated
  // /api/install/events if auth is not enforced there.
  const allowIpFallback = process.env.ENABLE_MANAGED_IP_FALLBACK === "1";
  if (!token && allowIpFallback && isRequestFromDeploymentIp(request, session)) {
    return session;
  }

  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 });
  }

  const authorized = await verifyDeployAgentAccess(sid, `Bearer ${token}`);
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return session;
}
