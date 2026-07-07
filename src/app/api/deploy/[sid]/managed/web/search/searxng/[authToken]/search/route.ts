import { NextRequest } from "next/server";
import { handleManagedSearxngSearch } from "@/lib/deploy/managed-web";
import { loadManagedSessionForRoute } from "@/lib/deploy/managed-web-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sid: string; authToken: string }> }
) {
  const { sid, authToken } = await context.params;
  const session = await loadManagedSessionForRoute(request, sid, {
    fallbackToken: authToken,
  });
  if (session instanceof Response) return session;
  return await handleManagedSearxngSearch(request, session);
}
