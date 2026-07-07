import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  deploymentAgents,
  installSessions,
  telegramAccountLink,
} from "@/lib/db/schema";
import { createHetznerServer } from "@/lib/deploy/hetzner";
import {
  getDeployCapacity,
  acquireCapacityLock,
  releaseCapacityLock,
} from "@/lib/deploy/capacity";
import { buildCloudInit } from "@/lib/install/cloud-init";
import { getInstallScript } from "@/lib/install/install-script";
import { createInstallSession, normalizeLocale } from "@/lib/install/session";
import { getRequestSession } from "@/lib/auth/session";
import { sealSessionSecret } from "@/lib/deploy/session-secrets";
import {
  addSeatToSubscription,
  createBillingPortalSession,
  ensureStripeCustomerId,
  findActivePromoCode,
  getSeatSubscriptionSnapshot,
  getGraceMinutes,
  hasDefaultPaymentMethod,
} from "@/lib/billing/stripe";
import {
  SEAT_PLAN_MAX,
  getSeatPlanPriceId,
  getSeatPlanPriceIds,
  resolveSeatPlan,
  SEAT_PLAN_STANDARD,
} from "@/lib/billing/plans";
import { ensureBillingSubscriptionCache } from "@/lib/billing/subscription-cache";
import { listActivePresetModels } from "@/lib/billing/model-pricing";
import {
  generateCompletionToken,
  generatePresetProxyToken,
  generateInstallEventToken,
} from "@/lib/deploy/tokens";
import { getStatusCheckerPublicKey } from "@/lib/deploy/status-checker";
import {
  generateDeployAgentToken,
  hashDeployAgentToken,
} from "@/lib/deploy/agent-token";
import { findTelegramTokenConflict } from "@/lib/deploy/telegram-token-conflicts";
import {
  releaseTelegramBotTokenAssignments,
  reserveTelegramBotTokenAssignment,
} from "@/lib/deploy/telegram-token-assignments";
import {
  getRedeployLimit,
  getRedeployWindowDays,
} from "@/lib/deploy/redeploy-config";
import {
  isMissingTelegramTableError,
  isTelegramLinkUniqueViolation,
  normalizeTargetRuntime,
  parseListEnv,
  readTargetRuntimeFromFingerprint,
  sanitizeServerName,
  TELEGRAM_USER_ID_RE,
} from "@/lib/deploy/deploy-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDEPLOY_LIMIT = getRedeployLimit();
const REDEPLOY_WINDOW_DAYS = getRedeployWindowDays();

type DeployRequest = {
  tg_token?: string;
  tg_allow?: string;
  model_preset?: string;
  seat_plan?: string;
  locale?: string;
  server_name?: string;
  channel?: string;
  promo_code?: string;
  billing_interval?: "month" | "year";
  subscription_item_id?: string;
  seat_id?: string;
  source_sid?: string;
  target_runtime?: string;
};

const DEFAULT_SERVER_TYPE = process.env.HCLOUD_SERVER_TYPE ?? "cx23";
const DEFAULT_LOCATION = process.env.HCLOUD_LOCATION ?? "nbg1";
const DEFAULT_IMAGE = process.env.HCLOUD_IMAGE ?? "ubuntu-24.04";
const DEFAULT_SERVER_PREFIX = process.env.HCLOUD_SERVER_PREFIX ?? "clawsimple";
const DEPLOY_OPENCLAW_VERSION = (
  process.env.DEPLOY_OPENCLAW_VERSION ?? ""
).trim();
const DEPLOY_OPENCLAW_SUDO_MODE = (
  process.env.DEPLOY_OPENCLAW_SUDO_MODE ?? ""
).trim();
const DEPLOY_CLAWSIMPLE_RESTART_POLICY = (
  process.env.DEPLOY_CLAWSIMPLE_RESTART_POLICY ?? "always"
).trim();
const DEPLOY_CLAWSIMPLE_START_LIMIT_INTERVAL_SEC = (
  process.env.DEPLOY_CLAWSIMPLE_START_LIMIT_INTERVAL_SEC ?? ""
).trim();
const DEPLOY_CLAWSIMPLE_START_LIMIT_BURST = (
  process.env.DEPLOY_CLAWSIMPLE_START_LIMIT_BURST ?? ""
).trim();
const DEPLOY_INSTALL_AUDITD = (process.env.DEPLOY_INSTALL_AUDITD ?? "").trim();
const RUNNER_HEALTH_ALERT_WEBHOOK_URL = (
  process.env.RUNNER_HEALTH_ALERT_WEBHOOK_URL ?? ""
).trim();
const RUNNER_NOTIFY_URL = (
  process.env.RUNNER_NOTIFY_URL ?? "https://runner-notify.clawsimple.com"
).trim();
const HETZNER_LIMIT = Number(process.env.HETZNER_LIMIT ?? "0");
const DEPLOY_ALLOWED_ORIGINS = (process.env.DEPLOY_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const DEFAULT_HETZNER_LOCATIONS = ["nbg1", "hel1"];
const DEFAULT_HETZNER_SERVER_TYPES = ["cx23", "cpx22", "cpx21", "cpx32"];

function getDedicatedHetznerTypes(seatPlan: string) {
  const globalTypes = parseListEnv(
    process.env.DEPLOY_HETZNER_SERVER_TYPES,
    DEFAULT_HETZNER_SERVER_TYPES,
  );
  if (seatPlan === SEAT_PLAN_MAX) {
    return parseListEnv(
      process.env.DEPLOY_HETZNER_SERVER_TYPES_MAX,
      globalTypes,
    );
  }
  if (seatPlan === SEAT_PLAN_STANDARD) {
    return parseListEnv(
      process.env.DEPLOY_HETZNER_SERVER_TYPES_STANDARD,
      globalTypes,
    );
  }
  return globalTypes;
}

function getDedicatedHetznerLocations(seatPlan: string) {
  const globalLocations = parseListEnv(
    process.env.DEPLOY_HETZNER_LOCATIONS,
    DEFAULT_HETZNER_LOCATIONS,
  );
  if (seatPlan === SEAT_PLAN_MAX) {
    return parseListEnv(
      process.env.DEPLOY_HETZNER_LOCATIONS_MAX,
      globalLocations,
    );
  }
  if (seatPlan === SEAT_PLAN_STANDARD) {
    return parseListEnv(
      process.env.DEPLOY_HETZNER_LOCATIONS_STANDARD,
      globalLocations,
    );
  }
  return globalLocations;
}

function getInheritedSeatRemovalAt(
  snapshot: Awaited<ReturnType<typeof getSeatSubscriptionSnapshot>> | null,
) {
  if (!snapshot) return null;
  return (
    snapshot.cancelAt ??
    (snapshot.cancelAtPeriodEnd ? snapshot.currentPeriodEnd : null)
  );
}

function getRequestOrigin(request: NextRequest) {
  const forcedOrigin = (
    process.env.DEPLOY_PUBLIC_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim()
  )?.replace(/\/+$/, "");
  if (forcedOrigin) return forcedOrigin;
  const originHeader = request.headers.get("origin");
  if (originHeader) return originHeader.replace(/\/+$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const proto = forwardedProto?.split(",")[0]?.trim() || "https";
    return `${proto}://${forwardedHost.split(",")[0].trim()}`;
  }
  return new URL(request.url).origin.replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (DEPLOY_ALLOWED_ORIGINS.length > 0) {
    const origin = request.headers.get("origin") ?? "";
    if (!DEPLOY_ALLOWED_ORIGINS.includes(origin)) {
      return NextResponse.json(
        { error: "origin not allowed" },
        { status: 403 },
      );
    }
  }

  let body: DeployRequest | null = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const tgToken = body?.tg_token?.trim() ?? "";
  const providedTgAllow = body?.tg_allow?.trim() ?? "";
  let tgAllow = providedTgAllow;
  const modelPresetRaw = body?.model_preset?.trim() ?? "";
  const locale = normalizeLocale(body?.locale);
  const channel = body?.channel?.trim() || "deploy";
  const requestedSeatPlan = resolveSeatPlan(body?.seat_plan);
  const billingInterval = body?.billing_interval === "year" ? "year" : "month";
  const requestedSubscriptionItemId =
    body?.subscription_item_id?.trim() || undefined;
  const requestedSeatId = body?.seat_id?.trim() || undefined;
  const requestedSourceSid = body?.source_sid?.trim() || undefined;
  const seatPlan = requestedSeatPlan;
  let targetRuntime: "hermes" | "openclaw" | null = null;
  try {
    targetRuntime =
      typeof body?.target_runtime === "string" && body.target_runtime.trim()
        ? normalizeTargetRuntime(body.target_runtime)
        : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // All AI is managed via preset proxy. No custom/BYOM/ZAI providers are supported.
  if (
    requestedSeatPlan !== SEAT_PLAN_STANDARD &&
    requestedSeatPlan !== SEAT_PLAN_MAX
  ) {
    return NextResponse.json(
      { error: "custom_ai_provider_not_supported" },
      { status: 400 },
    );
  }

  let seatIdForSession = requestedSeatId ?? null;
  let displayNameForSession: string | null = null;
  let sourceDisplayExplicitlyEmpty = false;

  if (requestedSourceSid) {
    const sourceRows = await db
      .select({
        id: installSessions.id,
        seatId: installSessions.seatId,
        displayName: installSessions.displayName,
        subscriptionItemId: installSessions.stripeSubscriptionItemId,
        serverFingerprint: installSessions.serverFingerprint,
      })
      .from(installSessions)
      .where(
        and(
          eq(installSessions.id, requestedSourceSid),
          eq(installSessions.userId, session.user.id),
        ),
      )
      .limit(1);
    const sourceSession = sourceRows[0];
    if (!sourceSession) {
      return NextResponse.json(
        { error: "source_session_not_found" },
        { status: 404 },
      );
    }
    if (
      requestedSubscriptionItemId &&
      sourceSession.subscriptionItemId &&
      sourceSession.subscriptionItemId !== requestedSubscriptionItemId
    ) {
      return NextResponse.json(
        { error: "source_subscription_mismatch" },
        { status: 409 },
      );
    }
    seatIdForSession = sourceSession.seatId?.trim() || sourceSession.id;
    targetRuntime =
      targetRuntime ??
      readTargetRuntimeFromFingerprint(sourceSession.serverFingerprint);
    const sourceDisplay = sourceSession.displayName?.trim() || "";
    if (sourceDisplay.length > 0) {
      displayNameForSession = sourceDisplay;
    } else {
      displayNameForSession = null;
      sourceDisplayExplicitlyEmpty = true;
    }
  }
  targetRuntime = targetRuntime ?? normalizeTargetRuntime(null);

  if (!tgToken) {
    return NextResponse.json(
      { error: "tg_token is required" },
      { status: 400 },
    );
  }

  const tokenConflict = await findTelegramTokenConflict({ token: tgToken });
  if (tokenConflict) {
    return NextResponse.json(
      {
        error:
          `telegram bot token already used by ${tokenConflict.deploymentName || tokenConflict.sid}` +
          ` / ${tokenConflict.agentDisplayName || tokenConflict.agentId}`,
      },
      { status: 409 },
    );
  }

  let linkedTelegramUserId: string | null = null;
  let telegramLinkTableAvailable = true;
  try {
    const rows = await db
      .select({ telegramUserId: telegramAccountLink.telegramUserId })
      .from(telegramAccountLink)
      .where(eq(telegramAccountLink.userId, session.user.id))
      .limit(1);
    linkedTelegramUserId = rows[0]?.telegramUserId ?? null;
  } catch (error) {
    if (!isMissingTelegramTableError(error)) {
      throw error;
    }
    telegramLinkTableAvailable = false;
  }

  if (!tgAllow && linkedTelegramUserId) {
    tgAllow = linkedTelegramUserId;
  }

  if (
    linkedTelegramUserId &&
    providedTgAllow &&
    providedTgAllow !== linkedTelegramUserId
  ) {
    return NextResponse.json(
      {
        error:
          "telegram user id does not match your saved mapping; unlink in Profile before changing it",
      },
      { status: 409 },
    );
  }

  if (!linkedTelegramUserId && tgAllow && telegramLinkTableAvailable) {
    try {
      const now = new Date();
      await db
        .insert(telegramAccountLink)
        .values({
          userId: session.user.id,
          telegramUserId: tgAllow,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: telegramAccountLink.userId,
          set: {
            telegramUserId: tgAllow,
            updatedAt: now,
          },
        });
    } catch (error) {
      if (isMissingTelegramTableError(error)) {
        telegramLinkTableAvailable = false;
      } else if (isTelegramLinkUniqueViolation(error)) {
        // Another account already linked this Telegram user ID.
        // Don't block the deployment — silently skip auto-saving.
      } else {
        throw error;
      }
    }
  }

  if (!tgAllow) {
    return NextResponse.json(
      { error: "tg_allow is required (no saved telegram user id)" },
      { status: 400 },
    );
  }
  if (!TELEGRAM_USER_ID_RE.test(tgAllow)) {
    return NextResponse.json(
      { error: "tg_allow must contain digits only" },
      { status: 400 },
    );
  }
  let deployPresetModelId: string | null = null;
  let deployPresetModelIds: string[] | null = null;

  if (modelPresetRaw) {
    // Unified: presets + custom all use an OpenAI-compatible endpoint.
    // Presets: server-side key + base URL + model ID from env.
    // Custom: client provides base URL / model / key.
    const presetBaseUrl = (process.env.DEPLOY_PRESET_BASE_URL ?? "").trim();
    const presetApiKey = (process.env.DEPLOY_PRESET_API_KEY ?? "").trim();
    if (modelPresetRaw === "custom") {
      return NextResponse.json(
        { error: "custom_ai_provider_not_supported" },
        { status: 400 },
      );
    } else {
      if (!presetBaseUrl) {
        return NextResponse.json(
          { error: "deploy preset base url is not configured" },
          { status: 500 },
        );
      }
      if (!presetApiKey) {
        return NextResponse.json(
          { error: "deploy preset api key is not configured" },
          { status: 500 },
        );
      }

      const catalogModels = await listActivePresetModels();
      const catalogModelIds = catalogModels
        .map((row) => row.modelId)
        .filter(Boolean);
      const defaultCatalogModelId =
        catalogModels.find((row) => row.isDefault)?.modelId ??
        catalogModels[0]?.modelId ??
        "";

      const allowedModelIds = Array.from(new Set(catalogModelIds));

      const presetModelId =
        (allowedModelIds.includes(modelPresetRaw) ? modelPresetRaw : null) ??
        defaultCatalogModelId;

      if (!presetModelId) {
        return NextResponse.json(
          {
            error: `deploy preset model is not configured for preset: ${modelPresetRaw}`,
          },
          { status: 500 },
        );
      }
      if (!allowedModelIds.includes(modelPresetRaw)) {
        return NextResponse.json(
          { error: "unknown model_preset" },
          { status: 400 },
        );
      }
      // We proxy managed preset traffic through ClawSimple so we can:
      // - avoid shipping the provider API key to the deployed server
      // - record request usage by subscription seat
      deployPresetModelId = presetModelId;
      deployPresetModelIds =
        allowedModelIds.length > 0 ? allowedModelIds : [presetModelId];
    }
  } else {
    // Legacy behavior: if modelPresetRaw is empty, require preset config regardless.
    if (!(process.env.DEPLOY_PRESET_BASE_URL ?? "").trim()) {
      return NextResponse.json(
        { error: "deploy preset base url is not configured" },
        { status: 500 },
      );
    }
  }

  const seatPriceId = getSeatPlanPriceId(seatPlan, billingInterval);
  const seatPriceIds = getSeatPlanPriceIds(seatPlan, billingInterval);
  if (!seatPriceId) {
    return NextResponse.json(
      { error: "seat price is not configured" },
      { status: 500 },
    );
  }

  const stripeCustomerId = await ensureStripeCustomerId(session.user.id);
  const paymentReady = await hasDefaultPaymentMethod(stripeCustomerId);
  if (!paymentReady) {
    const origin = getRequestOrigin(request);
    let portalUrl: string | null = null;
    try {
      portalUrl = await createBillingPortalSession({
        customerId: stripeCustomerId,
        returnUrl: `${origin}/${locale}?anchor=deploy`,
      });
    } catch {
      portalUrl = null;
    }
    return NextResponse.json(
      { error: "payment_method_required", portal_url: portalUrl },
      { status: 402 },
    );
  }

  let requestedSeatSnapshot: Awaited<
    ReturnType<typeof getSeatSubscriptionSnapshot>
  > | null = null;
  if (requestedSubscriptionItemId) {
    requestedSeatSnapshot = await getSeatSubscriptionSnapshot({
      customerId: stripeCustomerId,
      priceIds: seatPriceIds,
      subscriptionItemId: requestedSubscriptionItemId,
    });
    if (!requestedSeatSnapshot) {
      // Redeploy can race with Stripe item churn (e.g. pending plan changes or
      // item replacement). When source SID is present, fall back to matching by
      // customer + price instead of failing hard on a stale item id.
      if (!requestedSourceSid) {
        return NextResponse.json(
          { error: "subscription_item_not_found" },
          { status: 400 },
        );
      }
      requestedSeatSnapshot = await getSeatSubscriptionSnapshot({
        customerId: stripeCustomerId,
        priceIds: seatPriceIds,
      });
      if (!requestedSeatSnapshot) {
        return NextResponse.json(
          { error: "subscription_item_not_found" },
          { status: 400 },
        );
      }
    }

    // Server-side enforcement for redeploy rate limiting (matches /redeploy-check).
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - REDEPLOY_WINDOW_DAYS);

    const redeployCountRows = await db
      .select({ redeployCount: sql<number>`count(*)::int` })
      .from(installSessions)
      .where(
        and(
          eq(installSessions.userId, session.user.id),
          eq(
            installSessions.stripeSubscriptionItemId,
            requestedSubscriptionItemId,
          ),
          eq(installSessions.seatStatus, "removed"),
          gte(installSessions.seatRemoveAt, windowStart),
        ),
      );
    const redeployCount = redeployCountRows[0]?.redeployCount ?? 0;
    if (redeployCount >= REDEPLOY_LIMIT) {
      return NextResponse.json(
        {
          error: "redeploy_limit_reached",
          redeploy_limit: REDEPLOY_LIMIT,
          redeploy_count: redeployCount,
          window_days: REDEPLOY_WINDOW_DAYS,
        },
        { status: 429 },
      );
    }

    if (!seatIdForSession) {
      const removedSeatRows = await db
        .select({
          seatId: installSessions.seatId,
          displayName: installSessions.displayName,
        })
        .from(installSessions)
        .where(
          and(
            eq(installSessions.userId, session.user.id),
            eq(
              installSessions.stripeSubscriptionItemId,
              requestedSubscriptionItemId,
            ),
            eq(installSessions.seatStatus, "removed"),
          ),
        )
        .orderBy(sql`${installSessions.seatRemoveAt} desc nulls last`)
        .limit(1);

      const latestRemoved = removedSeatRows[0];
      const latestRemovedSeatId = latestRemoved?.seatId?.trim() || "";

      if (latestRemovedSeatId) {
        const activeRows = await db
          .select({ id: installSessions.id })
          .from(installSessions)
          .where(
            and(
              eq(installSessions.userId, session.user.id),
              eq(installSessions.seatId, latestRemovedSeatId),
              or(
                eq(installSessions.active, true),
                inArray(installSessions.status, ["created", "started"]),
              ),
              sql`${installSessions.seatStatus} is distinct from 'removed'`,
            ),
          )
          .limit(1);
        const isOccupied = activeRows.length > 0;
        if (!isOccupied) {
          seatIdForSession = latestRemovedSeatId;
          displayNameForSession = latestRemoved?.displayName?.trim() || null;
        }
      }
    }
  }

  if (
    !requestedSourceSid &&
    !displayNameForSession &&
    !sourceDisplayExplicitlyEmpty &&
    seatIdForSession
  ) {
    // Fresh deploy path only:
    // For redeploy (source_sid present), display name must come from source session
    // and must never be backfilled from historical seat rows.
    const latestSeatRows = await db
      .select({ displayName: installSessions.displayName })
      .from(installSessions)
      .where(
        and(
          eq(installSessions.userId, session.user.id),
          eq(installSessions.seatId, seatIdForSession),
        ),
      )
      .orderBy(sql`${installSessions.createdAt} desc`)
      .limit(10);
    displayNameForSession =
      latestSeatRows
        .map((row) => row.displayName?.trim() ?? "")
        .find((value) => value.length > 0) ?? null;
  }

  const { sid, lastError } = await createInstallSession({
    locale,
    channel,
    userId: session.user.id,
    seatPlan,
    seatId: seatIdForSession,
    displayName: displayNameForSession,
  });

  if (!sid) {
    return NextResponse.json(
      { error: "failed to create session", details: String(lastError ?? "") },
      { status: 500 },
    );
  }

  const requestedName = body?.server_name
    ? sanitizeServerName(body.server_name)
    : "";
  const serverName =
    requestedName || `${DEFAULT_SERVER_PREFIX}-${sid.toLowerCase()}`;

  const installScript = getInstallScript();
  const deployAgentToken = generateDeployAgentToken();
  const deployAgentTokenHash = hashDeployAgentToken(deployAgentToken);
  let sealedTgToken: string;
  try {
    sealedTgToken = sealSessionSecret(tgToken);
  } catch (error) {
    console.error(
      "DEPLOY_SESSION_SECRET_KEY misconfigured – cannot seal tgToken",
      error,
    );
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 },
    );
  }

  // Generate completion webhook token and URL
  const completionToken = generateCompletionToken(sid);
  // Install event HMAC token for authenticated status reporting
  const installEventToken = generateInstallEventToken(sid);
  const origin = getRequestOrigin(request);
  const completionUrl = `${origin}/api/deploy/${sid}/complete`;

  // Build preset proxy config for the deployed server.
  // Proxying through ClawSimple avoids shipping provider API keys to the VM
  // and lets us attribute usage by subscription seat.
  const presetProxyBaseUrl = deployPresetModelId
    ? `${origin}/api/deploy/preset-proxy/v1`
    : "";
  const presetProxyModel = deployPresetModelId ?? "";
  const presetProxyModels = deployPresetModelIds?.join(",") ?? "";
  const presetProxyApiKey = deployPresetModelId
    ? generatePresetProxyToken(sid)
    : "";

  const tokenAssignment = await reserveTelegramBotTokenAssignment({
    sid,
    agentId: "main",
    token: tgToken,
  });
  if (!tokenAssignment.ok) {
    await db
      .update(installSessions)
      .set({
        status: "failed",
        active: false,
        seatStatus: "failed",
        errorCode: "E_TELEGRAM_TOKEN_CONFLICT",
        completedAt: new Date(),
      })
      .where(eq(installSessions.id, sid));
    const conflict = tokenAssignment.conflict;
    return NextResponse.json(
      {
        error:
          `telegram bot token already used by ${conflict.deploymentName || conflict.sid}` +
          ` / ${conflict.agentDisplayName || conflict.agentId}`,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  await db
    .insert(deploymentAgents)
    .values({
      sid,
      agentId: "main",
      displayName: displayNameForSession || "main",
      accountId: "main",
      model: presetProxyModel || null,
      runtime: targetRuntime,
      tgTokenCiphertext: sealedTgToken,
      isPrimary: true,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [deploymentAgents.sid, deploymentAgents.agentId],
      set: {
        displayName: displayNameForSession || "main",
        accountId: "main",
        model: presetProxyModel || null,
        runtime: targetRuntime,
        tgTokenCiphertext: sealedTgToken,
        isPrimary: true,
        active: true,
        updatedAt: now,
      },
    });

  const statusCheckerPublicKey = getStatusCheckerPublicKey();

  try {
    // Acquire advisory lock to serialize capacity check + server creation.
    // This prevents concurrent deploys from all seeing "available" and then
    // racing past each other to create servers.
    const locked = await acquireCapacityLock();
    if (!locked) {
      return NextResponse.json(
        {
          error: "server_unavailable",
          details:
            "deploy capacity lock is held by another request, retry shortly",
          sid,
        },
        { status: 503 },
      );
    }

    const capacity = await getDeployCapacity({
      hetznerLimit: HETZNER_LIMIT,
    });
    if (capacity.hetznerAvailable <= 0) {
      await releaseCapacityLock();
      await db
        .update(installSessions)
        .set({
          status: "failed",
          active: false,
          seatStatus: "failed",
          errorCode: "E_NO_CAPACITY",
          completedAt: new Date(),
        })
        .where(eq(installSessions.id, sid));
      await releaseTelegramBotTokenAssignments({ sid });
      await db
        .update(deploymentAgents)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(deploymentAgents.sid, sid));

      return NextResponse.json(
        {
          error: "server_unavailable",
          details: "no Hetzner capacity available",
          sid,
        },
        { status: 503 },
      );
    }

    let serverFingerprint: {
      deploy_provider: string;
      server_id?: string | number;
      server_name?: string;
      server_ipv4?: string;
      server_ipv6?: string;
      server_type?: string;
      server_location?: string;
      runtime_mode?: string;
      agent_runtimes?: Record<
        string,
        {
          status?: string | null;
          target_runtime?: string | null;
          active_runtime?: string | null;
        }
      >;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = {} as any;

    const dedicatedLocations = getDedicatedHetznerLocations(seatPlan);
    const dedicatedTypes = getDedicatedHetznerTypes(seatPlan);

    let server;
    let lastError;
    let rootPassword = "";

    const userData = buildCloudInit({
      env: {
        TG_TOKEN: tgToken,
        TG_ALLOW: tgAllow,
        PRESET_PROXY_BASE_URL: presetProxyBaseUrl || undefined,
        PRESET_PROXY_MODEL: presetProxyModel || undefined,
        PRESET_PROXY_MODELS: presetProxyModels || undefined,
        PRESET_PROXY_API_KEY: presetProxyApiKey || undefined,
        SID: sid,
        LANG: locale,
        NONINTERACTIVE: "1",
        OPENCLAW_VERSION: DEPLOY_OPENCLAW_VERSION || undefined,
        OPENCLAW_SUDO_MODE: DEPLOY_OPENCLAW_SUDO_MODE || undefined,
        CLAWSIMPLE_RESTART_POLICY:
          DEPLOY_CLAWSIMPLE_RESTART_POLICY || undefined,
        CLAWSIMPLE_START_LIMIT_INTERVAL_SEC:
          DEPLOY_CLAWSIMPLE_START_LIMIT_INTERVAL_SEC || undefined,
        CLAWSIMPLE_START_LIMIT_BURST:
          DEPLOY_CLAWSIMPLE_START_LIMIT_BURST || undefined,
        CLAWSIMPLE_SERVICE_FAILURE_WEBHOOK_URL:
          RUNNER_HEALTH_ALERT_WEBHOOK_URL || undefined,
        INSTALL_AUDITD: DEPLOY_INSTALL_AUDITD || undefined,
        DEPLOY_AGENT_TOKEN: deployAgentToken,
        CLAWSIMPLE_API_BASE_URL: origin,
        RUNNER_NOTIFY_URL: RUNNER_NOTIFY_URL || undefined,
        TARGET_AGENT_RUNTIME: targetRuntime,
        INSTALL_EVENT_TOKEN: installEventToken,
      },
      installScript,
      completionToken,
      completionUrl,
      statusCheckerPublicKey,
    });
    const attempts = dedicatedTypes.map((type) => ({
      type,
      locations: dedicatedLocations,
    }));

    outerLoop: for (const attempt of attempts) {
      for (const location of attempt.locations) {
        try {
          console.log(`Attempting to deploy ${attempt.type} to ${location}...`);
          const created = await createHetznerServer({
            name: serverName,
            serverType: attempt.type,
            location,
            image: DEFAULT_IMAGE,
            userData,
            labels: {
              "managed-by": "clawsimple",
              "created-at": new Date()
                .toISOString()
                .slice(0, 10)
                .replace(/-/g, ""),
              "install-sid": sid,
            },
          });
          server = created.server;
          rootPassword = (created.rootPassword ?? "").trim();
          break outerLoop;
        } catch (err: unknown) {
          const error = err as { code?: string; message?: string };
          lastError = error;
          if (
            error?.code === "resource_unavailable" ||
            error?.code === "invalid_input"
          ) {
            const reason =
              error?.code === "resource_unavailable"
                ? "out of stock"
                : "not supported";
            console.warn(
              `Type ${attempt.type} in ${location} unavailable (${reason}), retrying next...`,
            );
            continue;
          }
          throw error;
        }
      }
    }

    if (!server) {
      console.error("All deployment attempts failed.");
      throw (
        lastError ||
        new Error("Failed to provision server in any location or type")
      );
    }

    serverFingerprint = {
      deploy_provider: "hetzner",
      server_id: server.id,
      server_name: server.name,
      server_ipv4: server.public_net?.ipv4?.ip,
      server_ipv6: server.public_net?.ipv6?.ip,
      server_type: server.server_type?.name ?? DEFAULT_SERVER_TYPE,
      server_location: server.location?.name ?? DEFAULT_LOCATION,
      runtime_mode: "dedicated-hetzner",
      agent_runtimes: {
        main: {
          status: "provisioning",
          target_runtime: targetRuntime,
        },
      },
    };

    const graceMinutes = getGraceMinutes();
    const graceUntil = new Date(Date.now() + graceMinutes * 60_000);

    let promotionCodeId: string | undefined;
    const promoCode = body?.promo_code?.trim();
    if (promoCode) {
      try {
        const promo = await findActivePromoCode(promoCode);
        if (promo) {
          promotionCodeId = promo.id;
        }
      } catch (e) {
        console.warn("Failed to validate promo code during deployment:", e);
      }
    }

    const existingSeat =
      requestedSeatSnapshot ??
      (await getSeatSubscriptionSnapshot({
        customerId: stripeCustomerId,
        priceIds: seatPriceIds,
        subscriptionItemId: requestedSubscriptionItemId,
      }));
    const activeRowsForExistingSeat = existingSeat
      ? await db
          .select({ id: installSessions.id })
          .from(installSessions)
          .where(
            and(
              eq(installSessions.userId, session.user.id),
              or(
                eq(installSessions.active, true),
                inArray(installSessions.status, ["created", "started"]),
              ),
              eq(
                installSessions.stripeSubscriptionItemId,
                existingSeat.subscriptionItemId,
              ),
            ),
          )
      : [];
    const activeSeatCount = activeRowsForExistingSeat.length;
    const hasAvailableSeat = existingSeat
      ? existingSeat.quantity > activeSeatCount
      : false;

    let seatResult: Awaited<ReturnType<typeof addSeatToSubscription>> | null =
      null;
    let seatAction: "reused" | "incremented" = "incremented";
    let seatError: string | null = null;
    if (hasAvailableSeat) {
      console.log("Deploy seat reuse", {
        sid,
        seatPlan,
        activeSeatCount,
        subscriptionId: existingSeat?.subscriptionId,
        subscriptionItemId: existingSeat?.subscriptionItemId,
        availableSeats: existingSeat
          ? existingSeat.quantity - activeSeatCount
          : 0,
      });
      seatResult = existingSeat;
      seatAction = "reused";
    } else {
      console.log("Deploy seat increment", {
        sid,
        seatPlan,
        activeSeatCount,
        existingSeatQuantity: existingSeat?.quantity ?? 0,
      });
      try {
        seatResult = await addSeatToSubscription({
          customerId: stripeCustomerId,
          priceId: seatPriceId,
          priceIds: seatPriceIds,
          promotionCodeId,
          subscriptionItemId: requestedSubscriptionItemId,
        });
        console.log("Deploy seat incremented", {
          sid,
          subscriptionId: seatResult?.subscriptionId,
          subscriptionItemId: seatResult?.subscriptionItemId,
          invoiceId: seatResult?.invoiceId,
          paid: seatResult?.paid,
        });
      } catch (error) {
        seatError =
          error instanceof Error ? error.message : String(error ?? "");
        console.warn("Deploy seat increment failed", {
          sid,
          seatPlan,
          error: seatError,
        });
      }
    }

    const inheritedSeatRemovalAt = getInheritedSeatRemovalAt(
      requestedSeatSnapshot,
    );
    const seatStatus = seatResult?.paid
      ? inheritedSeatRemovalAt
        ? "pending_remove"
        : "active"
      : "pending";
    let portalUrl: string | null = null;
    if (seatStatus === "pending") {
      try {
        portalUrl = await createBillingPortalSession({
          customerId: stripeCustomerId,
          returnUrl: `${getRequestOrigin(request)}/${locale}?anchor=deploy`,
        });
      } catch {
        portalUrl = null;
      }
    }

    await db
      .update(installSessions)
      .set({
        status: "started",
        active: true,
        seatStatus,
        seatRemoveAt:
          seatStatus === "pending_remove" ? inheritedSeatRemovalAt : null,
        graceUntil: seatResult?.paid ? null : graceUntil,
        stripeSubscriptionId: seatResult?.subscriptionId ?? null,
        stripeSubscriptionItemId: seatResult?.subscriptionItemId ?? null,
        stripeInvoiceId: seatResult?.invoiceId ?? null,
        deployAgentTokenHash,
        serverFingerprint,
        // Persist the platform-managed model ID so the profile card can display it.
        lastModel: presetProxyModel || null,
        presetProxyBaseUrl: presetProxyBaseUrl || null,
        presetProxyModel: presetProxyModel || null,
        presetProxyModels: presetProxyModels || null,
        presetProxyApiKeyCiphertext: null,
        tgTokenCiphertext: sealedTgToken,
      })
      .where(eq(installSessions.id, sid));

    // Refresh profile-facing subscription cache after a successful seat linkage
    // so users see updated plan/server counts immediately after deployment.
    try {
      await ensureBillingSubscriptionCache(session.user.id, {
        force: true,
        stripeCustomerId,
      });
    } catch (cacheError) {
      console.warn("Deploy subscription cache refresh failed", {
        sid,
        userId: session.user.id,
        stripeCustomerId,
        error:
          cacheError instanceof Error
            ? cacheError.message
            : String(cacheError ?? ""),
      });
    }

    // Release capacity lock now that server creation is done.
    await releaseCapacityLock();

    return NextResponse.json({
      sid,
      seat_id: seatIdForSession ?? sid,
      status: "started",
      server: serverFingerprint,
      status_url: `/api/deploy/${sid}`,
      seat_action: seatAction,
      payment_status: seatStatus,
      grace_until: seatResult?.paid ? null : graceUntil.toISOString(),
      billing_portal_url: portalUrl,
      payment_error: seatError,
      rescue_password: rootPassword || null,
    });
  } catch (error) {
    console.error("Deploy API Error:", error);
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    await db
      .update(installSessions)
      .set({
        status: "failed",
        active: false,
        seatStatus: "failed",
        errorCode: "E_HCLOUD",
        serverFingerprint: {
          deploy_provider: "hetzner",
          error_code: message,
        },
        completedAt: new Date(),
      })
      .where(eq(installSessions.id, sid));
    await releaseTelegramBotTokenAssignments({ sid });
    await db
      .update(deploymentAgents)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(deploymentAgents.sid, sid));

    // Release capacity lock on error path.
    await releaseCapacityLock();

    return NextResponse.json(
      { error: "failed to create server", details: message, sid },
      { status: 502 },
    );
  }
}
