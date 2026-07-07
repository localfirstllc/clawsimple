import { NextResponse, type NextRequest } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import {
  addPurchasedUsageCredits,
  getUsageCreditSummaryUsd,
} from "@/lib/billing/usage-credits";
import { validateUsageCreditCheckoutSession } from "@/lib/billing/usage-credits-validation";
import { getStripeClient } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { session_id?: string }
    | null;
  const sessionId = body?.session_id?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "session_id_required" }, { status: 400 });
  }

  const stripe = getStripeClient();
  const checkout = await stripe.checkout.sessions.retrieve(sessionId);
  const validation = validateUsageCreditCheckoutSession(
    {
      payment_status: checkout.payment_status ?? "",
      status: checkout.status ?? "",
      metadata: checkout.metadata,
    },
    session.user.id
  );
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const result = await addPurchasedUsageCredits({
    userId: validation.userId,
    amountUsd: validation.creditsUsd,
    sourceId: checkout.id,
  });

  return NextResponse.json({
    ok: true,
    applied: result.applied,
    balance_usd: result.balanceUsd,
    expires_at: result.expiresAt.toISOString(),
  });
}

export async function GET(request: NextRequest) {
  const refreshedSession = await getRequestSession(request.headers);
  if (!refreshedSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await getUsageCreditSummaryUsd(refreshedSession.user.id);
  return NextResponse.json({
    balance_usd: summary.balanceUsd,
    next_expires_at: summary.nextExpiresAt?.toISOString() ?? null,
    next_expiring_usd: summary.nextExpiringUsd,
  });
}
