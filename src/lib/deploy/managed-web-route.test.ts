import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { verifyDeployAgentAccessMock, loadManagedProxySessionMock } = vi.hoisted(() => ({
  verifyDeployAgentAccessMock: vi.fn(),
  loadManagedProxySessionMock: vi.fn(),
}));

vi.mock("./agent-jobs", () => ({
  verifyDeployAgentAccess: verifyDeployAgentAccessMock,
}));

vi.mock("./managed-search-crawl-proxy", () => ({
  loadManagedProxySession: loadManagedProxySessionMock,
}));

import { loadManagedSessionForRoute } from "./managed-web-route";

describe("loadManagedSessionForRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_MANAGED_IP_FALLBACK = "1";
  });

  afterEach(() => {
    delete process.env.ENABLE_MANAGED_IP_FALLBACK;
  });

  it("authorizes requests with a bearer token", async () => {
    loadManagedProxySessionMock.mockResolvedValueOnce({
      id: "sid_1",
      seatId: null,
      userId: null,
      seatPlan: null,
      stripeSubscriptionItemId: null,
      serverFingerprint: null,
    });
    verifyDeployAgentAccessMock.mockResolvedValueOnce(true);

    const request = new NextRequest("https://example.com", {
      headers: {
        authorization: "Bearer good-token",
      },
    });
    const result = await loadManagedSessionForRoute(request, "sid_1");

    expect(verifyDeployAgentAccessMock).toHaveBeenCalledWith("sid_1", "Bearer good-token");
    expect(result).toMatchObject({ id: "sid_1" });
  });

  it("authorizes requests from the deployment server IP without requiring a token", async () => {
    loadManagedProxySessionMock.mockResolvedValueOnce({
      id: "sid_1",
      seatId: null,
      userId: null,
      seatPlan: null,
      stripeSubscriptionItemId: null,
      serverFingerprint: {
        server_ipv4: "203.0.113.10",
      },
    });

    const request = new NextRequest("https://example.com", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      },
    });
    const result = await loadManagedSessionForRoute(request, "sid_1");

    expect(verifyDeployAgentAccessMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "sid_1" });
  });

  it("authorizes requests when the deployment fingerprint stores an IPv6 CIDR", async () => {
    loadManagedProxySessionMock.mockResolvedValueOnce({
      id: "sid_1",
      seatId: null,
      userId: null,
      seatPlan: null,
      stripeSubscriptionItemId: null,
      serverFingerprint: {
        server_ipv6: "2a01:4f8:c0c:d89f::/64",
      },
    });

    const request = new NextRequest("https://example.com", {
      headers: {
        "cf-connecting-ip": "2a01:4f8:c0c:d89f::1",
      },
    });
    const result = await loadManagedSessionForRoute(request, "sid_1");

    expect(verifyDeployAgentAccessMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "sid_1" });
  });

  it("rejects requests when neither a token nor an allowed IP is present", async () => {
    loadManagedProxySessionMock.mockResolvedValueOnce({
      id: "sid_1",
      seatId: null,
      userId: null,
      seatPlan: null,
      stripeSubscriptionItemId: null,
      serverFingerprint: {
        server_ipv4: "203.0.113.10",
      },
    });

    const request = new NextRequest("https://example.com", {
      headers: {
        "x-forwarded-for": "203.0.113.11",
      },
    });
    const result = await loadManagedSessionForRoute(request, "sid_1");

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});
