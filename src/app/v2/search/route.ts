import { NextRequest, NextResponse } from "next/server";
import { handleManagedWebSearch } from "@/lib/deploy/managed-web";
import { getManagedProxyToken } from "@/lib/deploy/managed-proxy-auth";
import { loadManagedProxySessionByToken } from "@/lib/deploy/managed-search-crawl-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = getManagedProxyToken(request);
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 });
  }

  // Keep managed Search & Crawl compatible with Firecrawl's fixed /v2/search
  // endpoint shape while still authorizing per deployment via the shared token.
  const session = await loadManagedProxySessionByToken(token);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return await handleManagedWebSearch(request, session);
}
