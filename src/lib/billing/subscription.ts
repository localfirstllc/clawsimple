import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingSubscriptionItem } from "@/lib/db/schema";
import { ensureBillingSubscriptionCache } from "@/lib/billing/subscription-cache";

const ACTIVE_STATUSES = ["active", "trialing"] as const;

export type BillingSubscriptionSnapshot = {
  subscriptionId: string;
  subscriptionItemId: string;
  status: string;
  priceId: string;
  currentPeriodEnd: Date | null;
  subscriptionCreatedAt: Date | null;
};

export async function getLatestSubscription(
  userId: string
): Promise<BillingSubscriptionSnapshot | null> {
  const { stripeCustomerId } = await ensureBillingSubscriptionCache(userId);
  if (!stripeCustomerId) return null;

  const rows = await db
    .select({
      subscriptionId: billingSubscriptionItem.stripeSubscriptionId,
      subscriptionItemId: billingSubscriptionItem.stripeSubscriptionItemId,
      status: billingSubscriptionItem.status,
      priceId: billingSubscriptionItem.priceId,
      currentPeriodEnd: billingSubscriptionItem.currentPeriodEnd,
      subscriptionCreatedAt: billingSubscriptionItem.subscriptionCreatedAt,
    })
    .from(billingSubscriptionItem)
    .where(
      and(
        eq(billingSubscriptionItem.userId, userId),
        eq(billingSubscriptionItem.stripeCustomerId, stripeCustomerId),
        isNull(billingSubscriptionItem.archivedAt)
      )
    )
    .orderBy(desc(billingSubscriptionItem.subscriptionCreatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveSubscription(
  userId: string
): Promise<BillingSubscriptionSnapshot | null> {
  const { stripeCustomerId } = await ensureBillingSubscriptionCache(userId);
  if (!stripeCustomerId) return null;

  const rows = await db
    .select({
      subscriptionId: billingSubscriptionItem.stripeSubscriptionId,
      subscriptionItemId: billingSubscriptionItem.stripeSubscriptionItemId,
      status: billingSubscriptionItem.status,
      priceId: billingSubscriptionItem.priceId,
      currentPeriodEnd: billingSubscriptionItem.currentPeriodEnd,
      subscriptionCreatedAt: billingSubscriptionItem.subscriptionCreatedAt,
    })
    .from(billingSubscriptionItem)
    .where(
      and(
        eq(billingSubscriptionItem.userId, userId),
        eq(billingSubscriptionItem.stripeCustomerId, stripeCustomerId),
        isNull(billingSubscriptionItem.archivedAt),
        inArray(billingSubscriptionItem.status, ACTIVE_STATUSES)
      )
    )
    .orderBy(desc(billingSubscriptionItem.subscriptionCreatedAt))
    .limit(1);
  return rows[0] ?? null;
}
