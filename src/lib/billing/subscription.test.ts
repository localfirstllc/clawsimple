import { describe, expect, it, vi, beforeEach } from "vitest";

const mockEnsureCache = vi.hoisted(() => vi.fn());

vi.mock("@/lib/billing/subscription-cache", () => ({
  ensureBillingSubscriptionCache: mockEnsureCache,
}));

const mockDbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => mockDbQuery()),
          })),
        })),
      })),
    })),
  },
}));

import { getLatestSubscription, getActiveSubscription } from "@/lib/billing/subscription";

beforeEach(() => {
  vi.clearAllMocks();
  mockDbQuery.mockResolvedValue([]);
  mockEnsureCache.mockResolvedValue({ stripeCustomerId: "cus_test" });
});

describe("getLatestSubscription", () => {
  it("returns null when no stripe customer", async () => {
    mockEnsureCache.mockResolvedValue({ stripeCustomerId: null });
    const result = await getLatestSubscription("user1");
    expect(result).toBeNull();
  });

  it("returns null when no subscription items exist", async () => {
    mockDbQuery.mockResolvedValue([]);
    const result = await getLatestSubscription("user1");
    expect(result).toBeNull();
  });

  it("returns the most recent subscription item", async () => {
    mockDbQuery.mockResolvedValue([
      {
        subscriptionId: "sub_1",
        subscriptionItemId: "si_1",
        status: "active",
        priceId: "price_standard_monthly",
        currentPeriodEnd: new Date("2026-07-15T00:00:00Z"),
        subscriptionCreatedAt: new Date("2026-06-01T00:00:00Z"),
      },
    ]);
    const result = await getLatestSubscription("user1");
    expect(result).not.toBeNull();
    expect(result!.subscriptionId).toBe("sub_1");
    expect(result!.subscriptionItemId).toBe("si_1");
    expect(result!.status).toBe("active");
    expect(result!.priceId).toBe("price_standard_monthly");
  });
});

describe("getActiveSubscription", () => {
  it("returns null when no stripe customer", async () => {
    mockEnsureCache.mockResolvedValue({ stripeCustomerId: null });
    const result = await getActiveSubscription("user1");
    expect(result).toBeNull();
  });

  it("returns null when no subscription items exist", async () => {
    mockDbQuery.mockResolvedValue([]);
    const result = await getActiveSubscription("user1");
    expect(result).toBeNull();
  });

  it("returns an active subscription when one exists", async () => {
    mockDbQuery.mockResolvedValue([
      {
        subscriptionId: "sub_active",
        subscriptionItemId: "si_active",
        status: "active",
        priceId: "price_standard_monthly",
        currentPeriodEnd: new Date("2026-07-15T00:00:00Z"),
        subscriptionCreatedAt: new Date("2026-06-01T00:00:00Z"),
      },
    ]);
    const result = await getActiveSubscription("user1");
    expect(result).not.toBeNull();
    expect(result!.subscriptionId).toBe("sub_active");
    expect(result!.status).toBe("active");
  });
});
