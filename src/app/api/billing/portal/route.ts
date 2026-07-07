import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import {
  createBillingPortalSession,
  ensureStripeCustomerId,
} from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PortalRequest = {
  returnUrl?: string;
};

function resolveReturnUrl(request: NextRequest, value?: string | null) {
  // Prefer configured public origin over client-supplied headers.
  const configuredOrigin =
    process.env.DEPLOY_PUBLIC_API_BASE_URL?.trim()?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/+$/, "");
  const origin =
    configuredOrigin ||
    request.headers.get("origin") ||
    new URL(request.url).origin;
  if (!value) {
    return origin;
  }
  if (value.startsWith("/")) {
    return `${origin}${value}`;
  }
  try {
    const url = new URL(value);
    return url.origin === origin ? url.toString() : origin;
  } catch {
    return origin;
  }
}

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: PortalRequest | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const returnUrl = resolveReturnUrl(request, body?.returnUrl ?? null);
  const customerId = await ensureStripeCustomerId(session.user.id);
  const url = await createBillingPortalSession({ customerId, returnUrl });

  return NextResponse.json({ url });
}
