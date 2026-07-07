import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deploymentAgents, installSessions } from "@/lib/db/schema";
import { enqueueAgentJob } from "@/lib/deploy/agent-jobs";
import { getRequestSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function createJobId() {
  return `agentjob_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureOwnedDeployment(userId: string, sid: string) {
  const rows = await db
    .select({ id: installSessions.id })
    .from(installSessions)
    .where(and(eq(installSessions.id, sid), eq(installSessions.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function resolveServiceName(userId: string, sid: string) {
  const rows = await db
    .select({
      serverFingerprint: installSessions.serverFingerprint,
    })
    .from(installSessions)
    .where(and(eq(installSessions.id, sid), eq(installSessions.userId, userId)))
    .limit(1);
  void rows;
  void sid;
  return "clawsimple";
}

export async function PATCH() {
  return NextResponse.json(
    { error: "display_name is managed by Telegram profile sync" },
    { status: 403 }
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sid: string; agentId: string }> }
) {
  const { sid, agentId } = await context.params;
  const normalizedAgentId = (agentId ?? "").trim();
  if (!sid || !AGENT_ID_PATTERN.test(normalizedAgentId)) {
    return NextResponse.json({ error: "invalid sid or agentId" }, { status: 400 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owned = await ensureOwnedDeployment(session.user.id, sid);
  if (!owned) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      sid: deploymentAgents.sid,
      agentId: deploymentAgents.agentId,
      accountId: deploymentAgents.accountId,
      isPrimary: deploymentAgents.isPrimary,
    })
    .from(deploymentAgents)
    .where(
      and(
        eq(deploymentAgents.sid, sid),
        eq(deploymentAgents.agentId, normalizedAgentId)
      )
    )
    .limit(1);
  const row = rows[0];
  if ((row && row.isPrimary) || normalizedAgentId === "main") {
    return NextResponse.json({ error: "primary agent cannot be removed" }, { status: 400 });
  }
  const serviceName = await resolveServiceName(session.user.id, sid);

  const jobId = createJobId();
  const now = await enqueueAgentJob({
    id: jobId,
    sid,
    userId: session.user.id,
    jobType: "remove_agent",
      payload: {
        agent_id: normalizedAgentId,
        account_id: row?.accountId?.trim() || normalizedAgentId,
        service_name: serviceName,
      },
  });

  return NextResponse.json({
    ok: true,
    job: {
      id: jobId,
      type: "remove_agent",
      status: "pending",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      payload: {
        agent_id: normalizedAgentId,
      },
    },
  });
}
