import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  deploymentAgentJobSecrets,
  deploymentBackups,
  installSessions,
} from "@/lib/db/schema";
import { enqueueAgentJob } from "@/lib/deploy/agent-jobs";
import { sealJobSecret } from "@/lib/backup/job-secrets";
import { getOrCreateBackupPassword } from "@/lib/backup/password-store";
import { getRequestSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const backupId = crypto.randomUUID();
  const now = new Date();
  const objectKey = `backups/${session.user.id}/${sid}/${backupId}.tar.gz.enc`;

  const sessionRows = await db
    .select({
      id: installSessions.id,
      createdAt: installSessions.createdAt,
      serverFingerprint: installSessions.serverFingerprint,
      seatId: installSessions.seatId,
    })
    .from(installSessions)
    .where(
      and(
        eq(installSessions.id, sid),
        eq(installSessions.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!sessionRows[0]) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const sessionRow = sessionRows[0];
  const fingerprint =
    sessionRow.serverFingerprint &&
    typeof sessionRow.serverFingerprint === "object"
      ? sessionRow.serverFingerprint
      : {};
  const runnerCapabilities = Array.isArray(fingerprint.runner_capabilities)
    ? fingerprint.runner_capabilities.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const supportsBackupExport = runnerCapabilities.includes("backup_export");
  if (!supportsBackupExport) {
    const ageMs = Date.now() - sessionRow.createdAt.getTime();
    const isFreshInstall = ageMs < 15 * 60 * 1000;
    const details = isFreshInstall
      ? "Agent runner heartbeat not ready yet. Please retry in about 1 minute."
      : "Current agent runner does not support encrypted backup yet. Please contact support to refresh the runner, then retry.";
    return NextResponse.json(
      {
        error: "backup_runner_incompatible",
        details,
      },
      { status: 409 },
    );
  }

  let sealedPassword = "";
  try {
    const password = await getOrCreateBackupPassword({
      userId: session.user.id,
      sid,
      seatId: sessionRow.seatId,
    });
    sealedPassword = sealJobSecret(password);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    return NextResponse.json(
      { error: "backup_secret_setup_failed", details: message },
      { status: 500 },
    );
  }

  await db.insert(deploymentBackups).values({
    id: backupId,
    userId: session.user.id,
    sourceSid: sid,
    status: "pending",
    objectKey,
    createdAt: now,
    updatedAt: now,
  });

  const jobId = crypto.randomUUID();
  await enqueueAgentJob({
    id: jobId,
    sid,
    userId: session.user.id,
    jobType: "backup_export",
    payload: { backup_id: backupId },
  });

  // Store the password wrapped-at-rest. Runner will fetch it once via /secret.
  await db.insert(deploymentAgentJobSecrets).values({
    jobId,
    kind: "backup_password",
    ciphertext: sealedPassword,
    createdAt: now,
  });

  return NextResponse.json({
    backup_id: backupId,
    job_id: jobId,
    status: "pending",
  });
}
