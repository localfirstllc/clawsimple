import type { NextRequest } from "next/server";

export function getManagedProxyToken(request: NextRequest) {
  const xApiKey = request.headers.get("x-api-key")?.trim();
  if (xApiKey) return xApiKey;

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)\s*$/i);
  return match?.[1]?.trim() ?? "";
}
