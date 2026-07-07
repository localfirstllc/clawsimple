import { NextRequest, NextResponse } from "next/server";
import { verifyDeployAgentAccess } from "@/lib/deploy/agent-jobs";
import { logRunnerApiEvent } from "@/lib/deploy/runner-api-log";
import {
  getRunnerRevision,
  getRunnerScriptSource,
  getRunnerVersion,
} from "@/lib/deploy/runner-script-source";

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
      route: "runner/script",
      action: "missing_sid",
      status: 400,
      startedAt,
      ok: false,
      error: "sid_required",
    });
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const ok = await verifyDeployAgentAccess(
    sid,
    request.headers.get("authorization"),
  );
  if (!ok) {
    logRunnerApiEvent({
      route: "runner/script",
      action: "unauthorized",
      sid,
      status: 401,
      startedAt,
      ok: false,
      error: "unauthorized",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const script = await getRunnerScriptSource();
  const runnerVersion = getRunnerVersion(script);
  const runnerRevision = getRunnerRevision(script);

  logRunnerApiEvent({
    route: "runner/script",
    action: "served",
    sid,
    status: 200,
    startedAt,
    ok: true,
  });
  return NextResponse.json({
    runner_revision: runnerRevision,
    runner_label: runnerVersion || "unknown",
    runner_version: runnerVersion || "unknown",
    script,
  });
}
