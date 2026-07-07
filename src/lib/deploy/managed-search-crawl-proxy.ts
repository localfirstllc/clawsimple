import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { getIncludedManagedCreditsCapUsd, getExistingUnifiedCostUsd } from "@/lib/billing/managed-credits";
import { getManagedSearchCrawlCharge } from "@/lib/billing/managed-search-crawl";
import { consumeUsageCredits, getUsageCreditBalanceUsd } from "@/lib/billing/usage-credits";
import { getMonthlyUsageWindow, toDayStringUTC } from "@/lib/billing/usage-window";
import { getStripeClient } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import {
  billingSubscriptionItem,
  deployPresetUsageSeatDaily,
  installSessions,
} from "@/lib/db/schema";
import { hashDeployAgentToken } from "./agent-token";

const PERIOD_CACHE_TTL_MS = 5 * 60 * 1000;
const periodCache = new Map<
  string,
  { startMs: number; endMs: number; fetchedAt: number }
>();

export type ManagedProxySession = {
  id: string;
  seatId: string | null;
  userId: string | null;
  seatPlan: string | null;
  stripeSubscriptionItemId: string | null;
  serverFingerprint?: {
    server_ipv4?: string;
    server_ipv6?: string;
  } | null;
};

export type ManagedSearchCrawlChargeAssessment = {
  session: ManagedProxySession;
  seatIdentity: string;
  requestId: string;
  source: string;
  unitPriceUsd: number;
  creditsToChargeUsd: number;
};

export function buildManagedSearchCrawlUsageConflictSet(
  params: ManagedSearchCrawlChargeAssessment & {
    providerCostUsd?: number | null;
  }
) {
  const subscriptionItemId = params.session.stripeSubscriptionItemId ?? undefined;
  return {
    requestCount: sql`${deployPresetUsageSeatDaily.requestCount} + 1`,
    providerCostUsd: sql`${deployPresetUsageSeatDaily.providerCostUsd} + ${String(
      params.providerCostUsd ?? 0
    )}`,
    costEstimatedUsd: sql`${deployPresetUsageSeatDaily.costEstimatedUsd} + ${String(
      params.unitPriceUsd
    )}`,
    updatedAt: new Date(),
    sid: params.session.id,
    seatId: params.seatIdentity,
    ...(subscriptionItemId ? { subscriptionItemId } : {}),
    userId: params.session.userId ?? null,
    seatPlan: params.session.seatPlan ?? "unknown",
  };
}

export async function loadManagedProxySession(
  sid: string
): Promise<ManagedProxySession | null> {
  const rows = await db
    .select({
      id: installSessions.id,
      seatId: installSessions.seatId,
      userId: installSessions.userId,
      seatPlan: installSessions.seatPlan,
      stripeSubscriptionItemId: installSessions.stripeSubscriptionItemId,
      serverFingerprint: installSessions.serverFingerprint,
    })
    .from(installSessions)
    .where(
      and(
        eq(installSessions.id, sid),
        eq(installSessions.active, true),
        sql`${installSessions.seatStatus} IS DISTINCT FROM 'removed'`,
        sql`${installSessions.seatStatus} IS DISTINCT FROM 'failed'`,
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function loadManagedProxySessionByToken(
  token: string
): Promise<ManagedProxySession | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const rows = await db
    .select({
      id: installSessions.id,
      seatId: installSessions.seatId,
      userId: installSessions.userId,
      seatPlan: installSessions.seatPlan,
      stripeSubscriptionItemId: installSessions.stripeSubscriptionItemId,
      serverFingerprint: installSessions.serverFingerprint,
    })
    .from(installSessions)
    .where(
      and(
        eq(installSessions.deployAgentTokenHash, hashDeployAgentToken(trimmed)),
        eq(installSessions.active, true),
        sql`${installSessions.seatStatus} IS DISTINCT FROM 'removed'`,
        sql`${installSessions.seatStatus} IS DISTINCT FROM 'failed'`,
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getBillingPeriodForItem(
  subscriptionItemId: string
): Promise<{ startMs: number; endMs: number } | null> {
  const now = Date.now();
  const cached = periodCache.get(subscriptionItemId);
  if (cached && now - cached.fetchedAt < PERIOD_CACHE_TTL_MS) {
    return { startMs: cached.startMs, endMs: cached.endMs };
  }

  const dbRows = await db
    .select({
      currentPeriodStart: billingSubscriptionItem.currentPeriodStart,
      currentPeriodEnd: billingSubscriptionItem.currentPeriodEnd,
    })
    .from(billingSubscriptionItem)
    .where(eq(billingSubscriptionItem.stripeSubscriptionItemId, subscriptionItemId))
    .limit(1);
  const dbRow = dbRows[0];
  if (dbRow?.currentPeriodStart && dbRow?.currentPeriodEnd) {
    const resolved = {
      startMs: dbRow.currentPeriodStart.getTime(),
      endMs: dbRow.currentPeriodEnd.getTime(),
    };
    periodCache.set(subscriptionItemId, { ...resolved, fetchedAt: now });
    return resolved;
  }

  const stripe = getStripeClient();
  const item = (await stripe.subscriptionItems.retrieve(
    subscriptionItemId
  )) as Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  };

  if (item.current_period_start && item.current_period_end) {
    const resolved = {
      startMs: item.current_period_start * 1000,
      endMs: item.current_period_end * 1000,
    };
    periodCache.set(subscriptionItemId, { ...resolved, fetchedAt: now });
    return resolved;
  }

  const subscriptionId = item.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const normalized = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  if (!normalized.current_period_start || !normalized.current_period_end) {
    return null;
  }

  const resolved = {
    startMs: normalized.current_period_start * 1000,
    endMs: normalized.current_period_end * 1000,
  };
  periodCache.set(subscriptionItemId, { ...resolved, fetchedAt: now });
  return resolved;
}

export async function assessManagedSearchCrawlCharge(params: {
  session: ManagedProxySession;
  unitPriceUsd: number;
  requestId: string;
  source: string;
}): Promise<Response | ManagedSearchCrawlChargeAssessment | null> {
  const capUsd = getIncludedManagedCreditsCapUsd(params.session.seatPlan);
  if (capUsd === null || !params.session.stripeSubscriptionItemId) {
    return {
      session: params.session,
      seatIdentity: params.session.seatId ?? params.session.id,
      requestId: params.requestId,
      source: params.source,
      unitPriceUsd: params.unitPriceUsd,
      creditsToChargeUsd: 0,
    };
  }

  const period = await getBillingPeriodForItem(params.session.stripeSubscriptionItemId);
  if (!period) {
    return Response.json(
      {
        error: "usage_cap_unavailable",
        message: "Usage allowance is temporarily unavailable. Please retry shortly.",
        request_id: params.requestId,
      },
      { status: 503 }
    );
  }

  const usageWindow = getMonthlyUsageWindow(new Date(period.startMs));
  const startDay = toDayStringUTC(usageWindow.start);
  const endDay = toDayStringUTC(usageWindow.end);
  const seatIdentity = params.session.seatId ?? params.session.id;
  const existingCostUsd = await getExistingUnifiedCostUsd({
    seatIdentity,
    startDay,
    endDay,
  });
  const charge = getManagedSearchCrawlCharge({
    includedCapUsd: capUsd,
    existingCostUsd,
    unitPriceUsd: params.unitPriceUsd,
  });
  if (charge.exceedsIncludedCap && charge.creditsToChargeUsd > 0) {
    if (!params.session.userId) {
      return Response.json(
        {
          error: "usage_cap_exceeded",
          cap_usd: capUsd,
          projected_cost_usd: charge.projectedCostUsd,
          message:
            "This deployment has exhausted its included usage allowance for the current billing window.",
        },
        { status: 402 }
      );
    }

    const creditsBalanceUsd = await getUsageCreditBalanceUsd(params.session.userId);
    if (creditsBalanceUsd < charge.creditsToChargeUsd) {
      return Response.json(
        {
          error: "usage_cap_exceeded",
          cap_usd: capUsd,
          projected_cost_usd: charge.projectedCostUsd,
          credits_required_usd: charge.creditsToChargeUsd,
          credits_balance_usd: creditsBalanceUsd,
          message:
            "This deployment has exhausted its included usage allowance. Purchase extra credits or wait for the billing window to reset.",
        },
        { status: 402 }
      );
    }
  }

  return {
    session: params.session,
    seatIdentity,
    requestId: params.requestId,
    source: params.source,
    unitPriceUsd: params.unitPriceUsd,
    creditsToChargeUsd: charge.creditsToChargeUsd,
  };
}

export async function finalizeManagedSearchCrawlUsage(
  params: ManagedSearchCrawlChargeAssessment & {
    providerCostUsd?: number | null;
  }
) {
  if (
    params.creditsToChargeUsd > 0 &&
    params.session.userId &&
    params.session.stripeSubscriptionItemId
  ) {
    const consumeResult = await consumeUsageCredits({
      userId: params.session.userId,
      amountUsd: params.creditsToChargeUsd,
      sourceId: `managed-search-crawl:${params.source}:${params.session.id}:${params.requestId}`,
    });
    if (!consumeResult.consumed) {
      const creditsBalanceUsd = await getUsageCreditBalanceUsd(params.session.userId);
      throw Response.json(
        {
          error: "usage_cap_exceeded",
          credits_required_usd: params.creditsToChargeUsd,
          credits_balance_usd: creditsBalanceUsd,
          message:
            "Usage credits were exhausted before this request could be finalized. Please purchase extra credits and retry.",
        },
        { status: 402 }
      );
    }
  }

  if (!params.session.stripeSubscriptionItemId) return;

  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(deployPresetUsageSeatDaily)
    .values({
      sid: params.session.id,
      seatId: params.seatIdentity,
      subscriptionItemId: params.session.stripeSubscriptionItemId,
      day,
      userId: params.session.userId ?? null,
      seatPlan: params.session.seatPlan ?? "unknown",
      requestCount: 1,
      providerCostUsd: String(params.providerCostUsd ?? 0),
      costEstimatedUsd: String(params.unitPriceUsd),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        deployPresetUsageSeatDaily.seatId,
        deployPresetUsageSeatDaily.day,
      ],
      set: buildManagedSearchCrawlUsageConflictSet(params),
    });
}
