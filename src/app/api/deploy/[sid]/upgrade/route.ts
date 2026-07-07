import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getSeatPlanPriceId, resolveSeatMetaFromPriceId } from "@/lib/billing/plans";
import { ensureBillingSubscriptionCache } from "@/lib/billing/subscription-cache";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import { getStripeClient, upsertSeatPlanChangeSchedule } from "@/lib/billing/stripe";
import { getRequestSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpgradeBody = {
  target_seat_plan?: string;
};

type ManagedSeatPlan = "seat-standard" | "seat-max";
type BillingInterval = "month" | "year";

function isManagedSeatPlan(value: unknown): value is ManagedSeatPlan {
  return value === "seat-standard" || value === "seat-max";
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

  const body = (await request.json().catch(() => null)) as UpgradeBody | null;
  const targetSeatPlan = body?.target_seat_plan;
  if (!isManagedSeatPlan(targetSeatPlan)) {
    return NextResponse.json(
      { error: "target_seat_plan must be seat-standard or seat-max" },
      { status: 400 }
    );
  }

  const rows = await db
    .select()
    .from(installSessions)
    .where(and(eq(installSessions.id, sid), eq(installSessions.userId, session.user.id)))
    .limit(1);
  const deploySession = rows[0];
  if (!deploySession) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (deploySession.status !== "completed") {
    return NextResponse.json(
      { error: "only completed seats can change plan" },
      { status: 409 }
    );
  }
  if (deploySession.seatStatus === "pending_remove" || deploySession.seatStatus === "removed") {
    return NextResponse.json(
      { error: "seat is pending removal or removed" },
      { status: 409 }
    );
  }
  if (!deploySession.stripeSubscriptionId || !deploySession.stripeSubscriptionItemId) {
    return NextResponse.json({ error: "subscription not linked" }, { status: 400 });
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(
    deploySession.stripeSubscriptionId,
    { expand: ["items.data.price"] }
  );

  const sourceItem = subscription.items.data.find(
    (item) => item.id === deploySession.stripeSubscriptionItemId
  );
  if (!sourceItem) {
    return NextResponse.json({ error: "subscription item not found" }, { status: 404 });
  }

  const sourceRecurring = sourceItem.price.recurring;
  const sourceInterval =
    sourceRecurring?.interval === "year" ? "year" : sourceRecurring?.interval === "month" ? "month" : null;
  if (!sourceInterval) {
    return NextResponse.json({ error: "unsupported billing interval" }, { status: 400 });
  }

  const sourcePriceId = sourceItem.price.id;
  const sourceMeta = resolveSeatMetaFromPriceId(sourcePriceId);
  const sourceSeatPlan =
    sourceMeta?.seatPlan ??
    (deploySession.seatPlan === "seat-standard" || deploySession.seatPlan === "seat-max"
      ? deploySession.seatPlan
      : null);
  if (!sourceSeatPlan || !isManagedSeatPlan(sourceSeatPlan)) {
    return NextResponse.json(
      { error: "only standard/max seats can change plan" },
      { status: 409 }
    );
  }
  const existingPendingPlan = isManagedSeatPlan(deploySession.pendingSeatPlan)
    ? deploySession.pendingSeatPlan
    : null;
  const shouldClearPending = targetSeatPlan === sourceSeatPlan;
  if (shouldClearPending && !existingPendingPlan) {
    return NextResponse.json({ error: "seat already on target plan" }, { status: 409 });
  }

  const siblingSeats = await db
    .select({
      sid: installSessions.id,
      seatStatus: installSessions.seatStatus,
      subscriptionItemId: installSessions.stripeSubscriptionItemId,
      pendingSeatPlan: installSessions.pendingSeatPlan,
    })
    .from(installSessions)
    .where(
      and(
        eq(installSessions.userId, session.user.id),
        eq(installSessions.active, true),
        eq(installSessions.stripeSubscriptionId, deploySession.stripeSubscriptionId)
      )
    );

  if (siblingSeats.some((seat) => seat.seatStatus === "pending_remove")) {
    return NextResponse.json(
      { error: "cannot change plan while seat removal is pending in this subscription" },
      { status: 409 }
    );
  }

  const pendingBySid = new Map<string, ManagedSeatPlan>();
  for (const seat of siblingSeats) {
    if (isManagedSeatPlan(seat.pendingSeatPlan)) {
      pendingBySid.set(seat.sid, seat.pendingSeatPlan);
    }
  }
  if (shouldClearPending) {
    pendingBySid.delete(sid);
  } else {
    pendingBySid.set(sid, targetSeatPlan);
  }

  const itemMap = new Map(subscription.items.data.map((item) => [item.id, item]));
  const desiredChanges: Array<{ sourceItemId: string; targetPriceId: string }> = [];
  for (const seat of siblingSeats) {
    const pendingPlan = pendingBySid.get(seat.sid);
    if (!pendingPlan) continue;
    const sourceItemId = seat.subscriptionItemId;
    if (!sourceItemId) {
      return NextResponse.json({ error: "subscription item not linked" }, { status: 400 });
    }
    const sourceSeatItem = itemMap.get(sourceItemId);
    if (!sourceSeatItem) {
      return NextResponse.json({ error: "source subscription item not found" }, { status: 404 });
    }
    const recurring = sourceSeatItem.price.recurring;
    const interval: BillingInterval | null =
      recurring?.interval === "month"
        ? "month"
        : recurring?.interval === "year"
          ? "year"
          : null;
    if (!interval) {
      return NextResponse.json({ error: "unsupported billing interval" }, { status: 400 });
    }
    const targetPriceId = getSeatPlanPriceId(pendingPlan, interval);
    if (!targetPriceId) {
      return NextResponse.json({ error: "target price is not configured" }, { status: 500 });
    }
    desiredChanges.push({ sourceItemId, targetPriceId });
  }

  let scheduleResult: Awaited<ReturnType<typeof upsertSeatPlanChangeSchedule>>;
  try {
    scheduleResult = await upsertSeatPlanChangeSchedule({
      subscriptionId: deploySession.stripeSubscriptionId,
      desiredChanges,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "");
    const maybeStatus = (err as { statusCode?: number } | null)?.statusCode;
    const status =
      typeof maybeStatus === "number" && maybeStatus >= 400 && maybeStatus < 500
        ? maybeStatus
        : 500;
    return NextResponse.json(
      { error: "schedule_plan_change_failed", details: message },
      { status }
    );
  }

  await db
    .update(installSessions)
    .set({
      pendingSeatPlan: shouldClearPending ? null : targetSeatPlan,
      pendingSeatEffectiveAt: shouldClearPending ? null : scheduleResult.currentPeriodEnd,
    })
    .where(eq(installSessions.id, sid));

  await ensureBillingSubscriptionCache(session.user.id, { force: true });

  return NextResponse.json({
    ok: true,
    sid,
    seat_plan: sourceSeatPlan,
    pending_seat_plan: shouldClearPending ? null : targetSeatPlan,
    pending_effective_at: shouldClearPending
      ? null
      : scheduleResult.currentPeriodEnd.toISOString(),
    billing_interval: sourceInterval,
    subscription_item_id: deploySession.stripeSubscriptionItemId,
  });
}
