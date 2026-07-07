import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deploymentAgentJobs, deploymentAgentWake, installSessions } from "@/lib/db/schema";
import { getBearerToken, timingSafeTokenHashEqual } from "@/lib/deploy/agent-token";
import { notifyRunnerJobAvailable } from "@/lib/deploy/runner-notify";

export const DEFAULT_AGENT_JOB_TIMEOUT_MS = 60 * 60 * 1000;
const PENDING_AGENT_JOB_TIMEOUT_MS = 30 * 60 * 1000;
const AGENT_JOB_TIMEOUT_MS_BY_TYPE: Record<string, number> = {
  install_app: 4 * 60 * 60 * 1000,
  backup_export: 4 * 60 * 60 * 1000,
  backup_restore: 6 * 60 * 60 * 1000,
  openclaw_upgrade: 2 * 60 * 60 * 1000,
  hermes_upgrade: 2 * 60 * 60 * 1000,
  runner_refresh: 15 * 60 * 1000,
  telegram_profile_sync: 15 * 60 * 1000,
  add_agent: 45 * 60 * 1000,
  remove_agent: 30 * 60 * 1000,
};

export function getAgentJobTimeoutMs(jobType: string) {
  return AGENT_JOB_TIMEOUT_MS_BY_TYPE[jobType] ?? DEFAULT_AGENT_JOB_TIMEOUT_MS;
}

export function isAgentJobInProgress(job: {
  status?: string | null;
  jobType: string;
  createdAt: Date | null | undefined;
  startedAt?: Date | null | undefined;
}, now = new Date()) {
  if (job.status === "running") {
    if (!(job.startedAt instanceof Date)) return false;
    const timeoutMs = getAgentJobTimeoutMs(job.jobType);
    return now.getTime() - job.startedAt.getTime() < timeoutMs;
  }
  const timeoutMs = getAgentJobTimeoutMs(job.jobType);
  if (!(job.createdAt instanceof Date)) return false;
  if (job.status === "pending") {
    return now.getTime() - job.createdAt.getTime() < PENDING_AGENT_JOB_TIMEOUT_MS;
  }
  return now.getTime() - job.createdAt.getTime() < timeoutMs;
}

export async function getOwnedDeployment(userId: string, sid: string) {
  const rows = await db
    .select()
    .from(installSessions)
    .where(and(eq(installSessions.id, sid), eq(installSessions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function verifyDeployAgentAccess(
  sid: string,
  authorization: string | null
) {
  const token = getBearerToken(authorization);
  if (!token) return false;

  const rows = await db
    .select({ deployAgentTokenHash: installSessions.deployAgentTokenHash })
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);
  const hash = rows[0]?.deployAgentTokenHash ?? "";
  if (!hash) return false;
  return timingSafeTokenHashEqual(hash, token);
}

export async function bumpAgentWakeVersion(sid: string) {
  const now = new Date();
  const rows = await db
    .select({ version: deploymentAgentWake.version })
    .from(deploymentAgentWake)
    .where(eq(deploymentAgentWake.sid, sid))
    .limit(1);
  const nextVersion = (rows[0]?.version ?? 0) + 1;
  await db
    .insert(deploymentAgentWake)
    .values({ sid, version: nextVersion, updatedAt: now })
    .onConflictDoUpdate({
      target: deploymentAgentWake.sid,
      set: { version: nextVersion, updatedAt: now },
    });
  return nextVersion;
}

export async function getAgentWakeState(sid: string) {
  const rows = await db
    .select()
    .from(deploymentAgentWake)
    .where(eq(deploymentAgentWake.sid, sid))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPendingAgentJob(sid: string) {
  const rows = await db
    .select()
    .from(deploymentAgentJobs)
    .where(and(eq(deploymentAgentJobs.sid, sid), eq(deploymentAgentJobs.status, "pending")))
    .orderBy(asc(deploymentAgentJobs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

type ClaimedAgentJob = {
  id: string;
  sid: string;
  userId: string;
  jobType: string;
  payload: Record<string, unknown> | null;
  createdAt: Date | string;
};

export async function claimPendingAgentJob(sid: string, now = new Date()) {
  const result = await db.execute<ClaimedAgentJob>(sql`
    WITH candidate AS (
      SELECT id
      FROM deployment_agent_jobs
      WHERE sid = ${sid}
        AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE deployment_agent_jobs
    SET status = 'running',
        started_at = COALESCE(started_at, ${now}),
        updated_at = ${now},
        error_message = NULL
    WHERE id = (SELECT id FROM candidate)
    RETURNING id,
      sid,
      user_id AS "userId",
      job_type AS "jobType",
      payload,
      created_at AS "createdAt"
  `);

  return result.rows[0] ?? null;
}

export async function enqueueAgentJob(params: {
  id: string;
  sid: string;
  userId: string;
  jobType: string;
  payload?: Record<string, unknown>;
}) {
  const now = new Date();
  await db.insert(deploymentAgentJobs).values({
    id: params.id,
    sid: params.sid,
    userId: params.userId,
    jobType: params.jobType,
    payload: params.payload ?? {},
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  await bumpAgentWakeVersion(params.sid);
  await notifyRunnerJobAvailable(params.sid, params.id);
  return now;
}

export async function cleanupStaleInProgressAgentJobs(sid: string, now = new Date()) {
  const rows = await db
    .select({
      id: deploymentAgentJobs.id,
      status: deploymentAgentJobs.status,
      jobType: deploymentAgentJobs.jobType,
      createdAt: deploymentAgentJobs.createdAt,
      startedAt: deploymentAgentJobs.startedAt,
    })
    .from(deploymentAgentJobs)
    .where(
      and(
        eq(deploymentAgentJobs.sid, sid),
        inArray(deploymentAgentJobs.status, ["pending", "running"])
      )
    );

  const staleIds = rows
    .filter((row) => !isAgentJobInProgress(row, now))
    .map((row) => row.id);
  if (staleIds.length === 0) return 0;

  await db
    .update(deploymentAgentJobs)
    .set({
      status: "failed",
      errorMessage: "failed_timeout: job exceeded max in-progress duration",
      completedAt: now,
      updatedAt: now,
    })
    .where(inArray(deploymentAgentJobs.id, staleIds));
  await bumpAgentWakeVersion(sid);
  return staleIds.length;
}
