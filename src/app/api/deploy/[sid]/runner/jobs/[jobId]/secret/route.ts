import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { openJobSecret } from "@/lib/backup/job-secrets";
import { db } from "@/lib/db";
import { deploymentAgentJobSecrets } from "@/lib/db/schema";
import { verifyDeployAgentAccess } from "@/lib/deploy/agent-jobs";
import { logRunnerApiEvent } from "@/lib/deploy/runner-api-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sid: string; jobId: string }> },
) {
  const startedAt = Date.now();
  const { sid, jobId } = await context.params;
  if (!sid || !jobId) {
    logRunnerApiEvent({
      route: "runner/jobs/secret",
      action: "missing_params",
      sid,
      jobId,
      status: 400,
      startedAt,
      ok: false,
      error: "sid_or_job_id_required",
    });
    return NextResponse.json(
      { error: "sid and jobId are required" },
      { status: 400 },
    );
  }

  const ok = await verifyDeployAgentAccess(
    sid,
    request.headers.get("authorization"),
  );
  if (!ok) {
    logRunnerApiEvent({
      route: "runner/jobs/secret",
      action: "unauthorized",
      sid,
      jobId,
      status: 401,
      startedAt,
      ok: false,
      error: "unauthorized",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(deploymentAgentJobSecrets)
    .where(eq(deploymentAgentJobSecrets.jobId, jobId))
    .limit(1);
  const secret = rows[0];
  if (!secret) {
    logRunnerApiEvent({
      route: "runner/jobs/secret",
      action: "not_found",
      sid,
      jobId,
      status: 404,
      startedAt,
      ok: false,
      error: "secret_not_found",
    });
    return NextResponse.json({ error: "secret_not_found" }, { status: 404 });
  }

  try {
    const value = openJobSecret(secret.ciphertext);

    // One-time read to minimize exposure.
    await db
      .delete(deploymentAgentJobSecrets)
      .where(eq(deploymentAgentJobSecrets.jobId, jobId));

    logRunnerApiEvent({
      route: "runner/jobs/secret",
      action: "served",
      sid,
      jobId,
      status: 200,
      startedAt,
      ok: true,
    });
    return NextResponse.json({
      kind: secret.kind,
      value,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    logRunnerApiEvent({
      route: "runner/jobs/secret",
      action: "decrypt_failed",
      sid,
      jobId,
      status: 500,
      startedAt,
      ok: false,
      error: "secret_decrypt_failed",
    });
    return NextResponse.json(
      { error: "secret_decrypt_failed", details: message },
      { status: 500 },
    );
  }
}
