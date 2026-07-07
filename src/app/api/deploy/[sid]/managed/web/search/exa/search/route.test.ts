import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleManagedWebSearchMock, loadManagedSessionForRouteMock } = vi.hoisted(() => ({
  handleManagedWebSearchMock: vi.fn(),
  loadManagedSessionForRouteMock: vi.fn(),
}));

vi.mock("@/lib/deploy/managed-web", () => ({
  handleManagedWebSearch: handleManagedWebSearchMock,
}));

vi.mock("@/lib/deploy/managed-web-route", () => ({
  loadManagedSessionForRoute: loadManagedSessionForRouteMock,
}));

import { POST } from "./route";

describe("managed Exa search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the session is not authorized", async () => {
    loadManagedSessionForRouteMock.mockResolvedValueOnce(
      NextResponse.json({ error: "missing token" }, { status: 401 })
    );

    const response = await POST(new NextRequest("https://example.com/search", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
    }), {
      params: Promise.resolve({ sid: "sid_1" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "missing token" });
  });

  it("forwards authorized POST requests to the Exa passthrough handler", async () => {
    loadManagedSessionForRouteMock.mockResolvedValueOnce({ sid: "sid_1" });
    handleManagedWebSearchMock.mockResolvedValueOnce(
      NextResponse.json({ results: [] }, { status: 200 })
    );

    const request = new NextRequest("https://example.com/search?q=test", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ sid: "sid_1" }),
    });

    expect(loadManagedSessionForRouteMock).toHaveBeenCalledWith(request, "sid_1");
    expect(handleManagedWebSearchMock).toHaveBeenCalledWith(request, { sid: "sid_1" });
    expect(response.status).toBe(200);
  });
});
