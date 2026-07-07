import { NextRequest, NextResponse } from "next/server";
import {
  createInstallSession,
  normalizeLocale,
} from "@/lib/install/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { locale?: string; channel?: string } | null = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const locale = normalizeLocale(body?.locale);
  const channel = typeof body?.channel === "string" ? body.channel.trim() : "";

  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const { sid, lastError } = await createInstallSession({ locale, channel });

  if (!sid) {
    return NextResponse.json(
      { error: "failed to create session", details: String(lastError ?? "") },
      { status: 500 }
    );
  }

  const origin = request.nextUrl.origin;
  const installUrl = new URL("/api/install", origin);
  installUrl.searchParams.set("sid", sid);
  installUrl.searchParams.set("lang", locale);

  return NextResponse.json({
    sid,
    install_command: `curl -fsSL "${installUrl.toString()}" | bash`,
  });
}
