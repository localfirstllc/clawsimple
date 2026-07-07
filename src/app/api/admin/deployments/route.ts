import { and, count, desc, eq, ilike, inArray, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import {
  adminCustomerNotes,
  billingSubscriptionItem,
  deploymentAgentJobs,
  deployPresetUsageSeatDaily,
  installSessions,
  user,
} from "@/lib/db/schema";
import { getIncludedManagedCreditsCapUsd } from "@/lib/billing/managed-credits";
import {
  getRunnerRevision,
  getRunnerScriptSource,
  getRunnerVersion,
} from "@/lib/deploy/runner-script-source";
import { fetchLatestOpenClawVersion } from "@/lib/openclaw/releases";
import { ensureBillingSubscriptionCache } from "@/lib/billing/subscription-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIntParam(raw: string | null, fallback: number) {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clampPageSize(size: number) {
  if (size < 1) return 1;
  if (size > 200) return 200;
  return size;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function getSeatCapUsd(seatPlan: string | null) {
  return getIncludedManagedCreditsCapUsd(seatPlan);
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const status = params.get("status")?.trim() ?? "";
  const onlyActive = params.get("only_active") !== "0";
  const orphaned = params.get("orphaned");
  const page = Math.max(1, parseIntParam(params.get("page"), 1));
  const pageSize = clampPageSize(parseIntParam(params.get("page_size"), 50));
  const offset = (page - 1) * pageSize;

  const whereClauses: SQL[] = [];

  if (onlyActive) {
    whereClauses.push(eq(installSessions.active, true));
  }

  if (status) {
    whereClauses.push(eq(installSessions.status, status as typeof installSessions.status.enumValues[number]));
  }

  const orphanedClause = and(
    eq(installSessions.active, true),
    isNull(installSessions.stripeSubscriptionItemId)
  )!;
  if (orphaned === "1") {
    whereClauses.push(orphanedClause);
  } else if (orphaned === "0") {
    whereClauses.push(not(orphanedClause));
  }

  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    whereClauses.push(
      or(
        ilike(installSessions.id, pattern),
        ilike(installSessions.displayName, pattern),
        ilike(user.email, pattern)
      )!
    );
  }

  const where = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        sid: installSessions.id,
        userId: installSessions.userId,
        userEmail: user.email,
        status: installSessions.status,
        displayName: installSessions.displayName,
        seatPlan: installSessions.seatPlan,
        seatId: installSessions.seatId,
        stripeSubscriptionItemId: installSessions.stripeSubscriptionItemId,
        active: installSessions.active,
        seatStatus: installSessions.seatStatus,
        seatRemoveAt: installSessions.seatRemoveAt,
        createdAt: installSessions.createdAt,
        completedAt: installSessions.completedAt,
        serverFingerprint: installSessions.serverFingerprint,
      })
      .from(installSessions)
      .leftJoin(user, eq(installSessions.userId, user.id))
      .where(where)
      .orderBy(desc(installSessions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(installSessions)
      .leftJoin(user, eq(installSessions.userId, user.id))
      .where(where),
  ]);

  const total = totalRows[0]?.total ?? 0;
  const sids = rows.map((row) => row.sid);
  const userIds = Array.from(
    new Set(
      rows
        .map((row) => row.userId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
  const seatIds = Array.from(
    new Set(
      rows
        .map((row) => row.seatId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
  const subscriptionItemIds = Array.from(
    new Set(
      rows
        .map((row) => row.stripeSubscriptionItemId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
  );

  if (userIds.length > 0) {
    await Promise.all(
      userIds.map((userId) =>
        ensureBillingSubscriptionCache(userId).catch(() => ({ stripeCustomerId: null, synced: false }))
      )
    );
  }

  const usageTargetClause =
    seatIds.length > 0
      ? or(
          inArray(deployPresetUsageSeatDaily.seatId, seatIds),
          inArray(deployPresetUsageSeatDaily.sid, sids)
        )
      : inArray(deployPresetUsageSeatDaily.sid, sids);

  const [periodRows, usageRows, runnerJobRows, upgradeJobRows] =
    sids.length > 0 && subscriptionItemIds.length > 0
      ? await Promise.all([
          db
            .select({
              subscriptionItemId: billingSubscriptionItem.stripeSubscriptionItemId,
              currentPeriodStart: billingSubscriptionItem.currentPeriodStart,
              currentPeriodEnd: billingSubscriptionItem.currentPeriodEnd,
              cancelAtPeriodEnd: billingSubscriptionItem.cancelAtPeriodEnd,
              cancelAt: billingSubscriptionItem.cancelAt,
            })
            .from(billingSubscriptionItem)
            .where(
              inArray(
                billingSubscriptionItem.stripeSubscriptionItemId,
                subscriptionItemIds
              )
            ),
          db
            .select({
              usageKey:
                sql<string>`coalesce(${deployPresetUsageSeatDaily.seatId}, ${deployPresetUsageSeatDaily.sid})`,
              usageCostUsd:
                sql<string>`coalesce(sum(${deployPresetUsageSeatDaily.costEstimatedUsd}), 0)::text`,
              usageRequests:
                sql<number>`coalesce(sum(${deployPresetUsageSeatDaily.requestCount}), 0)::int`,
            })
            .from(deployPresetUsageSeatDaily)
            .innerJoin(
              billingSubscriptionItem,
              eq(
                deployPresetUsageSeatDaily.subscriptionItemId,
                billingSubscriptionItem.stripeSubscriptionItemId
              )
            )
            .where(
              and(
                usageTargetClause,
                sql`${billingSubscriptionItem.currentPeriodStart} is not null`,
                sql`${billingSubscriptionItem.currentPeriodEnd} is not null`,
                sql`${deployPresetUsageSeatDaily.day} >= (${billingSubscriptionItem.currentPeriodStart} at time zone 'utc')::date`,
                sql`${deployPresetUsageSeatDaily.day} <= (${billingSubscriptionItem.currentPeriodEnd} at time zone 'utc')::date`
              )
            )
            .groupBy(sql`coalesce(${deployPresetUsageSeatDaily.seatId}, ${deployPresetUsageSeatDaily.sid})`),
          db
            .select({
              sid: deploymentAgentJobs.sid,
              id: deploymentAgentJobs.id,
              status: deploymentAgentJobs.status,
              errorMessage: deploymentAgentJobs.errorMessage,
              updatedAt: deploymentAgentJobs.updatedAt,
            })
            .from(deploymentAgentJobs)
            .where(
              and(
                inArray(deploymentAgentJobs.sid, sids),
                eq(deploymentAgentJobs.jobType, "runner_refresh")
              )
            ),
          db
            .select({
              sid: deploymentAgentJobs.sid,
              id: deploymentAgentJobs.id,
              status: deploymentAgentJobs.status,
              errorMessage: deploymentAgentJobs.errorMessage,
              updatedAt: deploymentAgentJobs.updatedAt,
            })
            .from(deploymentAgentJobs)
            .where(
              and(
                inArray(deploymentAgentJobs.sid, sids),
                eq(deploymentAgentJobs.jobType, "openclaw_upgrade")
              )
            ),
        ])
      : sids.length > 0
        ? await Promise.all([
            Promise.resolve([]),
            Promise.resolve([]),
            db
              .select({
                sid: deploymentAgentJobs.sid,
                id: deploymentAgentJobs.id,
                status: deploymentAgentJobs.status,
                errorMessage: deploymentAgentJobs.errorMessage,
                updatedAt: deploymentAgentJobs.updatedAt,
              })
              .from(deploymentAgentJobs)
              .where(
                and(
                  inArray(deploymentAgentJobs.sid, sids),
                  eq(deploymentAgentJobs.jobType, "runner_refresh")
                )
              ),
            db
              .select({
                sid: deploymentAgentJobs.sid,
                id: deploymentAgentJobs.id,
                status: deploymentAgentJobs.status,
                errorMessage: deploymentAgentJobs.errorMessage,
                updatedAt: deploymentAgentJobs.updatedAt,
              })
              .from(deploymentAgentJobs)
              .where(
                and(
                  inArray(deploymentAgentJobs.sid, sids),
                  eq(deploymentAgentJobs.jobType, "openclaw_upgrade")
                )
              ),
          ])
        : [[], [], [], []];

  const noteRows =
    userIds.length > 0
      ? await db
          .select({
            userId: adminCustomerNotes.userId,
            note: adminCustomerNotes.note,
            updatedAt: adminCustomerNotes.updatedAt,
          })
          .from(adminCustomerNotes)
          .where(inArray(adminCustomerNotes.userId, userIds))
      : [];

  const periodByItemId = new Map(
    periodRows.map((row) => [row.subscriptionItemId, row])
  );
  const noteByUserId = new Map(
    noteRows.map((row) => [
      row.userId,
      {
        note: row.note,
        updatedAt: row.updatedAt,
      },
    ])
  );
  const usageBySid = new Map(
    usageRows.map((row) => [
      row.usageKey,
      {
        usageCostUsd: Number(row.usageCostUsd ?? "0"),
        usageRequests: row.usageRequests ?? 0,
      },
    ])
  );
  const latestRunnerJobBySid = new Map<
    string,
    {
      status: string;
      errorMessage: string | null;
      updatedAt: Date;
    }
  >();
  for (const row of runnerJobRows) {
    const existing = latestRunnerJobBySid.get(row.sid);
    if (!existing || row.updatedAt > existing.updatedAt) {
      latestRunnerJobBySid.set(row.sid, {
        status: row.status,
        errorMessage: row.errorMessage ?? null,
        updatedAt: row.updatedAt,
      });
    }
  }
  const latestUpgradeJobBySid = new Map<
    string,
    {
      status: string;
      errorMessage: string | null;
      updatedAt: Date;
    }
  >();
  for (const row of upgradeJobRows) {
    const existing = latestUpgradeJobBySid.get(row.sid);
    if (!existing || row.updatedAt > existing.updatedAt) {
      latestUpgradeJobBySid.set(row.sid, {
        status: row.status,
        errorMessage: row.errorMessage ?? null,
        updatedAt: row.updatedAt,
      });
    }
  }
  const latestRunnerScript = await getRunnerScriptSource();
  const latestRunnerVersion = getRunnerVersion(latestRunnerScript) || "unknown";
  const latestRunnerRevision = getRunnerRevision(latestRunnerScript) || "unknown";
  const latestOpenClawVersion = await fetchLatestOpenClawVersion().catch(() => null);

  const items = rows.map((row) => {
    const isOrphaned = row.active && !row.stripeSubscriptionItemId;
    const isScheduledForRemoval = row.seatStatus === "pending_remove" && row.seatRemoveAt !== null;
    const wasRemovedAtPeriodEnd =
      !row.active && row.seatStatus === "removed" && row.stripeSubscriptionItemId !== null;
    const period =
      row.stripeSubscriptionItemId != null
        ? periodByItemId.get(row.stripeSubscriptionItemId)
        : undefined;
    const cancelAt = period?.cancelAt ?? null;
    const cancelAtPeriodEnd = period?.cancelAtPeriodEnd === true;
    // Prefer Stripe's absolute cancel_at timestamp when available.
    // Fall back to period_end only when the subscription is marked cancel_at_period_end.
    const nonRenewAt = cancelAt ?? (cancelAtPeriodEnd ? period?.currentPeriodEnd ?? null : null);
    const willNotRenew = nonRenewAt !== null;
    const usageIdentity = row.seatId ?? row.sid;
    const usage = usageBySid.get(usageIdentity);
    const usageCurrentPeriodUsd = usage?.usageCostUsd ?? 0;
    const usageCurrentPeriodRequests = usage?.usageRequests ?? 0;
    const usageCapUsd = getSeatCapUsd(row.seatPlan);
    const usageRemainingUsd =
      typeof usageCapUsd === "number"
        ? Math.max(0, usageCapUsd - usageCurrentPeriodUsd)
        : null;

    const fingerprint =
      row.serverFingerprint && typeof row.serverFingerprint === "object"
        ? (row.serverFingerprint as {
            server_ipv4?: string;
            runtime_mode?: string;
            runner_revision?: string;
            runner_label?: string;
            runner_version?: string;
            gateway_service_active?: boolean;
            openclaw_version?: string;
          })
        : null;
    const runnerRevision =
      typeof fingerprint?.runner_revision === "string" &&
      fingerprint.runner_revision.trim().length > 0
        ? fingerprint.runner_revision.trim()
        : null;
    const runnerLabel =
      typeof fingerprint?.runner_label === "string" && fingerprint.runner_label.trim().length > 0
        ? fingerprint.runner_label.trim()
        : null;
    const runnerVersion =
      typeof fingerprint?.runner_version === "string" && fingerprint.runner_version.trim().length > 0
        ? fingerprint.runner_version.trim()
        : null;
    const runnerDisplayVersion = runnerLabel ?? runnerVersion;
    const runnerUpToDate =
      runnerRevision !== null && latestRunnerRevision !== "unknown"
        ? runnerRevision === latestRunnerRevision
        : runnerDisplayVersion !== null &&
          latestRunnerVersion !== "unknown" &&
          runnerDisplayVersion === latestRunnerVersion;
    const latestRunnerJob = latestRunnerJobBySid.get(row.sid);
    const latestUpgradeJob = latestUpgradeJobBySid.get(row.sid);
    const customerNote =
      row.userId != null ? noteByUserId.get(row.userId) : undefined;

    return {
      sid: row.sid,
      user_id: row.userId,
      user_email: row.userEmail,
      customer_note: customerNote?.note ?? null,
      customer_note_updated_at: customerNote?.updatedAt?.toISOString() ?? null,
      status: row.status,
      display_name: row.displayName,
      seat_plan: row.seatPlan,
      stripe_subscription_item_id: row.stripeSubscriptionItemId,
      is_active: row.active,
      is_orphaned: isOrphaned,
      is_scheduled_for_removal: isScheduledForRemoval,
      was_removed_at_period_end: wasRemovedAtPeriodEnd,
      server_ipv4: fingerprint?.server_ipv4 ?? null,
      runtime_mode:
        typeof fingerprint?.runtime_mode === "string" ? fingerprint.runtime_mode : null,
      openclaw_version:
        typeof fingerprint?.openclaw_version === "string"
          ? fingerprint.openclaw_version
          : null,
      gateway_service_active:
        typeof fingerprint?.gateway_service_active === "boolean"
          ? fingerprint.gateway_service_active
          : null,
      runner_revision: runnerRevision,
      runner_label: runnerLabel,
      runner_version: runnerDisplayVersion,
      runner_up_to_date: runnerUpToDate,
      usage_current_period_usd: usageCurrentPeriodUsd,
      usage_current_period_requests: usageCurrentPeriodRequests,
      usage_cap_usd: usageCapUsd,
      usage_remaining_usd: usageRemainingUsd,
      billing_period_start: period?.currentPeriodStart?.toISOString() ?? null,
      billing_period_end: period?.currentPeriodEnd?.toISOString() ?? null,
      will_not_renew: willNotRenew,
      non_renew_at: nonRenewAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
      completed_at: row.completedAt?.toISOString() ?? null,
      runner_job_status: latestRunnerJob?.status ?? null,
      runner_job_updated_at: latestRunnerJob?.updatedAt?.toISOString() ?? null,
      runner_job_error: latestRunnerJob?.errorMessage ?? null,
      upgrade_job_status: latestUpgradeJob?.status ?? null,
      upgrade_job_updated_at: latestUpgradeJob?.updatedAt?.toISOString() ?? null,
      upgrade_job_error: latestUpgradeJob?.errorMessage ?? null,
    };
  });

  return NextResponse.json({
    items,
    latest_runner_revision: latestRunnerRevision,
    latest_runner_version: latestRunnerVersion,
    latest_openclaw_version: latestOpenClawVersion,
    page,
    page_size: pageSize,
    total,
  });
}
