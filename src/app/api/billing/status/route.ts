import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import { getActiveSubscription, getLatestSubscription } from "@/lib/billing/subscription";
import {
  getSeatPlanPriceId,
  getSeatPlanPriceIds,
  resolveSeatMetaFromPriceId,
  resolveSeatPlan,
} from "@/lib/billing/plans";
import {
  getStripeCustomerId,
  hasDefaultPaymentMethod,
} from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { billingSubscriptionItem, installSessions } from "@/lib/db/schema";
import { ensureBillingSubscriptionCache, getProfileVisibleStatuses } from "@/lib/billing/subscription-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const seatPlanParam = request.nextUrl.searchParams.get("seat_plan");
  const billingIntervalParam = request.nextUrl.searchParams.get("billing_interval");
  const shouldCheckSeatAvailability = Boolean(seatPlanParam);
  const seatPlan = shouldCheckSeatAvailability
    ? resolveSeatPlan(seatPlanParam)
    : null;
  const billingInterval =
    billingIntervalParam === "year" ? "year" : "month";

  const activeSubscription = await getActiveSubscription(session.user.id);
  const latestSubscription = activeSubscription
    ? activeSubscription
    : await getLatestSubscription(session.user.id);
  const stripeCustomerId = await getStripeCustomerId(session.user.id);
  let paymentReady = false;
  if (stripeCustomerId) {
    try {
      paymentReady = await hasDefaultPaymentMethod(stripeCustomerId);
    } catch {
      paymentReady = false;
    }
  }

  let seatAvailability:
    | {
        seat_plan: string;
        billing_interval: "month" | "year";
        price_id: string;
        seat_capacity: number;
        active_deployments: number;
        needs_new_seat: boolean;
        subscription_id: string | null;
        subscription_item_id: string | null;
      }
    | null = null;

  if (shouldCheckSeatAvailability && seatPlan && stripeCustomerId) {
    await ensureBillingSubscriptionCache(session.user.id, { stripeCustomerId });
    const priceIds = getSeatPlanPriceIds(seatPlan, billingInterval);
    const fallbackPriceId = getSeatPlanPriceId(seatPlan, billingInterval);
    if (priceIds.length > 0) {
      const rows = await db
        .select({
          subscriptionId: billingSubscriptionItem.stripeSubscriptionId,
          subscriptionItemId: billingSubscriptionItem.stripeSubscriptionItemId,
          quantity: billingSubscriptionItem.quantity,
          priceId: billingSubscriptionItem.priceId,
          subscriptionCreatedAt: billingSubscriptionItem.subscriptionCreatedAt,
        })
        .from(billingSubscriptionItem)
        .where(
          and(
            eq(billingSubscriptionItem.userId, session.user.id),
            eq(billingSubscriptionItem.stripeCustomerId, stripeCustomerId),
            isNull(billingSubscriptionItem.archivedAt),
            inArray(billingSubscriptionItem.status, getProfileVisibleStatuses()),
            inArray(billingSubscriptionItem.priceId, priceIds)
          )
        )
        .orderBy(desc(billingSubscriptionItem.subscriptionCreatedAt))
        .limit(100);

      if (rows.length === 0) {
        seatAvailability = {
          seat_plan: seatPlan,
          billing_interval: billingInterval,
          price_id: fallbackPriceId,
          seat_capacity: 0,
          active_deployments: 0,
          needs_new_seat: true,
          subscription_id: null,
          subscription_item_id: null,
        };
      } else {
        const itemIds = rows.map((row) => row.subscriptionItemId);
        const activeRows = await db
          .select({
            subscriptionItemId: installSessions.stripeSubscriptionItemId,
          })
          .from(installSessions)
          .where(
            and(
              eq(installSessions.userId, session.user.id),
              eq(installSessions.active, true),
              inArray(installSessions.stripeSubscriptionItemId, itemIds)
            )
          );

        const activeByItem = new Map<string, number>();
        for (const row of activeRows) {
          const key = row.subscriptionItemId;
          if (!key) continue;
          activeByItem.set(key, (activeByItem.get(key) ?? 0) + 1);
        }

        const items = rows
          .map((row) => {
            const quantity = row.quantity ?? 0;
            const active = activeByItem.get(row.subscriptionItemId) ?? 0;
            return {
              ...row,
              quantity,
              active,
              available: Math.max(0, quantity - active),
            };
          })
          .sort((a, b) => (b.subscriptionCreatedAt?.getTime() ?? 0) - (a.subscriptionCreatedAt?.getTime() ?? 0));

        const preferredWithSeat = items.find((item) => item.available > 0) ?? null;
        const preferred = preferredWithSeat ?? items[0];
        const seatCapacity = items.reduce((sum, item) => sum + item.quantity, 0);
        const activeDeployments = items.reduce((sum, item) => sum + item.active, 0);

        seatAvailability = {
          seat_plan: seatPlan,
          billing_interval: billingInterval,
          price_id: preferred.priceId || fallbackPriceId,
          seat_capacity: seatCapacity,
          active_deployments: activeDeployments,
          needs_new_seat: activeDeployments >= seatCapacity,
          subscription_id: preferred.subscriptionId,
          subscription_item_id: preferred.subscriptionItemId,
        };
      }
    }
  }

  return NextResponse.json({
    active: Boolean(activeSubscription),
    payment_ready: paymentReady,
    subscription: latestSubscription
      ? {
          id: latestSubscription.subscriptionId,
          plan:
            resolveSeatMetaFromPriceId(latestSubscription.priceId)?.seatPlan ?? "seat-standard",
          status: latestSubscription.status,
          periodEnd: latestSubscription.currentPeriodEnd
            ? latestSubscription.currentPeriodEnd.toISOString()
            : null,
        }
      : null,
    seat_availability: seatAvailability,
  });
}
