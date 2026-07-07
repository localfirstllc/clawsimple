import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/billing/usage-credits/confirm/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockAddCredits = vi.hoisted(() => vi.fn());
const mockGetSummary = vi.hoisted(() => vi.fn());
const mockValidate = vi.hoisted(() => vi.fn());
const mockStripeRetrieve = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getRequestSession: mockGetSession,
}));

vi.mock("@/lib/billing/usage-credits", () => ({
  addPurchasedUsageCredits: mockAddCredits,
  getUsageCreditSummaryUsd: mockGetSummary,
}));

vi.mock("@/lib/billing/usage-credits-validation", () => ({
  validateUsageCreditCheckoutSession: mockValidate,
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: vi.fn(() => ({
    checkout: {
      sessions: {
        retrieve: mockStripeRetrieve,
      },
    },
  })),
}));

function buildPost(body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/billing/usage-credits/confirm";
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function buildGet(): NextRequest {
  const url = "http://localhost:3000/api/billing/usage-credits/confirm";
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/billing/usage-credits/confirm", () => {
  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(buildPost({ session_id: "cs_123" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when session_id is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(buildPost({}));
    expect(res.status).toBe(400);
  });

  it("handles invalid JSON body", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const url = "http://localhost:3000/api/billing/usage-credits/confirm";
    const req = new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-valid-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns error when validation fails", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockStripeRetrieve.mockResolvedValue({
      id: "cs_123",
      payment_status: "paid",
      status: "complete",
      metadata: {},
    });
    mockValidate.mockReturnValue({ valid: false, error: "invalid_checkout", status: 400 });

    const res = await POST(buildPost({ session_id: "cs_123" }));
    expect(res.status).toBe(400);
  });

  it("returns success when validation passes", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockStripeRetrieve.mockResolvedValue({
      id: "cs_123",
      payment_status: "paid",
      status: "complete",
      metadata: {},
    });
    mockValidate.mockReturnValue({ valid: true, userId: "u1", creditsUsd: 10 });
    mockAddCredits.mockResolvedValue({
      applied: true,
      balanceUsd: 10,
      expiresAt: new Date("2026-12-31T00:00:00Z"),
    });

    const res = await POST(buildPost({ session_id: "cs_123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.balance_usd).toBe(10);
  });
});

describe("GET /api/billing/usage-credits/confirm", () => {
  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(buildGet());
    expect(res.status).toBe(401);
  });

  it("returns credit summary when authenticated", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockGetSummary.mockResolvedValue({
      balanceUsd: 5.5,
      nextExpiresAt: new Date("2026-08-01T00:00:00Z"),
      nextExpiringUsd: 2.0,
    });

    const res = await GET(buildGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance_usd).toBe(5.5);
    expect(body.next_expiring_usd).toBe(2.0);
  });
});
