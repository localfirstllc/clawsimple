import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { deploymentAgentJobs, installSessions } from "@/lib/db/schema";
import { enqueueAgentJob } from "@/lib/deploy/agent-jobs";
import { isAgentJobInProgress } from "@/lib/deploy/agent-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: installSessions.id,
      status: installSessions.status,
      active: installSessions.active,
    })
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);
  const deployment = rows[0];
  if (!deployment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!deployment.active || deployment.status !== "completed") {
    return NextResponse.json(
      { error: "deployment_not_ready", details: "Only active completed deployments can refresh runner." },
      { status: 409 }
    );
  }

  const pendingOrRunning = await db
    .select({
      id: deploymentAgentJobs.id,
      jobType: deploymentAgentJobs.jobType,
      createdAt: deploymentAgentJobs.createdAt,
    })
    .from(deploymentAgentJobs)
    .where(
      and(
        eq(deploymentAgentJobs.sid, sid),
        inArray(deploymentAgentJobs.status, ["pending", "running"])
      )
    );
  const blockingJob = pendingOrRunning.find((job) => isAgentJobInProgress(job));
  if (blockingJob) {
    return NextResponse.json(
      {
        error: "deployment_job_in_progress",
        details: `Another job is in progress (${blockingJob.jobType}). Retry after it completes.`,
      },
      { status: 409 }
    );
  }

  const jobId = crypto.randomUUID();
  const now = await enqueueAgentJob({
    id: jobId,
    sid,
    userId: session.user.id,
    jobType: "runner_refresh",
    payload: {},
  });

  return NextResponse.json({
    ok: true,
    job: {
      id: jobId,
      type: "runner_refresh",
      status: "pending",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  });
}
