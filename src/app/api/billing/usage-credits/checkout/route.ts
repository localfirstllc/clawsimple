import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import { ensureStripeCustomerId, getStripeClient } from "@/lib/billing/stripe";
import { toStripeAttributionMetadata } from "@/lib/analytics/attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREDIT_PACKS = {
  pack_5: { usd: 5, priceId: process.env.STRIPE_USAGE_CREDIT_PRICE_ID_5 ?? "" },
  pack_10: { usd: 10, priceId: process.env.STRIPE_USAGE_CREDIT_PRICE_ID_10 ?? "" },
  pack_25: { usd: 25, priceId: process.env.STRIPE_USAGE_CREDIT_PRICE_ID_25 ?? "" },
  pack_50: { usd: 50, priceId: process.env.STRIPE_USAGE_CREDIT_PRICE_ID_50 ?? "" },
} as const;
const CREDIT_EXPIRATION_DAYS = "365";

type CreditPackKey = keyof typeof CREDIT_PACKS;

type CheckoutBody = {
  pack?: CreditPackKey;
  locale?: string;
  attribution?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CheckoutBody | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const pack = body?.pack ?? "pack_10";
  const locale = body?.locale ?? "en";
  const selected = CREDIT_PACKS[pack];
  if (!selected) {
    return NextResponse.json({ error: "invalid_pack" }, { status: 400 });
  }
  if (!selected.priceId) {
    return NextResponse.json(
      { error: "pack_unavailable", message: "Credit pack is not configured" },
      { status: 400 }
    );
  }

  const stripe = getStripeClient();
  const customerId = await ensureStripeCustomerId(session.user.id);
  // Prefer configured public origin over client-supplied headers.
  const configuredOrigin =
    process.env.DEPLOY_PUBLIC_API_BASE_URL?.trim()?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/+$/, "");
  const origin =
    configuredOrigin ||
    request.headers.get("origin") ||
    new URL(request.url).origin;
  const fallbackSite = new URL(origin).hostname;
  const attributionMetadata = toStripeAttributionMetadata(
    body?.attribution,
    fallbackSite
  );

  const checkout = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: session.user.id,
    mode: "payment",
    line_items: [{ price: selected.priceId, quantity: 1 }],
    success_url: `${origin}/${locale}/profile?credits=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/${locale}/profile?credits=cancel`,
    metadata: {
      purchase_type: "usage_credits",
      user_id: session.user.id,
      credits_usd: String(selected.usd),
      credit_pack: pack,
      credit_expiration_days: CREDIT_EXPIRATION_DAYS,
      ...attributionMetadata,
    },
    payment_intent_data: {
      metadata: {
        purchase_type: "usage_credits",
        user_id: session.user.id,
        credits_usd: String(selected.usd),
        credit_pack: pack,
        credit_expiration_days: CREDIT_EXPIRATION_DAYS,
        ...attributionMetadata,
      },
    },
  });

  return NextResponse.json({
    checkoutUrl: checkout.url,
    pack,
    credits_usd: selected.usd,
  });
}
