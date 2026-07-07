import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import {
  bumpAgentWakeVersion,
  verifyDeployAgentAccess,
} from "@/lib/deploy/agent-jobs";
import {
  generateDeployAgentToken,
  hashDeployAgentToken,
} from "@/lib/deploy/agent-token";
import { logRunnerApiEvent } from "@/lib/deploy/runner-api-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> },
) {
  const startedAt = Date.now();
  const { sid } = await context.params;
  if (!sid) {
    logRunnerApiEvent({
      route: "runner/token/rotate",
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
      route: "runner/token/rotate",
      action: "unauthorized",
      sid,
      status: 401,
      startedAt,
      ok: false,
      error: "unauthorized",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deployAgentToken = generateDeployAgentToken();
  const deployAgentTokenHash = hashDeployAgentToken(deployAgentToken);
  const now = new Date();

  await db
    .update(installSessions)
    .set({
      deployAgentTokenHash,
    })
    .where(eq(installSessions.id, sid));

  await bumpAgentWakeVersion(sid);

  logRunnerApiEvent({
    route: "runner/token/rotate",
    action: "rotated",
    sid,
    status: 200,
    startedAt,
    ok: true,
  });
  return NextResponse.json({
    ok: true,
    sid,
    deploy_agent_token: deployAgentToken,
    rotated_at: now.toISOString(),
  });
}
