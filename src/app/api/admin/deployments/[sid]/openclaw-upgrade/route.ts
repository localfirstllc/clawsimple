import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { deploymentAgentJobs, installSessions } from "@/lib/db/schema";
import { enqueueAgentJob, isAgentJobInProgress } from "@/lib/deploy/agent-jobs";
import { resolveDeploymentServiceName } from "@/lib/deploy/deployment-service-name";
import { fetchLatestOpenClawVersion } from "@/lib/openclaw/releases";
import { isOpenClawVersionMatch } from "@/lib/openclaw/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readOpenClawVersion(serverFingerprint: unknown) {
  if (!serverFingerprint || typeof serverFingerprint !== "object") return null;
  const version = (serverFingerprint as { openclaw_version?: unknown }).openclaw_version;
  return typeof version === "string" ? version : null;
}

function readRunnerVersion(serverFingerprint: unknown) {
  if (!serverFingerprint || typeof serverFingerprint !== "object") return "";
  const version = (serverFingerprint as { runner_version?: unknown }).runner_version;
  return typeof version === "string" ? version.trim() : "";
}

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
      userId: installSessions.userId,
      status: installSessions.status,
      active: installSessions.active,
      serverFingerprint: installSessions.serverFingerprint,
    })
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);
  const deployment = rows[0];
  if (!deployment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!deployment.userId) {
    return NextResponse.json({ error: "deployment_user_missing" }, { status: 409 });
  }
  if (!deployment.active || deployment.status !== "completed") {
    return NextResponse.json(
      {
        error: "deployment_not_ready",
        details: "Only active completed deployments can upgrade OpenClaw.",
      },
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

  const latestVersion = await fetchLatestOpenClawVersion();
  if (isOpenClawVersionMatch(readOpenClawVersion(deployment.serverFingerprint), latestVersion)) {
    return NextResponse.json(
      {
        error: "already_latest",
        details: `OpenClaw is already on ${latestVersion}.`,
        latest_openclaw_version: latestVersion,
      },
      { status: 409 }
    );
  }
  const serviceName = resolveDeploymentServiceName(
    "clawsimple",
    deployment.serverFingerprint,
    sid
  );
  const runnerVersion = readRunnerVersion(deployment.serverFingerprint);
  const jobId = crypto.randomUUID();
  const now = await enqueueAgentJob({
    id: jobId,
    sid,
    userId: deployment.userId,
    jobType: "openclaw_upgrade",
    payload: {
      service_name: serviceName,
      version: latestVersion,
      ...(runnerVersion ? { runner_version: runnerVersion } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    latest_openclaw_version: latestVersion,
    job: {
      id: jobId,
      type: "openclaw_upgrade",
      status: "pending",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  });
}
