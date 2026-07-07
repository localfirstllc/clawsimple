import Stripe from "stripe";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingCustomerCache,
  billingSubscription,
  billingSubscriptionItem,
} from "@/lib/db/schema";
import { getStripeClient, getStripeCustomerId } from "@/lib/billing/stripe";

const DEFAULT_TTL_SECONDS = 300;

const PROFILE_VISIBLE_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "incomplete",
]);

function getCacheTtlMs() {
  const raw = process.env.STRIPE_SUBSCRIPTION_CACHE_TTL_SECONDS;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_SECONDS;
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TTL_SECONDS;
  return safe * 1000;
}

function toTs(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000);
}

function computeCanceling(sub: Stripe.Subscription) {
  let canceling = Boolean(sub.cancel_at_period_end);
  if (!canceling && sub.cancel_at) canceling = true;

  if (!canceling && sub.schedule && typeof sub.schedule === "object") {
    const schedule = sub.schedule as unknown as { end_behavior?: string; status?: string };
    if (schedule.end_behavior === "cancel" && schedule.status === "active") {
      canceling = true;
    }
  }

  return canceling;
}

async function getLastSyncedAt(userId: string, stripeCustomerId: string) {
  const rows = await db
    .select({
      last: billingCustomerCache.lastSyncedAt,
    })
    .from(billingCustomerCache)
    .where(
      and(
        eq(billingCustomerCache.userId, userId),
        eq(billingCustomerCache.stripeCustomerId, stripeCustomerId)
      )
    )
    .limit(1);
  return rows[0]?.last ?? null;
}

async function touchCacheState(params: {
  userId: string;
  stripeCustomerId: string;
  now: Date;
}) {
  await db
    .insert(billingCustomerCache)
    .values({
      userId: params.userId,
      stripeCustomerId: params.stripeCustomerId,
      lastSyncedAt: params.now,
      updatedAt: params.now,
    })
    .onConflictDoUpdate({
      target: [billingCustomerCache.userId, billingCustomerCache.stripeCustomerId],
      set: {
        lastSyncedAt: params.now,
        updatedAt: params.now,
      },
    });
}

export async function ensureBillingSubscriptionCache(
  userId: string,
  opts?: { force?: boolean; stripeCustomerId?: string | null }
) {
  const stripeCustomerId =
    typeof opts?.stripeCustomerId === "string" || opts?.stripeCustomerId === null
      ? opts.stripeCustomerId
      : await getStripeCustomerId(userId);
  if (!stripeCustomerId) {
    return { stripeCustomerId: null, synced: false };
  }

  if (!opts?.force) {
    const last = await getLastSyncedAt(userId, stripeCustomerId);
    if (last) {
      const ageMs = Date.now() - last.getTime();
      if (ageMs >= 0 && ageMs < getCacheTtlMs()) {
        return { stripeCustomerId, synced: false };
      }
    }
  }

  await syncBillingSubscriptionsFromStripe({ userId, stripeCustomerId });
  return { stripeCustomerId, synced: true };
}

export async function syncBillingSubscriptionsFromStripe(params: {
  userId: string;
  stripeCustomerId: string;
}) {
  const stripe = getStripeClient();
  const now = new Date();

  let subscriptions: Stripe.ApiList<Stripe.Subscription>;
  try {
    subscriptions = await stripe.subscriptions.list({
      customer: params.stripeCustomerId,
      status: "all",
      limit: 100,
      expand: ["data.items.data.price", "data.schedule"],
    });
  } catch (err) {
    const stripeError = err as { code?: string };
    if (stripeError.code === "resource_missing") {
      // Customer was deleted / DB out of sync. Treat as no subscriptions and archive cached items.
      await db
        .update(billingSubscriptionItem)
        .set({ archivedAt: now, updatedAt: now, lastSyncedAt: now })
        .where(
          and(
            eq(billingSubscriptionItem.userId, params.userId),
            eq(billingSubscriptionItem.stripeCustomerId, params.stripeCustomerId),
            isNull(billingSubscriptionItem.archivedAt)
          )
        );
      await touchCacheState({ userId: params.userId, stripeCustomerId: params.stripeCustomerId, now });
      return;
    }
    throw err;
  }

  const seenItemIds = new Set<string>();

  for (const sub of subscriptions.data) {
    const canceling = computeCanceling(sub);

    await db
      .insert(billingSubscription)
      .values({
        stripeSubscriptionId: sub.id,
        userId: params.userId,
        stripeCustomerId: params.stripeCustomerId,
        status: sub.status,
        stripeCreatedAt: toTs(sub.created),
        cancelAtPeriodEnd: canceling,
        cancelAt: toTs(sub.cancel_at),
        canceledAt: toTs(sub.canceled_at),
        endedAt: toTs(sub.ended_at),
        lastSyncedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: billingSubscription.stripeSubscriptionId,
        set: {
          userId: params.userId,
          stripeCustomerId: params.stripeCustomerId,
          status: sub.status,
          stripeCreatedAt: toTs(sub.created),
          cancelAtPeriodEnd: canceling,
          cancelAt: toTs(sub.cancel_at),
          canceledAt: toTs(sub.canceled_at),
          endedAt: toTs(sub.ended_at),
          lastSyncedAt: now,
          updatedAt: now,
        },
      });

    for (const item of sub.items.data) {
      seenItemIds.add(item.id);
      await db
        .insert(billingSubscriptionItem)
        .values({
          stripeSubscriptionItemId: item.id,
          stripeSubscriptionId: sub.id,
          userId: params.userId,
          stripeCustomerId: params.stripeCustomerId,
          status: sub.status,
          subscriptionCreatedAt: toTs(sub.created),
          cancelAtPeriodEnd: canceling,
          cancelAt: toTs(sub.cancel_at),
          priceId: item.price.id,
          quantity: item.quantity ?? 0,
          currentPeriodStart: toTs(item.current_period_start),
          currentPeriodEnd: toTs(item.current_period_end),
          archivedAt: null,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: billingSubscriptionItem.stripeSubscriptionItemId,
          set: {
            stripeSubscriptionId: sub.id,
            userId: params.userId,
            stripeCustomerId: params.stripeCustomerId,
            status: sub.status,
            subscriptionCreatedAt: toTs(sub.created),
            cancelAtPeriodEnd: canceling,
            cancelAt: toTs(sub.cancel_at),
            priceId: item.price.id,
            quantity: item.quantity ?? 0,
            currentPeriodStart: toTs(item.current_period_start),
            currentPeriodEnd: toTs(item.current_period_end),
            archivedAt: null,
            lastSyncedAt: now,
            updatedAt: now,
          },
        });
    }
  }

  // Archive items no longer present in Stripe for this customer.
  const existing = await db
    .select({ id: billingSubscriptionItem.stripeSubscriptionItemId })
    .from(billingSubscriptionItem)
    .where(
      and(
        eq(billingSubscriptionItem.userId, params.userId),
        eq(billingSubscriptionItem.stripeCustomerId, params.stripeCustomerId),
        isNull(billingSubscriptionItem.archivedAt)
      )
    );
  const toArchive = existing
    .map((row) => row.id)
    .filter((id) => !seenItemIds.has(id));

  if (toArchive.length > 0) {
    await db
      .update(billingSubscriptionItem)
      .set({ archivedAt: now, updatedAt: now, lastSyncedAt: now })
      .where(inArray(billingSubscriptionItem.stripeSubscriptionItemId, toArchive));
  }

  await touchCacheState({ userId: params.userId, stripeCustomerId: params.stripeCustomerId, now });
}

export async function listCachedSubscriptionItemsForUser(params: {
  userId: string;
  stripeCustomerId: string;
  statuses?: string[];
}) {
  const statusFilter =
    params.statuses && params.statuses.length > 0
      ? inArray(billingSubscriptionItem.status, params.statuses)
      : undefined;
  const rows = await db
    .select()
    .from(billingSubscriptionItem)
    .where(
      and(
        eq(billingSubscriptionItem.userId, params.userId),
        eq(billingSubscriptionItem.stripeCustomerId, params.stripeCustomerId),
        isNull(billingSubscriptionItem.archivedAt),
        ...(statusFilter ? [statusFilter] : [])
      )
    )
    .orderBy(desc(billingSubscriptionItem.subscriptionCreatedAt));
  return rows;
}

export function getProfileVisibleStatuses() {
  return Array.from(PROFILE_VISIBLE_STATUSES);
}
