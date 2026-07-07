export function validateUsageCreditCheckoutSession(
  checkout: { payment_status: string; status: string; metadata?: Record<string, string | null> | null },
  expectedUserId: string
): { valid: true; creditsUsd: number; purchaseType: string; userId: string } | { valid: false; error: string; status: number } {
  const metadata = checkout.metadata ?? {};
  const userId = metadata.user_id ?? "";
  const purchaseType = metadata.purchase_type ?? "";
  const creditsUsd = Number(metadata.credits_usd ?? "0");
  const paid = checkout.payment_status === "paid" || checkout.status === "complete";

  if (purchaseType !== "usage_credits" || !userId || userId !== expectedUserId) {
    return { valid: false, error: "invalid_checkout_session", status: 400 };
  }
  if (!paid) {
    return { valid: false, error: "checkout_not_paid", status: 400 };
  }
  if (!Number.isFinite(creditsUsd) || creditsUsd <= 0) {
    return { valid: false, error: "invalid_credit_amount", status: 400 };
  }

  return { valid: true, creditsUsd, purchaseType, userId };
}
