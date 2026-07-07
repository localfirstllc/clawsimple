import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import { upsertSeatRemovalSchedule } from "@/lib/billing/stripe";
import { getRequestSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const authSession = await getRequestSession(request.headers);
  if (!authSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);
  const session = rows[0];
  if (!session || session.userId !== authSession.user.id) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (!session.stripeSubscriptionId || !session.stripeSubscriptionItemId) {
    return NextResponse.json(
      { error: "subscription not linked" },
      { status: 400 }
    );
  }

  let scheduleResult: Awaited<ReturnType<typeof upsertSeatRemovalSchedule>>;
  try {
    scheduleResult = await upsertSeatRemovalSchedule({
      subscriptionId: session.stripeSubscriptionId,
      subscriptionItemId: session.stripeSubscriptionItemId,
      pendingCount: 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "");
    const maybeStatus = (err as { statusCode?: number } | null)?.statusCode;
    const status =
      typeof maybeStatus === "number" && maybeStatus >= 400 && maybeStatus < 500
        ? maybeStatus
        : 500;
    return NextResponse.json(
      { error: "schedule_removal_failed", details: message },
      { status }
    );
  }

  const periodEnd = scheduleResult.currentPeriodEnd;

  await db
    .update(installSessions)
    .set({
      seatStatus: "pending_remove",
      seatRemoveAt: periodEnd,
    })
    .where(eq(installSessions.id, sid));

  return NextResponse.json({
    ok: true,
    seat_remove_at: periodEnd.toISOString(),
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const authSession = await getRequestSession(request.headers);
  if (!authSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);
  const session = rows[0];
  if (!session || session.userId !== authSession.user.id) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (session.stripeSubscriptionId && session.stripeSubscriptionItemId) {
    const entries = await db
      .select({ seatStatus: installSessions.seatStatus, subscriptionItemId: installSessions.stripeSubscriptionItemId })
      .from(installSessions)
      .where(eq(installSessions.stripeSubscriptionId, session.stripeSubscriptionId));

    const pendingCount = entries.filter(
      (entry) =>
        entry.subscriptionItemId === session.stripeSubscriptionItemId &&
        entry.seatStatus === "pending_remove"
    ).length;

    try {
      await upsertSeatRemovalSchedule({
        subscriptionId: session.stripeSubscriptionId,
        subscriptionItemId: session.stripeSubscriptionItemId,
        pendingCount: Math.max(0, pendingCount - 1),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      const maybeStatus = (err as { statusCode?: number } | null)?.statusCode;
      const status =
        typeof maybeStatus === "number" && maybeStatus >= 400 && maybeStatus < 500
          ? maybeStatus
          : 500;
      return NextResponse.json(
        { error: "cancel_removal_failed", details: message },
        { status }
      );
    }
  }

  await db
    .update(installSessions)
    .set({
      seatStatus: "active",
      seatRemoveAt: null,
    })
    .where(eq(installSessions.id, sid));

  return NextResponse.json({ ok: true });
}
