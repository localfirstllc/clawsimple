import { NextRequest, NextResponse } from "next/server";
import {
  claimPendingAgentJob,
  cleanupStaleInProgressAgentJobs,
  verifyDeployAgentAccess,
} from "@/lib/deploy/agent-jobs";
import { logRunnerApiEvent } from "@/lib/deploy/runner-api-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIsoString(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> },
) {
  const startedAt = Date.now();
  const { sid } = await context.params;
  if (!sid) {
    logRunnerApiEvent({
      route: "runner/jobs/claim",
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
      route: "runner/jobs/claim",
      action: "unauthorized",
      sid,
      status: 401,
      startedAt,
      ok: false,
      error: "unauthorized",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const staleJobs = await cleanupStaleInProgressAgentJobs(sid);
  const job = await claimPendingAgentJob(sid);
  if (!job) {
    logRunnerApiEvent({
      route: "runner/jobs/claim",
      action: "no_job",
      sid,
      status: 200,
      startedAt,
      ok: true,
      staleJobs,
    });
    return NextResponse.json({
      job: null,
      next_claim_after_ms: 30 * 60 * 1000,
    });
  }

  logRunnerApiEvent({
    route: "runner/jobs/claim",
    action: "claimed",
    sid,
    jobId: job.id,
    jobType: job.jobType,
    status: 200,
    startedAt,
    ok: true,
    staleJobs,
  });
  return NextResponse.json({
    job: {
      id: job.id,
      type: job.jobType,
      payload: (job.payload ?? {}) as Record<string, unknown>,
      created_at: toIsoString(job.createdAt),
    },
    next_claim_after_ms: 0,
  });
}
