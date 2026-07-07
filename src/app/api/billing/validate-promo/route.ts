import { NextRequest, NextResponse } from "next/server";
import { findActivePromoCode } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { code?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const code = body?.code?.trim();
  if (!code) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  try {
    const promo = await findActivePromoCode(code);

    if (!promo || !promo.active) {
      return NextResponse.json(
        { valid: false, message: "Invalid or expired code" },
        { status: 200 }
      );
    }

    // Extract coupon details from the expanded promotion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promotion = (promo as any).promotion;

    if (!promotion || typeof promotion === 'string') {
      return NextResponse.json(
        { valid: false, message: "Invalid coupon configuration" },
        { status: 200 }
      );
    }

    const coupon = promotion.coupon && typeof promotion.coupon === 'object' ? promotion.coupon : promotion;

    const discount = {
      percent_off: coupon.percent_off as number | null,
      amount_off: coupon.amount_off as number | null,
      currency: coupon.currency as string | null,
      duration: coupon.duration as string | null,
      duration_in_months: coupon.duration_in_months as number | null,
    };

    return NextResponse.json({
      valid: true,
      code: promo.code,
      id: promo.id,
      discount,
    });
  } catch (error) {
    console.error("Promo validation error:", error);
    return NextResponse.json(
      { error: "Validation failed" },
      { status: 500 }
    );
  }
}
