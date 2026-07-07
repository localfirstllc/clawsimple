import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import {
  ensureStripeCustomerId,
  getStripeClient,
  findActivePromoCode,
} from "@/lib/billing/stripe";
import { toStripeAttributionMetadata } from "@/lib/analytics/attribution";
import { getSeatPlanPriceId, resolveSeatPlan } from "@/lib/billing/plans";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutRequest = {
  seat_plan?: string;
  locale?: string;
  promo_code?: string;
  billing_interval?: "month" | "year";
  return_path?: string;
  return_action?: string;
  attribution?: Record<string, unknown>;
};

const CHECKOUT_BRANDING = {
  backgroundColor: "#fcfaf7",
  buttonColor: "#e2542a",
  borderStyle: "rounded" as const,
  displayName: "ClawSimple",
};

function normalizePublicOrigin(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function getBrandLogoUrl(request: NextRequest, origin: string) {
  const publicOrigin =
    normalizePublicOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizePublicOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizePublicOrigin(process.env.NEXT_PUBLIC_BASE_URL) ??
    normalizePublicOrigin(origin) ??
    "https://clawsimple.com";

  return `${publicOrigin}/brand/clawsimple.png`;
}

/**
 * Creates a Stripe Checkout Session for first-time subscribers.
 * After payment, user is redirected to success_url with action=complete-deploy
 * so the frontend can auto-trigger the deployment.
 */
export async function POST(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CheckoutRequest | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const seatPlan = resolveSeatPlan(body?.seat_plan ?? "seat-standard");
  const billingInterval = body?.billing_interval ?? "month";
  const locale = body?.locale ?? "en";
  const promoCodeInput = body?.promo_code?.trim();
  const requestedReturnPath =
    typeof body?.return_path === "string" ? body.return_path : null;
  const requestedReturnAction =
    typeof body?.return_action === "string" ? body.return_action.trim() : "";
  const isCustomReturnPath =
    requestedReturnPath !== null && requestedReturnPath.startsWith("/");
  const returnPath =
    isCustomReturnPath
      ? requestedReturnPath
      : `/${locale}`;
  const returnAction =
    requestedReturnAction.length > 0
      ? requestedReturnAction
      : "complete-deploy";

  const priceId = getSeatPlanPriceId(seatPlan, billingInterval);
  if (!priceId) {
    return NextResponse.json(
      { error: "invalid_plan", message: "Invalid seat plan or billing interval" },
      { status: 400 }
    );
  }

  try {
    const customerId = await ensureStripeCustomerId(session.user.id);
    const stripe = getStripeClient();
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
    const successUrl = new URL(`${origin}${returnPath}`);
    successUrl.searchParams.set("action", returnAction);
    const cancelUrl = new URL(`${origin}${returnPath}`);
    if (!isCustomReturnPath) {
      successUrl.hash = "deploy";
      cancelUrl.hash = "deploy";
    }

    // Build checkout session params
    const checkoutParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      client_reference_id: session.user.id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      payment_method_collection: "always",
      metadata: {
        user_id: session.user.id,
        ...attributionMetadata,
      },
      branding_settings: {
        background_color: CHECKOUT_BRANDING.backgroundColor,
        button_color: CHECKOUT_BRANDING.buttonColor,
        border_style: CHECKOUT_BRANDING.borderStyle,
        display_name: CHECKOUT_BRANDING.displayName,
        logo: {
          type: "url",
          url: getBrandLogoUrl(request, origin),
        },
      },
      subscription_data: {
        metadata: {
          seat_plan: seatPlan,
          billing_interval: billingInterval,
          user_id: session.user.id,
          ...attributionMetadata,
        },
      },
    };

    // Apply promo code if provided and valid
    if (promoCodeInput) {
      const promo = await findActivePromoCode(promoCodeInput);
      if (promo) {
        checkoutParams.discounts = [{ promotion_code: promo.id }];
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create(checkoutParams);

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
    });
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    return NextResponse.json(
      { error: "checkout_failed", message: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
