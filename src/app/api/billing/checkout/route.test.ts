import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/billing/checkout/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockEnsureCustomer = vi.hoisted(() => vi.fn());
const mockStripeClient = vi.hoisted(() => vi.fn());
const mockFindPromoCode = vi.hoisted(() => vi.fn());
const mockGetPriceId = vi.hoisted(() => vi.fn());
const mockResolvePlan = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getRequestSession: mockGetSession,
}));

vi.mock("@/lib/billing/stripe", () => ({
  ensureStripeCustomerId: mockEnsureCustomer,
  getStripeClient: mockStripeClient,
  findActivePromoCode: mockFindPromoCode,
}));

vi.mock("@/lib/billing/plans", () => ({
  getSeatPlanPriceId: mockGetPriceId,
  resolveSeatPlan: mockResolvePlan,
}));

vi.mock("@/lib/analytics/attribution", () => ({
  toStripeAttributionMetadata: vi.fn(() => ({})),
}));

function buildCheckoutRequest(body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/billing/checkout";
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockResolvePlan.mockReturnValue("seat-standard");
  mockGetPriceId.mockReturnValue("price_standard_monthly");
  mockEnsureCustomer.mockResolvedValue("cus_test123");
  mockFindPromoCode.mockResolvedValue(undefined as never);
  mockStripeClient.mockReturnValue({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/c/test" }),
      },
    },
  });
});

describe("POST /api/billing/checkout", () => {
  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await POST(buildCheckoutRequest({ seat_plan: "standard" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid seat plan / missing price id", async () => {
    mockGetPriceId.mockReturnValueOnce(undefined as never);
    const res = await POST(buildCheckoutRequest({ seat_plan: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns checkout URL on success", async () => {
    const res = await POST(buildCheckoutRequest({ seat_plan: "standard", locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutUrl).toBeTruthy();
  });

  it("handles malformed JSON body", async () => {
    mockGetPriceId.mockReturnValueOnce(undefined as never);
    const url = "http://localhost:3000/api/billing/checkout";
    const req = new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-valid-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
