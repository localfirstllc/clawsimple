import crypto from "node:crypto";
import { and, inArray } from "drizzle-orm";
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

type BatchBody = {
  sids?: unknown;
};

const MAX_BATCH = 200;

function readOpenClawVersion(serverFingerprint: unknown) {
  if (!serverFingerprint || typeof serverFingerprint !== "object") return null;
  const version = (serverFingerprint as { openclaw_version?: unknown }).openclaw_version;
  return typeof version === "string" ? version : null;
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: BatchBody | null = null;
  try {
    body = (await request.json()) as BatchBody;
  } catch {
    body = null;
  }

  const rawSids = Array.isArray(body?.sids) ? body.sids : [];
  const sids = Array.from(
    new Set(
      rawSids
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0)
    )
  );

  if (sids.length === 0) {
    return NextResponse.json({ error: "sids is required" }, { status: 400 });
  }
  if (sids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: "too_many_sids", details: `Maximum ${MAX_BATCH} sids per request.` },
      { status: 400 }
    );
  }

  const latestVersion = await fetchLatestOpenClawVersion();
  const deployments = await db
    .select({
      id: installSessions.id,
      userId: installSessions.userId,
      status: installSessions.status,
      active: installSessions.active,
      serverFingerprint: installSessions.serverFingerprint,
    })
    .from(installSessions)
    .where(inArray(installSessions.id, sids));
  const deploymentBySid = new Map(deployments.map((item) => [item.id, item]));

  const pendingJobs = await db
    .select({
      sid: deploymentAgentJobs.sid,
      jobType: deploymentAgentJobs.jobType,
      createdAt: deploymentAgentJobs.createdAt,
    })
    .from(deploymentAgentJobs)
    .where(
      and(
        inArray(deploymentAgentJobs.sid, sids),
        inArray(deploymentAgentJobs.status, ["pending", "running"])
      )
    );
  const pendingBySid = new Map<string, string>();
  for (const row of pendingJobs) {
    if (!isAgentJobInProgress(row)) continue;
    if (!pendingBySid.has(row.sid)) {
      pendingBySid.set(row.sid, row.jobType);
    }
  }

  const results: Array<{
    sid: string;
    status:
      | "enqueued"
      | "not_found"
      | "not_ready"
      | "job_in_progress";
    job_id?: string;
    details?: string;
  }> = [];

  let enqueued = 0;
  for (const sid of sids) {
    const deployment = deploymentBySid.get(sid);
    if (!deployment) {
      results.push({ sid, status: "not_found" });
      continue;
    }
    if (!deployment.userId) {
      results.push({
        sid,
        status: "not_ready",
        details: "Deployment owner is missing.",
      });
      continue;
    }
    if (!deployment.active || deployment.status !== "completed") {
      results.push({
        sid,
        status: "not_ready",
        details: "Only active completed deployments can upgrade OpenClaw.",
      });
      continue;
    }
    if (
      isOpenClawVersionMatch(
        readOpenClawVersion(deployment.serverFingerprint),
        latestVersion
      )
    ) {
      results.push({
        sid,
        status: "not_ready",
        details: `OpenClaw is already on ${latestVersion}.`,
      });
      continue;
    }

    const pendingType = pendingBySid.get(sid);
    if (pendingType) {
      results.push({
        sid,
        status: "job_in_progress",
        details: `Another job is in progress (${pendingType}).`,
      });
      continue;
    }

    const serviceName = resolveDeploymentServiceName(
      "clawsimple",
      deployment.serverFingerprint,
      sid
    );
    const jobId = crypto.randomUUID();
    await enqueueAgentJob({
      id: jobId,
      sid,
      userId: deployment.userId,
      jobType: "openclaw_upgrade",
      payload: {
        service_name: serviceName,
        version: latestVersion,
      },
    });
    results.push({ sid, status: "enqueued", job_id: jobId });
    enqueued += 1;
  }

  return NextResponse.json({
    ok: true,
    latest_openclaw_version: latestVersion,
    total: sids.length,
    enqueued,
    skipped: sids.length - enqueued,
    results,
  });
}
