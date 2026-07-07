import { NextRequest, NextResponse } from "next/server";
import { verifyDeployAgentAccess } from "@/lib/deploy/agent-jobs";
import { logRunnerApiEvent } from "@/lib/deploy/runner-api-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> },
) {
  const startedAt = Date.now();
  const { sid } = await context.params;
  if (!sid) {
    logRunnerApiEvent({
      route: "runner/auth/verify",
      action: "missing_sid",
      status: 400,
      startedAt,
      ok: false,
      error: "sid_required",
    });
    return NextResponse.json(
      { ok: false, error: "sid is required" },
      { status: 400 },
    );
  }

  const ok = await verifyDeployAgentAccess(
    sid,
    request.headers.get("authorization"),
  );
  if (!ok) {
    logRunnerApiEvent({
      route: "runner/auth/verify",
      action: "unauthorized",
      sid,
      status: 401,
      startedAt,
      ok: false,
      error: "unauthorized",
    });
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  logRunnerApiEvent({
    route: "runner/auth/verify",
    action: "verified",
    sid,
    status: 200,
    startedAt,
    ok: true,
  });
  return NextResponse.json({ ok: true, sid });
}
