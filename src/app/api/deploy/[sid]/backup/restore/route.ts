import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deploymentBackups, installSessions, deploymentAgentJobSecrets } from "@/lib/db/schema";
import { enqueueAgentJob } from "@/lib/deploy/agent-jobs";
import { sealJobSecret } from "@/lib/backup/job-secrets";
import { getOrCreateBackupPassword } from "@/lib/backup/password-store";
import { getRequestSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  backup_id?: string;
  restore_env_mode?: string;
};

const ALLOWED_RESTORE_ENV_MODES = new Set(["merge", "restore", "skip"]);
const DEFAULT_RESTORE_ENV_MODE = "merge";

function normalizeRestoreEnvMode(value: unknown) {
  const mode = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (ALLOWED_RESTORE_ENV_MODES.has(mode)) return mode;
  return DEFAULT_RESTORE_ENV_MODE;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  let body: Body | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const backupId = (body?.backup_id ?? "").trim();
  const restoreEnvMode = normalizeRestoreEnvMode(body?.restore_env_mode);
  if (!backupId) {
    return NextResponse.json({ error: "backup_id is required" }, { status: 400 });
  }

  // Ensure the target deployment belongs to the current user.
  const sessionRows = await db
    .select({ userId: installSessions.userId })
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);
  if (!sessionRows[0] || sessionRows[0].userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Ensure the backup belongs to the current user and is ready.
  const backupRows = await db
    .select()
    .from(deploymentBackups)
    .where(and(eq(deploymentBackups.id, backupId), eq(deploymentBackups.userId, session.user.id)))
    .limit(1);
  const backup = backupRows[0];
  if (!backup) {
    return NextResponse.json({ error: "backup_not_found" }, { status: 404 });
  }
  if (backup.status !== "ready") {
    return NextResponse.json({ error: "backup_not_ready" }, { status: 409 });
  }

  const sourceRows = await db
    .select({ seatId: installSessions.seatId })
    .from(installSessions)
    .where(eq(installSessions.id, backup.sourceSid))
    .limit(1);

  let sealedPassword = "";
  try {
    const password = await getOrCreateBackupPassword({
      userId: session.user.id,
      sid: backup.sourceSid,
      seatId: sourceRows[0]?.seatId,
    });
    sealedPassword = sealJobSecret(password);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return NextResponse.json({ error: "backup_secret_setup_failed", details: message }, { status: 500 });
  }

  const jobId = crypto.randomUUID();
  const now = new Date();
  await enqueueAgentJob({
    id: jobId,
    sid,
    userId: session.user.id,
    jobType: "backup_restore",
    payload: {
      backup_id: backupId,
      restore_env_mode: restoreEnvMode,
    },
  });
  await db.insert(deploymentAgentJobSecrets).values({
    jobId,
    kind: "backup_password",
    ciphertext: sealedPassword,
    createdAt: now,
  });

  return NextResponse.json({ ok: true, job_id: jobId, restore_env_mode: restoreEnvMode });
}
