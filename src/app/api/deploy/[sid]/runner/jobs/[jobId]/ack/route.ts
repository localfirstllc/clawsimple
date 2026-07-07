import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  deploymentAgents,
  deploymentAgentJobs,
  deploymentBackups,
  installSessions,
} from "@/lib/db/schema";
import {
  bumpAgentWakeVersion,
  verifyDeployAgentAccess,
} from "@/lib/deploy/agent-jobs";
import { logRunnerApiEvent } from "@/lib/deploy/runner-api-log";
import {
  buildPrimarySessionUpdates,
  getPersistedAgentTokenCiphertext,
  isPrimaryAgentId,
} from "@/lib/deploy/primary-agent-storage";
import { sealSessionSecret } from "@/lib/deploy/session-secrets";
import { releaseTelegramBotTokenAssignments } from "@/lib/deploy/telegram-token-assignments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AckBody = {
  status?: "running" | "succeeded" | "failed";
  error_message?: string;
  result?: Record<string, unknown>;
};

async function mergeAgentRuntimeUpdate(
  sid: string,
  agentId: string,
  nextFields: Record<string, unknown>,
) {
  if (!agentId) return;
  const sessionRows = await db
    .select({ serverFingerprint: installSessions.serverFingerprint })
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);
  const currentFingerprint =
    sessionRows[0]?.serverFingerprint &&
    typeof sessionRows[0].serverFingerprint === "object"
      ? (sessionRows[0].serverFingerprint as Record<string, unknown>)
      : {};
  const currentAgentRuntimes =
    currentFingerprint.agent_runtimes &&
    typeof currentFingerprint.agent_runtimes === "object" &&
    !Array.isArray(currentFingerprint.agent_runtimes)
      ? (currentFingerprint.agent_runtimes as Record<string, unknown>)
      : {};
  const currentAgentRuntime =
    currentAgentRuntimes[agentId] &&
    typeof currentAgentRuntimes[agentId] === "object" &&
    !Array.isArray(currentAgentRuntimes[agentId])
      ? (currentAgentRuntimes[agentId] as Record<string, unknown>)
      : {};
  await db
    .update(installSessions)
    .set({
      serverFingerprint: {
        ...currentFingerprint,
        agent_runtimes: {
          ...currentAgentRuntimes,
          [agentId]: {
            ...currentAgentRuntime,
            ...nextFields,
          },
        },
      } as typeof installSessions.$inferInsert.serverFingerprint,
    })
    .where(eq(installSessions.id, sid));
}

function pickTelegramProfile(result: Record<string, unknown> | null) {
  if (!result) return { displayName: "", username: null as string | null };
  const firstName =
    typeof result.first_name === "string" ? result.first_name.trim() : "";
  const usernameRaw =
    typeof result.username === "string" ? result.username.trim() : "";
  const username = usernameRaw
    ? usernameRaw.startsWith("@")
      ? usernameRaw.slice(1)
      : usernameRaw
    : null;
  if (firstName) return { displayName: firstName, username };
  if (!usernameRaw) return { displayName: "", username: null };
  return {
    displayName: usernameRaw.startsWith("@") ? usernameRaw : `@${usernameRaw}`,
    username,
  };
}

async function resolveTelegramDisplayNameFromToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return { displayName: "", username: null as string | null };
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(
      `https://api.telegram.org/bot${trimmed}/getMe`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) return { displayName: "", username: null };
    const data = (await response.json()) as {
      ok?: boolean;
      result?: Record<string, unknown>;
    };
    if (!data?.ok || !data.result || typeof data.result !== "object") {
      return { displayName: "", username: null };
    }
    return pickTelegramProfile(data.result);
  } catch {
    return { displayName: "", username: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string; jobId: string }> },
) {
  const startedAt = Date.now();
  const { sid, jobId } = await context.params;
  if (!sid || !jobId) {
    logRunnerApiEvent({
      route: "runner/jobs/ack",
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
      route: "runner/jobs/ack",
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

  let body: AckBody | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const status = body?.status;
  if (!status || !["running", "succeeded", "failed"].includes(status)) {
    logRunnerApiEvent({
      route: "runner/jobs/ack",
      action: "invalid_status",
      sid,
      jobId,
      status: 400,
      startedAt,
      ok: false,
      error: "invalid_status",
    });
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(deploymentAgentJobs)
    .where(
      and(eq(deploymentAgentJobs.id, jobId), eq(deploymentAgentJobs.sid, sid)),
    )
    .limit(1);
  const job = rows[0];
  if (!job) {
    logRunnerApiEvent({
      route: "runner/jobs/ack",
      action: "job_not_found",
      sid,
      jobId,
      status: 404,
      startedAt,
      ok: false,
      error: "job_not_found",
    });
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const now = new Date();
  if (status === "running") {
    await db
      .update(deploymentAgentJobs)
      .set({
        status: "running",
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(deploymentAgentJobs.id, job.id));
    await bumpAgentWakeVersion(sid);
    logRunnerApiEvent({
      route: "runner/jobs/ack",
      action: "running",
      sid,
      jobId,
      jobType: job.jobType,
      status: 200,
      startedAt,
      ok: true,
    });
    return NextResponse.json({ ok: true });
  }

  if (status === "failed") {
    const jobPayload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as Record<string, unknown>)
        : {};
    const backupId =
      typeof jobPayload.backup_id === "string"
        ? jobPayload.backup_id.trim()
        : "";

    await db
      .update(deploymentAgentJobs)
      .set({
        status: "failed",
        errorMessage: (body?.error_message ?? "").slice(0, 1000),
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(deploymentAgentJobs.id, job.id));
    if (job.jobType === "backup_export" && backupId) {
      await db
        .update(deploymentBackups)
        .set({
          status: "failed",
          errorMessage: (body?.error_message ?? "backup job failed").slice(
            0,
            1000,
          ),
          updatedAt: now,
        })
        .where(eq(deploymentBackups.id, backupId));
    }
    if (job.jobType === "add_agent") {
      const agentId =
        typeof jobPayload.agent_id === "string"
          ? jobPayload.agent_id.trim()
          : "";
      if (agentId) {
        await releaseTelegramBotTokenAssignments({ sid, agentId });
      }
    }
    if (job.jobType === "install_app") {
      const targetSid =
        typeof jobPayload.install_sid === "string" &&
        jobPayload.install_sid.trim()
          ? jobPayload.install_sid.trim()
          : sid;
      await releaseTelegramBotTokenAssignments({ sid: targetSid });
    }
    await bumpAgentWakeVersion(sid);
    logRunnerApiEvent({
      route: "runner/jobs/ack",
      action: "failed",
      sid,
      jobId,
      jobType: job.jobType,
      status: 200,
      startedAt,
      ok: true,
    });
    return NextResponse.json({ ok: true });
  }

  await db
    .update(deploymentAgentJobs)
    .set({
      status: "succeeded",
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(deploymentAgentJobs.id, job.id));
  if (job.jobType === "runner_refresh") {
    const payloadResult = body?.result;
    const runnerRevision =
      payloadResult &&
      typeof payloadResult === "object" &&
      typeof payloadResult.runner_revision === "string"
        ? payloadResult.runner_revision.trim()
        : "";
    const runnerLabel =
      payloadResult &&
      typeof payloadResult === "object" &&
      typeof payloadResult.runner_label === "string"
        ? payloadResult.runner_label.trim()
        : "";
    const runnerVersion =
      payloadResult &&
      typeof payloadResult === "object" &&
      typeof payloadResult.runner_version === "string"
        ? payloadResult.runner_version.trim()
        : "";
    if (runnerRevision || runnerLabel || runnerVersion) {
      const sessionRows = await db
        .select({ serverFingerprint: installSessions.serverFingerprint })
        .from(installSessions)
        .where(eq(installSessions.id, sid))
        .limit(1);
      const currentFingerprint =
        sessionRows[0]?.serverFingerprint &&
        typeof sessionRows[0].serverFingerprint === "object"
          ? sessionRows[0].serverFingerprint
          : {};
      const nextFingerprint = {
        ...currentFingerprint,
        ...(runnerRevision ? { runner_revision: runnerRevision } : {}),
        ...(runnerLabel ? { runner_label: runnerLabel } : {}),
        ...(runnerVersion ? { runner_version: runnerVersion } : {}),
      };
      await db
        .update(installSessions)
        .set({ serverFingerprint: nextFingerprint })
        .where(eq(installSessions.id, sid));
    }
  }
  if (job.jobType === "openclaw_upgrade") {
    const payloadResult =
      body?.result && typeof body.result === "object"
        ? (body.result as Record<string, unknown>)
        : null;
    const installedVersion =
      payloadResult && typeof payloadResult.openclaw_version === "string"
        ? payloadResult.openclaw_version.trim()
        : "";
    const requestedVersion =
      payloadResult && typeof payloadResult.requested_version === "string"
        ? payloadResult.requested_version.trim()
        : "";
    const strategy =
      payloadResult && typeof payloadResult.strategy === "string"
        ? payloadResult.strategy.trim()
        : "";
    if (installedVersion || requestedVersion || strategy) {
      const sessionRows = await db
        .select({ serverFingerprint: installSessions.serverFingerprint })
        .from(installSessions)
        .where(eq(installSessions.id, sid))
        .limit(1);
      const currentFingerprint =
        sessionRows[0]?.serverFingerprint &&
        typeof sessionRows[0].serverFingerprint === "object"
          ? sessionRows[0].serverFingerprint
          : {};
      const nextFingerprint = {
        ...currentFingerprint,
        ...(installedVersion ? { openclaw_version: installedVersion } : {}),
        ...(requestedVersion
          ? { openclaw_requested_version: requestedVersion }
          : {}),
        ...(strategy ? { openclaw_upgrade_strategy: strategy } : {}),
        openclaw_last_upgraded_at: now.toISOString(),
      };
      await db
        .update(installSessions)
        .set({ serverFingerprint: nextFingerprint })
        .where(eq(installSessions.id, sid));
    }
  }
  if (job.jobType === "hermes_upgrade") {
    const payloadResult =
      body?.result && typeof body.result === "object"
        ? (body.result as Record<string, unknown>)
        : null;
    const installedVersion =
      payloadResult && typeof payloadResult.hermes_agent_version === "string"
        ? payloadResult.hermes_agent_version.trim()
        : "";
    const requestedVersion =
      payloadResult && typeof payloadResult.requested_version === "string"
        ? payloadResult.requested_version.trim()
        : "";
    if (installedVersion || requestedVersion) {
      const sessionRows = await db
        .select({ serverFingerprint: installSessions.serverFingerprint })
        .from(installSessions)
        .where(eq(installSessions.id, sid))
        .limit(1);
      const currentFingerprint =
        sessionRows[0]?.serverFingerprint &&
        typeof sessionRows[0].serverFingerprint === "object"
          ? sessionRows[0].serverFingerprint
          : {};
      const nextFingerprint = {
        ...currentFingerprint,
        hermes_agent_installed: true,
        ...(installedVersion ? { hermes_agent_version: installedVersion } : {}),
        ...(requestedVersion
          ? { hermes_agent_requested_version: requestedVersion }
          : {}),
        hermes_agent_last_upgraded_at: now.toISOString(),
      };
      await db
        .update(installSessions)
        .set({ serverFingerprint: nextFingerprint })
        .where(eq(installSessions.id, sid));
    }
  }
  if (job.jobType === "install_app") {
    const payload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as Record<string, unknown>)
        : {};
    const payloadResult =
      body?.result && typeof body.result === "object"
        ? (body.result as Record<string, unknown>)
        : {};
    const targetSidRaw =
      typeof payload.install_sid === "string" ? payload.install_sid.trim() : "";
    const targetSid = targetSidRaw || sid;
    const payloadTargetRuntime =
      typeof payload.target_runtime === "string"
        ? payload.target_runtime.trim().toLowerCase()
        : "";
    const resultRuntime =
      typeof payloadResult.active_runtime === "string"
        ? payloadResult.active_runtime.trim().toLowerCase()
        : "";
    const mainRuntime =
      resultRuntime === "hermes" || resultRuntime === "openclaw"
        ? resultRuntime
        : payloadTargetRuntime === "hermes" ||
            payloadTargetRuntime === "openclaw"
          ? payloadTargetRuntime
          : "openclaw";

    const sessionRows = await db
      .select({
        status: installSessions.status,
        seatStatus: installSessions.seatStatus,
        serverFingerprint: installSessions.serverFingerprint,
      })
      .from(installSessions)
      .where(eq(installSessions.id, targetSid))
      .limit(1);
    if (sessionRows.length > 0) {
      const currentSession = sessionRows[0];
      const currentFingerprint =
        currentSession?.serverFingerprint &&
        typeof currentSession.serverFingerprint === "object"
          ? currentSession.serverFingerprint
          : {};
      const nextFingerprint = {
        ...currentFingerprint,
      };
      await db
        .update(installSessions)
        .set({
          serverFingerprint: nextFingerprint,
          // Install app job success is a strong completion signal.
          // Keep terminated/removed sessions intact.
          ...(currentSession.status !== "terminated" &&
          currentSession.seatStatus !== "removed"
            ? {
                status: "completed" as const,
                active: true,
                completedAt: now,
                errorCode: null,
              }
            : {}),
        })
        .where(eq(installSessions.id, targetSid));
    }
    await db
      .insert(deploymentAgents)
      .values({
        sid: targetSid,
        agentId: "main",
        displayName: "main",
        accountId: "main",
        model: null,
        runtime: mainRuntime,
        isPrimary: true,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [deploymentAgents.sid, deploymentAgents.agentId],
        set: {
          runtime: mainRuntime,
          isPrimary: true,
          active: true,
          updatedAt: now,
        },
      });
    await mergeAgentRuntimeUpdate(targetSid, "main", {
      status: "succeeded",
      active_runtime: mainRuntime,
      target_runtime: mainRuntime,
      error_message: null,
      completed_at: now.toISOString(),
      openclaw_service_state:
        typeof payloadResult.openclaw_service_state === "string"
          ? payloadResult.openclaw_service_state.trim()
          : null,
      hermes_service_state:
        typeof payloadResult.hermes_service_state === "string"
          ? payloadResult.hermes_service_state.trim()
          : null,
      hermes_service_name:
        typeof payloadResult.hermes_service_name === "string"
          ? payloadResult.hermes_service_name.trim()
          : null,
    });
  }
  if (job.jobType === "add_agent") {
    const payload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as Record<string, unknown>)
        : {};
    const agentId =
      typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
    if (agentId) {
      const accountIdRaw =
        typeof payload.account_id === "string" ? payload.account_id.trim() : "";
      const displayNameRaw =
        typeof payload.display_name === "string"
          ? payload.display_name.trim()
          : "";
      const tgTokenRaw =
        typeof payload.tg_token === "string" ? payload.tg_token.trim() : "";
      let tgTokenCiphertext: string | null = null;
      if (tgTokenRaw) {
        try {
          tgTokenCiphertext = sealSessionSecret(tgTokenRaw);
        } catch (err) {
          console.error(
            "DEPLOY_SESSION_SECRET_KEY misconfigured – cannot seal tgToken",
            err,
          );
          tgTokenCiphertext = null;
        }
      }
      const telegramProfile =
        !displayNameRaw && tgTokenRaw
          ? await resolveTelegramDisplayNameFromToken(tgTokenRaw)
          : { displayName: "", username: null };
      const displayName = (
        displayNameRaw ||
        telegramProfile.displayName ||
        agentId
      ).slice(0, 80);
      const modelRaw =
        typeof payload.model_preset === "string"
          ? payload.model_preset.trim()
          : typeof payload.model === "string"
            ? payload.model.trim()
            : "";
      const runtimeRaw =
        typeof payload.target_runtime === "string"
          ? payload.target_runtime.trim().toLowerCase()
          : typeof payload.runtime === "string"
            ? payload.runtime.trim().toLowerCase()
            : "";
      const runtime =
        runtimeRaw === "hermes" || runtimeRaw === "openclaw"
          ? runtimeRaw
          : "hermes";
      const isPrimary = isPrimaryAgentId(agentId);
      const persistedAgentTokenCiphertext = getPersistedAgentTokenCiphertext({
        agentId,
        tgTokenCiphertext,
      });
      await db
        .insert(deploymentAgents)
        .values({
          sid,
          agentId,
          displayName,
          telegramUsername: telegramProfile.username,
          accountId: accountIdRaw || agentId,
          model: modelRaw || null,
          runtime,
          tgTokenCiphertext: persistedAgentTokenCiphertext,
          isPrimary,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [deploymentAgents.sid, deploymentAgents.agentId],
          set: {
            displayName,
            telegramUsername: telegramProfile.username,
            accountId: accountIdRaw || agentId,
            model: modelRaw || null,
            runtime,
            tgTokenCiphertext: persistedAgentTokenCiphertext,
            isPrimary,
            active: true,
            updatedAt: now,
          },
        });
      if (isPrimary) {
        const sessionUpdates: Partial<typeof installSessions.$inferInsert> =
          buildPrimarySessionUpdates({
            model: modelRaw || null,
            tgTokenCiphertext,
            telegramUsername: telegramProfile.username,
          });
        await db
          .update(installSessions)
          .set(sessionUpdates)
          .where(eq(installSessions.id, sid));
      }
      const result =
        body?.result && typeof body.result === "object"
          ? (body.result as Record<string, unknown>)
          : {};
      await mergeAgentRuntimeUpdate(sid, agentId, {
        status: "succeeded",
        active_runtime: runtime,
        target_runtime: runtime,
        account_id: accountIdRaw || agentId,
        model: modelRaw || null,
        error_message: null,
        completed_at: now.toISOString(),
        hermes_service_name:
          typeof result.hermes_service_name === "string"
            ? result.hermes_service_name.trim()
            : null,
        openclaw_service_state:
          typeof result.openclaw_service_state === "string"
            ? result.openclaw_service_state.trim()
            : null,
        hermes_service_state:
          typeof result.hermes_service_state === "string"
            ? result.hermes_service_state.trim()
            : null,
      });
    }
  }
  if (job.jobType === "remove_agent") {
    const payload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as Record<string, unknown>)
        : {};
    const agentId =
      typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
    if (agentId) {
      await db
        .insert(deploymentAgents)
        .values({
          sid,
          agentId,
          displayName: agentId,
          accountId: agentId,
          model: null,
          isPrimary: false,
          active: false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [deploymentAgents.sid, deploymentAgents.agentId],
          set: {
            active: false,
            updatedAt: now,
          },
        });
      await releaseTelegramBotTokenAssignments({ sid, agentId });
    }
  }
  await bumpAgentWakeVersion(sid);

  logRunnerApiEvent({
    route: "runner/jobs/ack",
    action: "succeeded",
    sid,
    jobId,
    jobType: job.jobType,
    status: 200,
    startedAt,
    ok: true,
  });
  return NextResponse.json({ ok: true });
}
