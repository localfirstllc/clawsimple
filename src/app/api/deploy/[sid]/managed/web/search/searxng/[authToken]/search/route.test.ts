import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleManagedSearxngSearchMock, loadManagedSessionForRouteMock } = vi.hoisted(() => ({
  handleManagedSearxngSearchMock: vi.fn(),
  loadManagedSessionForRouteMock: vi.fn(),
}));

vi.mock("@/lib/deploy/managed-web", () => ({
  handleManagedSearxngSearch: handleManagedSearxngSearchMock,
}));

vi.mock("@/lib/deploy/managed-web-route", () => ({
  loadManagedSessionForRoute: loadManagedSessionForRouteMock,
}));

import { GET } from "./route";

describe("managed SearXNG search route with auth token path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the token is missing", async () => {
    loadManagedSessionForRouteMock.mockResolvedValueOnce(
      NextResponse.json({ error: "missing token" }, { status: 401 })
    );

    const response = await GET(new NextRequest("https://example.com/search?q=openai"), {
      params: Promise.resolve({ sid: "sid_1", authToken: "" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "missing token" });
  });

  it("returns 401 when the token is invalid", async () => {
    loadManagedSessionForRouteMock.mockResolvedValueOnce(
      NextResponse.json({ error: "unauthorized" }, { status: 401 })
    );

    const response = await GET(new NextRequest("https://example.com/search?q=openai"), {
      params: Promise.resolve({ sid: "sid_1", authToken: "bad-token" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("forwards authorized requests to the SearXNG shim handler", async () => {
    loadManagedSessionForRouteMock.mockResolvedValueOnce({ sid: "sid_1" });
    handleManagedSearxngSearchMock.mockResolvedValueOnce(
      NextResponse.json({ results: [] }, { status: 200 })
    );

    const request = new NextRequest("https://example.com/search?q=openai&format=json");
    const response = await GET(request, {
      params: Promise.resolve({ sid: "sid_1", authToken: "good-token" }),
    });

    expect(loadManagedSessionForRouteMock).toHaveBeenCalledWith(request, "sid_1", {
      fallbackToken: "good-token",
    });
    expect(handleManagedSearxngSearchMock).toHaveBeenCalledWith(request, { sid: "sid_1" });
    expect(response.status).toBe(200);
  });
});
