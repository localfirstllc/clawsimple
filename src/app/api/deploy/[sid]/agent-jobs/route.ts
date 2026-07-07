import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  deploymentAgentJobSecrets,
  deploymentAgentJobs,
  deploymentAgents,
  installSessions,
} from "@/lib/db/schema";
import { enqueueAgentJob } from "@/lib/deploy/agent-jobs";
import { resolveDeploymentServiceName } from "@/lib/deploy/deployment-service-name";
import { reserveTelegramBotTokenAssignment } from "@/lib/deploy/telegram-token-assignments";
import { listActivePresetModels } from "@/lib/billing/model-pricing";
import { sealJobSecret } from "@/lib/backup/job-secrets";
import { getRequestSession } from "@/lib/auth/session";
import { generatePresetProxyToken } from "@/lib/deploy/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESET_PROVIDER_ID = (process.env.DEPLOY_PRESET_PROVIDER_ID ?? "clawsimple").trim().toLowerCase();

type CreateJobBody = {
  type?:
    | "add_agent"
    | "remove_agent"
    | "openclaw_upgrade"
    | "hermes_upgrade"
    | "telegram_profile_sync";
  payload?: Record<string, unknown>;
};

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SERVICE_NAME_PATTERN = /^clawsimple[A-Za-z0-9_.@-]{0,50}$/;
const OPENCLAW_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeServiceName(payload: Record<string, unknown>) {
  const raw =
    typeof payload.service_name === "string" ? payload.service_name.trim() : "";
  if (!raw) return "clawsimple";
  if (!SERVICE_NAME_PATTERN.test(raw)) {
    throw new Error("payload.service_name must match /^clawsimple[A-Za-z0-9_.@-]{0,50}$/");
  }
  return raw;
}

function normalizeAgentRuntime(payload: Record<string, unknown>) {
  const raw =
    typeof payload.target_runtime === "string"
      ? payload.target_runtime.trim().toLowerCase()
      : typeof payload.runtime === "string"
        ? payload.runtime.trim().toLowerCase()
        : "";
  if (!raw) return null;
  if (raw !== "openclaw" && raw !== "hermes") {
    throw new Error("payload.target_runtime must be openclaw or hermes");
  }
  return raw;
}

function normalizeBinding(value: unknown, agentId: string) {
  if (!isPlainObject(value)) {
    throw new Error("payload.binding must be an object");
  }
  const allowedTopLevel = new Set(["source", "target"]);
  for (const key of Object.keys(value)) {
    if (!allowedTopLevel.has(key)) {
      throw new Error(`payload.binding.${key} is not supported`);
    }
  }

  const source = value.source;
  const target = value.target;
  if (!isPlainObject(source)) {
    throw new Error("payload.binding.source must be an object");
  }
  if (!isPlainObject(target)) {
    throw new Error("payload.binding.target must be an object");
  }

  const allowedSource = new Set(["channel", "accountId", "peer"]);
  for (const key of Object.keys(source)) {
    if (!allowedSource.has(key)) {
      throw new Error(`payload.binding.source.${key} is not supported`);
    }
  }
  const allowedTarget = new Set(["agentId"]);
  for (const key of Object.keys(target)) {
    if (!allowedTarget.has(key)) {
      throw new Error(`payload.binding.target.${key} is not supported`);
    }
  }

  const channel =
    typeof source.channel === "string" ? source.channel.trim() : "";
  if (!channel) {
    throw new Error("payload.binding.source.channel is required");
  }
  const accountId =
    typeof source.accountId === "string" ? source.accountId.trim() : "";
  const peer = typeof source.peer === "string" ? source.peer.trim() : "";
  const targetAgentId =
    typeof target.agentId === "string" ? target.agentId.trim() : "";
  if (!AGENT_ID_PATTERN.test(targetAgentId)) {
    throw new Error("payload.binding.target.agentId is invalid");
  }
  if (targetAgentId !== agentId) {
    throw new Error("payload.binding.target.agentId must equal payload.agent_id");
  }

  const normalizedSource: Record<string, string> = { channel };
  if (accountId) normalizedSource.accountId = accountId;
  if (peer) normalizedSource.peer = peer;
  return {
    source: normalizedSource,
    target: { agentId: targetAgentId },
  };
}

function createJobId() {
  return `agentjob_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeJobPayloadForUser(jobType: string, payload: Record<string, unknown>) {
  if (jobType !== "install_app") return payload;
  const redacted = { ...payload };
  const sensitiveKeys = [
    "tg_token",
    "search_crawl_api_key",
    "mailgun_api_key",
    "preset_proxy_api_key",
    "deploy_agent_token",
  ];
  for (const key of sensitiveKeys) {
    if (key in redacted) {
      redacted[key] = "<redacted>";
    }
  }
  return redacted;
}

async function resolveManagedModelPreset(rawPreset: string) {
  const modelPresetRaw = rawPreset.trim();
  if (!modelPresetRaw) {
    throw new Error("payload.model_preset is required");
  }
  if (modelPresetRaw === "custom") {
    throw new Error("payload.model_preset=custom is not supported for add_agent");
  }

  const catalogModels = await listActivePresetModels();
  if (catalogModels.length === 0) {
    throw new Error("no preset models configured");
  }
  const catalogModelIds = catalogModels.map((row) => row.modelId).filter(Boolean);
  const allowedModelIds = Array.from(new Set(catalogModelIds));
  const mappedLegacyPresetId =
    modelPresetRaw === "gemini"
      ? catalogModels.find((row) => row.provider.toLowerCase() === "google")?.modelId ?? null
      : modelPresetRaw === "claude"
        ? catalogModels.find((row) => row.provider.toLowerCase() === "anthropic")?.modelId ?? null
        : modelPresetRaw === "gpt"
          ? catalogModels.find((row) => row.provider.toLowerCase() === "openai")?.modelId ?? null
          : null;

  const requestedModelId =
    (mappedLegacyPresetId && allowedModelIds.includes(mappedLegacyPresetId)
      ? mappedLegacyPresetId
      : null) ??
    (allowedModelIds.includes(modelPresetRaw) ? modelPresetRaw : null);

  if (!requestedModelId) {
    throw new Error("unknown model_preset");
  }
  return requestedModelId;
}

async function getOwnedDeployment(userId: string, sid: string) {
  const rows = await db
    .select({
      id: installSessions.id,
      seatPlan: installSessions.seatPlan,
      lastModel: installSessions.lastModel,
      tgTokenCiphertext: installSessions.tgTokenCiphertext,
      serverFingerprint: installSessions.serverFingerprint,
    })
    .from(installSessions)
    .where(and(eq(installSessions.id, sid), eq(installSessions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const owned = await getOwnedDeployment(session.user.id, sid);
  if (!owned) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const jobs = await db
    .select()
    .from(deploymentAgentJobs)
    .where(eq(deploymentAgentJobs.sid, sid))
    .orderBy(desc(deploymentAgentJobs.updatedAt))
    .limit(50);

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.jobType,
      payload: sanitizeJobPayloadForUser(
        job.jobType,
        (job.payload ?? {}) as Record<string, unknown>
      ),
      status: job.status,
      error_message: job.errorMessage ?? null,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
      started_at: job.startedAt ? job.startedAt.toISOString() : null,
      completed_at: job.completedAt ? job.completedAt.toISOString() : null,
    })),
    installs: [],
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const owned = await getOwnedDeployment(session.user.id, sid);
  if (!owned) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  let body: CreateJobBody | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const type = body?.type;
  if (
    type !== "add_agent" &&
    type !== "remove_agent" &&
    type !== "openclaw_upgrade" &&
    type !== "hermes_upgrade" &&
    type !== "telegram_profile_sync"
  ) {
    return NextResponse.json(
      {
        error:
          "type must be add_agent, remove_agent, openclaw_upgrade, hermes_upgrade, or telegram_profile_sync",
      },
      { status: 400 }
    );
  }

  const payloadInput = body?.payload ?? {};
  if (!isPlainObject(payloadInput)) {
    return NextResponse.json({ error: "payload must be an object" }, { status: 400 });
  }
  let payload: Record<string, unknown> = payloadInput;
  try {
    const serviceName = resolveDeploymentServiceName(
      normalizeServiceName(payloadInput),
      owned.serverFingerprint,
      sid
    );
    payload = { ...payloadInput, service_name: serviceName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (type === "add_agent") {
    const agentIdRaw =
      typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
    if (!AGENT_ID_PATTERN.test(agentIdRaw)) {
      return NextResponse.json(
        { error: "payload.agent_id is required and must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" },
        { status: 400 }
      );
    }
    try {
      const requestedRuntime = normalizeAgentRuntime(payload);
      const existingAgentRows = await db
        .select({
          runtime: deploymentAgents.runtime,
        })
        .from(deploymentAgents)
        .where(
          and(
            eq(deploymentAgents.sid, sid),
            eq(deploymentAgents.agentId, agentIdRaw),
            eq(deploymentAgents.active, true)
          )
        )
        .limit(1);
      const existingRuntime = existingAgentRows[0]?.runtime?.trim().toLowerCase();
      const normalizedExistingRuntime =
        existingRuntime === "openclaw" || existingRuntime === "hermes"
          ? existingRuntime
          : null;
      const targetRuntime = requestedRuntime ?? normalizedExistingRuntime ?? "hermes";
      if (normalizedExistingRuntime && requestedRuntime && normalizedExistingRuntime !== requestedRuntime) {
        return NextResponse.json(
          { error: "agent_runtime_cannot_be_changed_after_creation" },
          { status: 400 }
        );
      }
      const runnerCapabilities = Array.isArray(owned.serverFingerprint?.runner_capabilities)
        ? owned.serverFingerprint.runner_capabilities.filter(
            (value): value is string => typeof value === "string"
          )
        : [];
      if (targetRuntime === "hermes") {
        if (owned.serverFingerprint?.hermes_agent_installed !== true) {
          return NextResponse.json(
            { error: "hermes_runtime_not_installed" },
            { status: 400 }
          );
        }
        if (
          runnerCapabilities.length > 0 &&
          !runnerCapabilities.includes("add_agent")
        ) {
          return NextResponse.json(
            { error: "runner_does_not_support_hermes_agent_runtime" },
            { status: 400 }
          );
        }
      }
      const modelPresetRaw =
        typeof payload.model_preset === "string" ? payload.model_preset.trim() : "";
      const displayNameRaw =
        typeof payload.display_name === "string" ? payload.display_name.trim() : "";
      const payloadBase: Record<string, unknown> = { ...payload };
      delete payloadBase.model;
      delete payloadBase.model_preset;
      delete payloadBase.ai_source;
      const normalizedBinding =
        payloadBase.binding === undefined
          ? undefined
          : normalizeBinding(payloadBase.binding, agentIdRaw);
      const resolvedModelPreset = await resolveManagedModelPreset(modelPresetRaw);
      const managedCatalogModels = await listActivePresetModels();
      payload = {
        ...payloadBase,
        agent_id: agentIdRaw,
        target_runtime: targetRuntime,
        model_preset: resolvedModelPreset,
        managed_openai_base_url: `${request.nextUrl.origin}/api/deploy/preset-proxy/v1`,
        managed_openai_provider: PRESET_PROVIDER_ID || "clawsimple",
        managed_openai_models: managedCatalogModels
          .map((row) => row.modelId.trim())
          .filter(Boolean)
          .join(","),
        ...(normalizedBinding ? { binding: normalizedBinding } : {}),
        ...(displayNameRaw ? { display_name: displayNameRaw } : {}),
      };
      const tgTokenRaw =
        typeof payload.tg_token === "string" ? payload.tg_token.trim() : "";
      if (tgTokenRaw) {
        const tokenAssignment = await reserveTelegramBotTokenAssignment({
          sid,
          agentId: agentIdRaw,
          token: tgTokenRaw,
        });
        if (!tokenAssignment.ok) {
          const tokenConflict = tokenAssignment.conflict;
          return NextResponse.json(
            {
              error:
                `telegram bot token already used by ${tokenConflict.deploymentName || tokenConflict.sid}` +
                ` / ${tokenConflict.agentDisplayName || tokenConflict.agentId}`,
            },
            { status: 409 }
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  if (type === "remove_agent") {
    const agentIdRaw =
      typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
    if (!AGENT_ID_PATTERN.test(agentIdRaw)) {
      return NextResponse.json(
        { error: "payload.agent_id is required and must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" },
        { status: 400 }
      );
    }
    if (agentIdRaw === "main") {
      return NextResponse.json(
        { error: "primary agent cannot be removed" },
        { status: 400 }
      );
    }
    payload = {
      ...payload,
      agent_id: agentIdRaw,
    };
  }
  if (type === "openclaw_upgrade") {
    const envVersion = (process.env.DEPLOY_OPENCLAW_VERSION ?? "").trim();
    const requestedVersion =
      typeof payload.version === "string" ? payload.version.trim() : "";

    if (envVersion && !OPENCLAW_VERSION_PATTERN.test(envVersion)) {
      return NextResponse.json(
        { error: "server misconfigured: DEPLOY_OPENCLAW_VERSION is invalid" },
        { status: 500 }
      );
    }
    if (requestedVersion && !OPENCLAW_VERSION_PATTERN.test(requestedVersion)) {
      return NextResponse.json(
        { error: "payload.version is invalid" },
        { status: 400 }
      );
    }

    // Keep upgrade behavior consistent with deploy/redeploy target version.
    payload = {
      ...payload,
      version: envVersion || requestedVersion || "latest",
    };
  }
  if (type === "hermes_upgrade") {
    const requestedVersion =
      typeof payload.version === "string" ? payload.version.trim() : "";

    if (requestedVersion && !OPENCLAW_VERSION_PATTERN.test(requestedVersion)) {
      return NextResponse.json(
        { error: "payload.version is invalid" },
        { status: 400 }
      );
    }

    payload = {
      ...payload,
      version: requestedVersion || "main",
    };
  }
  if (type === "telegram_profile_sync") {
    const agentIdRaw =
      typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
    if (agentIdRaw && !AGENT_ID_PATTERN.test(agentIdRaw)) {
      return NextResponse.json(
        { error: "payload.agent_id must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" },
        { status: 400 }
      );
    }
    payload = {
      ...payload,
      ...(agentIdRaw ? { agent_id: agentIdRaw } : {}),
    };
  }
  const jobId = createJobId();
  const now = await enqueueAgentJob({
    id: jobId,
    sid,
    userId: session.user.id,
    jobType: type,
    payload,
  });

  if (
    type === "add_agent" &&
    typeof payload.managed_openai_base_url === "string" &&
    payload.managed_openai_base_url.trim()
  ) {
    await db.insert(deploymentAgentJobSecrets).values({
      jobId,
      kind: "add_agent_provider_keys",
      ciphertext: sealJobSecret(
        JSON.stringify({
          managed_openai_api_key: generatePresetProxyToken(sid),
        })
      ),
      createdAt: now,
    });
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: jobId,
      type,
      payload,
      status: "pending",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  });
}
