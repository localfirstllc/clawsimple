import { NextRequest, NextResponse } from "next/server";

export function requireCronSecret(request: NextRequest) {
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) {
    console.error("[cron] CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-cron-secret");
  if (provided !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
