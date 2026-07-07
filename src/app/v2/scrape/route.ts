import { NextRequest, NextResponse } from "next/server";
import { handleManagedWebFetch } from "@/lib/deploy/managed-web";
import { getManagedProxyToken } from "@/lib/deploy/managed-proxy-auth";
import { loadManagedProxySessionByToken } from "@/lib/deploy/managed-search-crawl-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = getManagedProxyToken(request);
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 });
  }

  // OpenClaw rewrites any configured Firecrawl base URL to /v2/*, so managed
  // Firecrawl compatibility has to terminate at a root-level /v2 route and
  // recover the deployment from the bearer token.
  const session = await loadManagedProxySessionByToken(token);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return await handleManagedWebFetch(request, session);
}
