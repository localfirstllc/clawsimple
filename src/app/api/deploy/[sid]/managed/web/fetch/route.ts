import { NextRequest } from "next/server";
import { handleManagedWebFetch } from "@/lib/deploy/managed-web";
import { loadManagedSessionForRoute } from "@/lib/deploy/managed-web-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;
  const session = await loadManagedSessionForRoute(request, sid);
  if (session instanceof Response) return session;
  return await handleManagedWebFetch(request, session);
}
