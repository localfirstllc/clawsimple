import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { getBypassSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const handler = toNextJsHandler(auth);

export async function GET(request: NextRequest) {
  if (request.nextUrl.pathname.endsWith("/get-session")) {
    const bypass = await getBypassSession(request.headers);
    if (bypass) {
      return NextResponse.json(bypass, { status: 200 });
    }
  }
  return handler.GET(request);
}

export const { POST, PUT, PATCH, DELETE } = handler;
