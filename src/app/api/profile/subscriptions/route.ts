import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import {
  getIncludedManagedCreditsCapUsd,
} from "@/lib/billing/managed-credits";
import { getUsageCreditSummaryUsd } from "@/lib/billing/usage-credits";
import { getStripeCustomerId } from "@/lib/billing/stripe";
import {
  ensureBillingSubscriptionCache,
  getProfileVisibleStatuses,
  listCachedSubscriptionItemsForUser,
} from "@/lib/billing/subscription-cache";
import { resolveSeatMetaFromPriceId } from "@/lib/billing/plans";
import { getMonthlyUsageWindow, toDayStringUTC } from "@/lib/billing/usage-window";
import { openSessionSecret } from "@/lib/deploy/session-secrets";
import { db } from "@/lib/db";
import {
  deploymentAgents,
  deploymentAgentJobs,
  deployPresetUsageSeatDaily,
  installSessions,
} from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SeatPlan = "seat-standard" | "seat-max" | "unknown";
type BillingInterval = "month" | "year" | "unknown";

function decryptOptionalSecret(value: string | null | undefined) {
  if (!value) return null;
  try {
    return openSessionSecret(value);
  } catch {
    return null;
  }
}

function getAgentRuntimeInfo(serverFingerprint: unknown, agentId: string) {
  if (!serverFingerprint || typeof serverFingerprint !== "object") return null;
  const fingerprint = serverFingerprint as Record<string, unknown>;
  const runtimes =
    fingerprint.agent_runtimes &&
    typeof fingerprint.agent_runtimes === "object" &&
    !Array.isArray(fingerprint.agent_runtimes)
      ? (fingerprint.agent_runtimes as Record<string, unknown>)
      : {};
  const runtime =
    runtimes[agentId] &&
    typeof runtimes[agentId] === "object" &&
    !Array.isArray(runtimes[agentId])
      ? (runtimes[agentId] as Record<string, unknown>)
      : null;
  return runtime;
}

function getAgentRuntimes(serverFingerprint: unknown) {
  if (!serverFingerprint || typeof serverFingerprint !== "object") return {};
  const fingerprint = serverFingerprint as Record<string, unknown>;
  const runtimes =
    fingerprint.agent_runtimes &&
    typeof fingerprint.agent_runtimes === "object" &&
    !Array.isArray(fingerprint.agent_runtimes)
      ? (fingerprint.agent_runtimes as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(runtimes).filter(
      ([agentId, value]) =>
        typeof agentId === "string" &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    )
  );
}

function getAgentRuntimeModel(serverFingerprint: unknown, agentId: string) {
  const runtime = getAgentRuntimeInfo(serverFingerprint, agentId);
  const status = typeof runtime?.status === "string" ? runtime.status.trim() : "";
  const activeRuntime =
    typeof runtime?.active_runtime === "string" ? runtime.active_runtime.trim() : "";
  if (status && status !== "succeeded") return null;
  if (activeRuntime !== "hermes" && activeRuntime !== "openclaw") return null;
  const model = typeof runtime?.model === "string" ? runtime.model.trim() : "";
  return model || null;
}

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stripeCustomerId = await getStripeCustomerId(session.user.id);
  if (!stripeCustomerId) {
    return NextResponse.json({ subscriptions: [] });
  }

  await ensureBillingSubscriptionCache(session.user.id, { stripeCustomerId });
  const cached = await listCachedSubscriptionItemsForUser({
    userId: session.user.id,
    stripeCustomerId,
    statuses: getProfileVisibleStatuses(),
  });
  const subscriptionItems = cached
    .filter((row) => (row.quantity ?? 0) > 0)
    .map((row) => ({
      subscriptionId: row.stripeSubscriptionId,
      subscriptionStatus: row.status,
      subscriptionCreatedAt: row.subscriptionCreatedAt ?? row.createdAt,
      itemId: row.stripeSubscriptionItemId,
      priceId: row.priceId,
      quantity: row.quantity ?? 0,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
    }));

  const itemIds = subscriptionItems.map((item) => item.itemId);
  const linkedDeployments =
    itemIds.length > 0
      ? await db
          .select({
            sid: installSessions.id,
            displayName: installSessions.displayName,
            status: installSessions.status,
            seatStatus: installSessions.seatStatus,
            createdAt: installSessions.createdAt,
            lastModel: installSessions.lastModel,
            exaMode: installSessions.exaMode,
            exaApiKeyCiphertext: installSessions.exaApiKeyCiphertext,
            searchCrawlMode: installSessions.searchCrawlMode,
            searchCrawlApiKeyCiphertext: installSessions.searchCrawlApiKeyCiphertext,
            mailgunApiKeyCiphertext: installSessions.mailgunApiKeyCiphertext,
            mailgunBackupEmail: installSessions.mailgunBackupEmail,
            mailgunInboxAddress: installSessions.mailgunInboxAddress,
            mailgunDomain: installSessions.mailgunDomain,
            mailgunAgentId: installSessions.mailgunAgentId,
            mailgunTelegramTarget: installSessions.mailgunTelegramTarget,
            tgTokenCiphertext: installSessions.tgTokenCiphertext,
            seatId: installSessions.seatId,
            subscriptionItemId: installSessions.stripeSubscriptionItemId,
            pendingSeatPlan: installSessions.pendingSeatPlan,
            pendingSeatEffectiveAt: installSessions.pendingSeatEffectiveAt,
            serverFingerprint: installSessions.serverFingerprint,
          })
          .from(installSessions)
          .where(
            and(
              eq(installSessions.userId, session.user.id),
              inArray(installSessions.stripeSubscriptionItemId, itemIds),
              or(
                eq(installSessions.active, true),
                inArray(installSessions.status, ["created", "started"])
              )
            )
          )
      : [];

  const deploymentsByItem = new Map<string, typeof linkedDeployments>();
  for (const row of linkedDeployments) {
    const key = row.subscriptionItemId;
    if (!key) continue;
    const current = deploymentsByItem.get(key) ?? [];
    current.push(row);
    deploymentsByItem.set(key, current);
  }

  const linkedSids = linkedDeployments.map((row) => row.sid);
  const persistedAgents =
    linkedSids.length > 0
      ? await db
          .select({
            sid: deploymentAgents.sid,
            agentId: deploymentAgents.agentId,
            displayName: deploymentAgents.displayName,
            accountId: deploymentAgents.accountId,
            model: deploymentAgents.model,
            runtime: deploymentAgents.runtime,
            tgTokenCiphertext: deploymentAgents.tgTokenCiphertext,
            isPrimary: deploymentAgents.isPrimary,
            active: deploymentAgents.active,
            createdAt: deploymentAgents.createdAt,
            updatedAt: deploymentAgents.updatedAt,
          })
          .from(deploymentAgents)
          .where(
            inArray(deploymentAgents.sid, linkedSids)
          )
      : [];
  const additionalAgentsBySid = new Map<
    string,
    Array<{
      agent_id: string;
      display_name: string | null;
      created_at: string | null;
      account_id: string | null;
      model_preset: string | null;
      runtime: "openclaw" | "hermes";
      has_bot_token: boolean;
      is_pending?: boolean;
    }>
  >();
  const primaryAgentMetaBySid = new Map<
    string,
    { display_name: string | null; created_at: string | null; model: string | null }
  >();
  const sortedPersistedAgents = [...persistedAgents].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  const seenAgentKeys = new Set<string>();
  for (const row of sortedPersistedAgents) {
    const agentId = row.agentId.trim();
    if (!agentId) continue;
      if (row.isPrimary) {
        if (row.active && !primaryAgentMetaBySid.has(row.sid)) {
          primaryAgentMetaBySid.set(row.sid, {
            display_name: row.displayName?.trim() || null,
            created_at: row.createdAt.toISOString(),
            model: row.model?.trim() || null,
          });
        }
        continue;
      }
    const key = `${row.sid}::${agentId}`;
    if (seenAgentKeys.has(key)) continue;
    seenAgentKeys.add(key);
    if (!row.active) continue;
    const current = additionalAgentsBySid.get(row.sid) ?? [];
    current.push({
      agent_id: agentId,
      display_name: row.displayName?.trim() || null,
      created_at: row.createdAt.toISOString(),
      account_id: row.accountId?.trim() || null,
      model_preset: row.model?.trim() || null,
      runtime: row.runtime === "hermes" ? "hermes" : "openclaw",
      has_bot_token: Boolean(decryptOptionalSecret(row.tgTokenCiphertext)),
    });
    additionalAgentsBySid.set(row.sid, current);
  }
  const addAgentJobsWithPending = linkedSids.length
    ? await db
        .select({
          sid: deploymentAgentJobs.sid,
          payload: deploymentAgentJobs.payload,
          status: deploymentAgentJobs.status,
          updatedAt: deploymentAgentJobs.updatedAt,
        })
        .from(deploymentAgentJobs)
        .where(
          and(
            inArray(deploymentAgentJobs.sid, linkedSids),
            eq(deploymentAgentJobs.jobType, "add_agent"),
            inArray(deploymentAgentJobs.status, ["pending", "running", "succeeded"])
          )
        )
    : [];
  const installJobsWithToken = linkedSids.length
    ? await db
        .select({
          sid: deploymentAgentJobs.sid,
          payload: deploymentAgentJobs.payload,
          updatedAt: deploymentAgentJobs.updatedAt,
        })
        .from(deploymentAgentJobs)
        .where(
          and(
            inArray(deploymentAgentJobs.sid, linkedSids),
            eq(deploymentAgentJobs.jobType, "install_app")
          )
        )
    : [];
  const mainTokenFallbackBySid = new Map<string, string>();
  const sortedInstallJobs = [...installJobsWithToken].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  for (const job of sortedInstallJobs) {
    if (mainTokenFallbackBySid.has(job.sid)) continue;
    const payload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as Record<string, unknown>)
        : {};
    const tgToken =
      typeof payload.tg_token === "string" ? payload.tg_token.trim() : "";
    if (!tgToken) continue;
    mainTokenFallbackBySid.set(job.sid, tgToken);
  }
  const sortedAddAgentJobs = [...addAgentJobsWithPending].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  for (const job of sortedAddAgentJobs) {
    const payload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as Record<string, unknown>)
        : {};
    const agentId =
      typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
    if (!agentId) continue;
    if (agentId === "main") continue;
    const key = `${job.sid}::${agentId}`;
    if (seenAgentKeys.has(key)) continue;
    seenAgentKeys.add(key);
    const accountId =
      typeof payload.account_id === "string" ? payload.account_id.trim() : "";
    const displayName =
      typeof payload.display_name === "string" ? payload.display_name.trim() : "";
    const modelPreset =
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
    const current = additionalAgentsBySid.get(job.sid) ?? [];
    current.push({
      agent_id: agentId,
      display_name: displayName || agentId,
      created_at: null,
      account_id: accountId || null,
      model_preset: modelPreset || null,
      runtime: runtimeRaw === "hermes" ? "hermes" : "openclaw",
      has_bot_token:
        typeof payload.tg_token === "string" ? payload.tg_token.trim().length > 0 : false,
      is_pending: job.status !== "succeeded",
    });
    additionalAgentsBySid.set(job.sid, current);
  }

  const result = subscriptionItems
    .map((item) => {
      const metaResolved = resolveSeatMetaFromPriceId(item.priceId);
      const meta: { seatPlan: SeatPlan; billingInterval: BillingInterval } =
        metaResolved
          ? { seatPlan: metaResolved.seatPlan, billingInterval: metaResolved.billingInterval }
          : { seatPlan: "unknown", billingInterval: "unknown" };
      const deployments = deploymentsByItem.get(item.itemId) ?? [];
      const activeDeployments = deployments.length;
      const availableSeats = Math.max(0, item.quantity - activeDeployments);

      return {
        subscription_id: item.subscriptionId,
        subscription_status: item.subscriptionStatus,
        subscription_created_at: item.subscriptionCreatedAt.toISOString(),
        cancel_at_period_end: item.cancelAtPeriodEnd,
        current_period_start: item.currentPeriodStart
          ? item.currentPeriodStart.toISOString()
          : null,
        current_period_end: item.currentPeriodEnd
          ? item.currentPeriodEnd.toISOString()
          : null,
        subscription_item_id: item.itemId,
        price_id: item.priceId,
        seat_plan: meta.seatPlan,
        billing_interval: meta.billingInterval,
        seat_capacity: item.quantity,
        active_deployments: activeDeployments,
        available_seats: availableSeats,
        can_deploy: availableSeats > 0,
        included_ai_cap_usd: getIncludedManagedCreditsCapUsd(meta.seatPlan),
        usage_estimated_usd: null as number | null,
        usage_period_start: item.currentPeriodStart
          ? getMonthlyUsageWindow(item.currentPeriodStart).start.toISOString()
          : null,
        usage_period_end: item.currentPeriodStart
          ? getMonthlyUsageWindow(item.currentPeriodStart).end.toISOString()
          : null,
        deployments: deployments.map((deploy) => {
          const fingerprint =
            deploy.serverFingerprint && typeof deploy.serverFingerprint === "object"
              ? deploy.serverFingerprint
              : {};
          const capabilities = Array.isArray(fingerprint.runner_capabilities)
            ? fingerprint.runner_capabilities.filter(
                (value): value is string => typeof value === "string"
              )
            : [];
          const backupSupported = capabilities.includes("backup_export");
          const primaryRuntimeModel = getAgentRuntimeModel(fingerprint, "main");
          const primaryRuntime = getAgentRuntimeInfo(fingerprint, "main");
          return {
            sid: deploy.sid,
            seat_id: deploy.seatId ?? deploy.sid,
            display_name: deploy.displayName,
            primary_agent_display_name:
              primaryAgentMetaBySid.get(deploy.sid)?.display_name ?? null,
            primary_agent_created_at:
              primaryAgentMetaBySid.get(deploy.sid)?.created_at ?? null,
            primary_agent_model:
              primaryRuntimeModel ??
              primaryAgentMetaBySid.get(deploy.sid)?.model ??
              null,
            status: deploy.status,
            seat_status: deploy.seatStatus,
            backup_supported: backupSupported,
            server: {
              server_name:
                typeof fingerprint.server_name === "string"
                  ? fingerprint.server_name.trim()
                  : null,
              server_ipv4:
                typeof fingerprint.server_ipv4 === "string"
                  ? fingerprint.server_ipv4.trim()
                  : null,
              runtime_mode:
                typeof fingerprint.runtime_mode === "string"
                  ? fingerprint.runtime_mode.trim()
                  : null,
              runner_capabilities: capabilities,
              openclaw_version:
                typeof fingerprint.openclaw_version === "string"
                  ? fingerprint.openclaw_version.trim()
                  : null,
              active_runtime:
                typeof primaryRuntime?.active_runtime === "string"
                  ? primaryRuntime.active_runtime.trim()
                  : null,
              hermes_agent_installed: fingerprint.hermes_agent_installed === true,
              agent_runtimes: getAgentRuntimes(fingerprint),
            },
            installed_skills: [],
            additional_agents: (additionalAgentsBySid.get(deploy.sid) ?? []).map((agent) => ({
              ...agent,
              model_preset:
                getAgentRuntimeModel(fingerprint, agent.agent_id) ??
                agent.model_preset,
              created_at: agent.created_at ?? deploy.createdAt.toISOString(),
            })),
            created_at: deploy.createdAt.toISOString(),
            last_model: deploy.lastModel ?? null,
            exa_mode: "managed",
            has_mailgun_config:
              typeof deploy.mailgunApiKeyCiphertext === "string" &&
              deploy.mailgunApiKeyCiphertext.trim().length > 0,
            mailgun_backup_email: deploy.mailgunBackupEmail?.trim() || null,
            mailgun_inbox_address: deploy.mailgunInboxAddress?.trim().toLowerCase() || null,
            mailgun_domain: deploy.mailgunDomain?.trim().toLowerCase() || null,
            mailgun_agent_id: deploy.mailgunAgentId?.trim() || null,
            mailgun_telegram_target: deploy.mailgunTelegramTarget?.trim() || null,
            tg_token:
              decryptOptionalSecret(deploy.tgTokenCiphertext) ??
              mainTokenFallbackBySid.get(deploy.sid) ??
              null,
            pending_seat_plan:
              deploy.pendingSeatPlan === "seat-standard" || deploy.pendingSeatPlan === "seat-max"
                ? deploy.pendingSeatPlan
                : null,
            pending_seat_effective_at: deploy.pendingSeatEffectiveAt
              ? deploy.pendingSeatEffectiveAt.toISOString()
              : null,
          };
        }),
      };
    })
    .sort((a, b) =>
      b.subscription_created_at.localeCompare(a.subscription_created_at)
    );

  // Attach deploy preset usage (requests to DEPLOY_PRESET_BASE_URL via our proxy).
  // We compute per seat (deployment SID) and per Stripe billing period.

  const periodGroups = new Map<string, string[]>();
  for (const item of result) {
    const start = item.usage_period_start ?? "";
    const end = item.usage_period_end ?? "";
    const key = `${start}::${end}`;
    const current = periodGroups.get(key) ?? [];
    current.push(item.subscription_item_id);
    periodGroups.set(key, current);
  }

  const usageByItemCost = new Map<string, number>();
  const usageByItemRequests = new Map<string, number>();
  const usageByItemTokens = new Map<string, number>();
  const usageBySidCost = new Map<string, number>();
  const usageBySidRequests = new Map<string, number>();
  const usageBySidTokens = new Map<string, number>();
  for (const [key, itemIdsForPeriod] of periodGroups.entries()) {
    const [startRaw, endRaw] = key.split("::");
    if (!startRaw || !endRaw || itemIdsForPeriod.length === 0) continue;

    const startDay = toDayStringUTC(new Date(startRaw));
    const endDay = toDayStringUTC(new Date(endRaw));
    
    // Query usage by subscription item
    const rows = await db
      .select({
        subscriptionItemId: deployPresetUsageSeatDaily.subscriptionItemId,
        costUsd: sql<string>`coalesce(sum(${deployPresetUsageSeatDaily.costEstimatedUsd}), 0)::text`,
        requests: sql<number>`sum(${deployPresetUsageSeatDaily.requestCount})::int`,
        totalTokens: sql<number>`sum(${deployPresetUsageSeatDaily.totalTokens})::int`,
      })
      .from(deployPresetUsageSeatDaily)
      .where(
        and(
          inArray(deployPresetUsageSeatDaily.subscriptionItemId, itemIdsForPeriod),
          gte(deployPresetUsageSeatDaily.day, startDay),
          lte(deployPresetUsageSeatDaily.day, endDay)
        )
      )
      .groupBy(deployPresetUsageSeatDaily.subscriptionItemId);

    for (const row of rows) {
      usageByItemCost.set(row.subscriptionItemId, Number(row.costUsd ?? "0"));
      usageByItemRequests.set(row.subscriptionItemId, row.requests ?? 0);
      usageByItemTokens.set(row.subscriptionItemId, row.totalTokens ?? 0);
    }

    // Query usage counts per seat (deployment SID)
    const sidsForPeriod = linkedDeployments
      .filter((d) => d.subscriptionItemId && itemIdsForPeriod.includes(d.subscriptionItemId))
      .map((d) => d.seatId ?? d.sid);
    if (sidsForPeriod.length > 0) {
      const seatRows = await db
        .select({
          seatId: deployPresetUsageSeatDaily.seatId,
          costUsd: sql<string>`coalesce(sum(${deployPresetUsageSeatDaily.costEstimatedUsd}), 0)::text`,
          requests: sql<number>`sum(${deployPresetUsageSeatDaily.requestCount})::int`,
          totalTokens: sql<number>`sum(${deployPresetUsageSeatDaily.totalTokens})::int`,
        })
        .from(deployPresetUsageSeatDaily)
        .where(
          and(
            inArray(deployPresetUsageSeatDaily.seatId, sidsForPeriod),
            gte(deployPresetUsageSeatDaily.day, startDay),
            lte(deployPresetUsageSeatDaily.day, endDay)
          )
        )
        .groupBy(deployPresetUsageSeatDaily.seatId);

      for (const row of seatRows) {
        if (!row.seatId) continue;
        usageBySidCost.set(row.seatId, Number(row.costUsd ?? "0"));
        usageBySidRequests.set(row.seatId, row.requests ?? 0);
        usageBySidTokens.set(row.seatId, row.totalTokens ?? 0);
      }
    }
    
  }

  for (const item of result) {
    const itemCostFromRows = usageByItemCost.get(item.subscription_item_id) ?? 0;
    item.usage_estimated_usd = itemCostFromRows;

    // Also attach per-seat usage to each deployment for paid presets.
    const capUsd = getIncludedManagedCreditsCapUsd(item.seat_plan);

    if (typeof capUsd === "number") {
      item.deployments = item.deployments.map((deploy) => {
        const seatIdentity = deploy.seat_id ?? deploy.sid;
        const seatRequests = usageBySidRequests.get(seatIdentity) ?? 0;
        const seatTokens = usageBySidTokens.get(seatIdentity) ?? 0;
        const seatCostUsd = usageBySidCost.get(seatIdentity) ?? 0;
        const seatRemainingUsd = Math.max(0, capUsd - seatCostUsd);
        return {
          ...deploy,
          usage_estimated_usd: seatCostUsd,
          usage_cap_usd: capUsd,
          usage_remaining_usd: seatRemainingUsd,
          usage_request_count: seatRequests,
          usage_token_count: seatTokens,
        };
      });
    } else {
      item.deployments = item.deployments.map((deploy) => ({
        ...deploy,
        usage_estimated_usd: null,
        usage_cap_usd: null,
        usage_remaining_usd: null,
        usage_request_count: null,
        usage_token_count: null,
      }));
    }

  }

  const isAdmin = session.user.role === "admin";
  const usageCreditSummary = await getUsageCreditSummaryUsd(session.user.id);
  const targetOpenClawVersion = (process.env.DEPLOY_OPENCLAW_VERSION ?? "").trim() || null;

  return NextResponse.json({
    subscriptions: result,
    is_admin: isAdmin,
    email: session.user.email,
    usage_credit_balance_usd: usageCreditSummary.balanceUsd,
    usage_credit_next_expires_at: usageCreditSummary.nextExpiresAt?.toISOString() ?? null,
    usage_credit_next_expiring_usd: usageCreditSummary.nextExpiringUsd,
    target_openclaw_version: targetOpenClawVersion,
  });
}
