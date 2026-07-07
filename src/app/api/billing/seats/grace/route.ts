import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import { deleteHetznerServer } from "@/lib/deploy/hetzner";
import { releaseTelegramBotTokenAssignments } from "@/lib/deploy/telegram-token-assignments";
import { requireCronSecret } from "@/lib/cron-auth";
import {
  removeSeatFromSubscription,
  getStripeClient,
  voidInvoice,
} from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const now = new Date();
  const pending = await db
    .select()
    .from(installSessions)
    .where(
      and(
        eq(installSessions.seatStatus, "pending"),
        eq(installSessions.active, true),
      ),
    );

  const results = [];
  const stripe = getStripeClient();

  for (const session of pending) {
    let invoicePaid = false;
    if (session.stripeInvoiceId) {
      try {
        const invoice = await stripe.invoices.retrieve(session.stripeInvoiceId);
        invoicePaid = invoice.status === "paid";
      } catch {
        invoicePaid = false;
      }
    }

    if (invoicePaid) {
      await db
        .update(installSessions)
        .set({
          seatStatus: "active",
          graceUntil: null,
        })
        .where(eq(installSessions.id, session.id));
      results.push({ sid: session.id, paid: true });
      continue;
    }

    if (session.graceUntil && session.graceUntil > now) {
      results.push({ sid: session.id, paid: false, skipped: true });
      continue;
    }

    const serverId = session.serverFingerprint?.server_id;
    const deployProvider = session.serverFingerprint?.deploy_provider;
    let deletedServer = false;
    if (serverId && deployProvider === "hetzner") {
      try {
        await deleteHetznerServer(serverId);
        deletedServer = true;
      } catch {
        deletedServer = false;
      }
    }

    if (session.stripeInvoiceId) {
      try {
        await voidInvoice(session.stripeInvoiceId);
      } catch {
        // Ignore invoice cleanup failures.
      }
    }

    if (session.stripeSubscriptionId && session.stripeSubscriptionItemId) {
      try {
        await removeSeatFromSubscription({
          subscriptionId: session.stripeSubscriptionId,
          subscriptionItemId: session.stripeSubscriptionItemId,
        });
      } catch {
        // Ignore seat rollback failures.
      }
    }

    await db
      .update(installSessions)
      .set({
        active: false,
        seatStatus: "failed",
        status: "failed",
        deployAgentTokenHash: null,
        errorCode: "E_PAYMENT_TIMEOUT",
        completedAt: new Date(),
      })
      .where(eq(installSessions.id, session.id));
    await releaseTelegramBotTokenAssignments({ sid: session.id });

    results.push({
      sid: session.id,
      deletedServer,
      paid: false,
      expired: true,
    });
  }

  return NextResponse.json({ processed: results.length, results });
}
