import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { billingSubscriptionItem, installSessions } from "@/lib/db/schema";
import { deleteHetznerServer } from "@/lib/deploy/hetzner";
import { releaseTelegramBotTokenAssignments } from "@/lib/deploy/telegram-token-assignments";
import {
  reduceSeatsFromSubscription,
  hasManagedSeatRemovalSchedule,
} from "@/lib/billing/stripe";
import { requireCronSecret } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SeatGroupKey = {
  subscriptionId: string;
  subscriptionItemId: string;
};

function groupKey(session: {
  stripeSubscriptionId: string | null;
  stripeSubscriptionItemId: string | null;
}) {
  if (!session.stripeSubscriptionId || !session.stripeSubscriptionItemId) {
    return null;
  }
  return `${session.stripeSubscriptionId}:${session.stripeSubscriptionItemId}`;
}

async function cleanupSessionAtPeriodEnd(
  session: typeof installSessions.$inferSelect,
) {
  const serverId = session.serverFingerprint?.server_id;
  const deployProvider = session.serverFingerprint?.deploy_provider;

  if (serverId && deployProvider === "hetzner") {
    try {
      await deleteHetznerServer(serverId);
    } catch {
      // Ignore deletion failure; seat already reduced or subscription already ended.
    }
  }

  await db
    .update(installSessions)
    .set({
      active: false,
      seatStatus: "removed",
      deployAgentTokenHash: null,
      seatRemoveAt: null,
    })
    .where(eq(installSessions.id, session.id));
  await releaseTelegramBotTokenAssignments({ sid: session.id });
}

export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const now = new Date();
  const due = await db
    .select()
    .from(installSessions)
    .where(
      and(
        eq(installSessions.seatStatus, "pending_remove"),
        lte(installSessions.seatRemoveAt, now),
      ),
    );
  const leakedRows = await db
    .select({
      session: installSessions,
      subscriptionStatus: billingSubscriptionItem.status,
      cancelAt: billingSubscriptionItem.cancelAt,
      cancelAtPeriodEnd: billingSubscriptionItem.cancelAtPeriodEnd,
      currentPeriodEnd: billingSubscriptionItem.currentPeriodEnd,
    })
    .from(installSessions)
    .innerJoin(
      billingSubscriptionItem,
      eq(
        installSessions.stripeSubscriptionItemId,
        billingSubscriptionItem.stripeSubscriptionItemId,
      ),
    )
    .where(
      and(
        eq(installSessions.active, true),
        sql`${installSessions.seatStatus} is distinct from 'pending_remove'`,
        sql`${installSessions.seatStatus} is distinct from 'removed'`,
        or(
          and(
            isNull(billingSubscriptionItem.cancelAt),
            eq(billingSubscriptionItem.cancelAtPeriodEnd, true),
            lte(billingSubscriptionItem.currentPeriodEnd, now),
          ),
          lte(billingSubscriptionItem.cancelAt, now),
          eq(billingSubscriptionItem.status, "canceled"),
        ),
      ),
    );

  const grouped = new Map<string, { key: SeatGroupKey; ids: string[] }>();
  for (const session of due) {
    const key = groupKey(session);
    if (!key) continue;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(session.id);
    } else {
      grouped.set(key, {
        key: {
          subscriptionId: session.stripeSubscriptionId!,
          subscriptionItemId: session.stripeSubscriptionItemId!,
        },
        ids: [session.id],
      });
    }
  }

  const results = [];

  for (const group of grouped.values()) {
    let shouldReduce = true;
    try {
      shouldReduce = !(await hasManagedSeatRemovalSchedule({
        subscriptionId: group.key.subscriptionId,
      }));
    } catch {
      results.push({
        subscriptionId: group.key.subscriptionId,
        processed: 0,
        error: "stripe_schedule_check_failed",
      });
      continue;
    }

    if (shouldReduce) {
      try {
        await reduceSeatsFromSubscription({
          subscriptionId: group.key.subscriptionId,
          subscriptionItemId: group.key.subscriptionItemId,
          count: group.ids.length,
        });
      } catch {
        results.push({
          subscriptionId: group.key.subscriptionId,
          processed: 0,
          error: "stripe_update_failed",
        });
        continue;
      }
    }

    for (const id of group.ids) {
      const session = due.find((row) => row.id === id);
      if (!session) continue;
      await cleanupSessionAtPeriodEnd(session);
    }

    results.push({
      subscriptionId: group.key.subscriptionId,
      processed: group.ids.length,
      reason: "pending_remove",
    });
  }

  for (const row of leakedRows) {
    await cleanupSessionAtPeriodEnd(row.session);
    results.push({
      subscriptionId: row.session.stripeSubscriptionId,
      processed: 1,
      sid: row.session.id,
      reason: "billing_end_reconcile",
    });
  }

  return NextResponse.json({ processed: results.length, results });
}
