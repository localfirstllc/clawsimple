import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockIsMaintenance = vi.hoisted(() => vi.fn());
const mockGetMaintenancePageHtml = vi.hoisted(() => vi.fn());

vi.mock("@/lib/maintenance-mode", () => ({
  isMaintenanceModeEnabled: mockIsMaintenance,
}));

vi.mock("@/lib/maintenance-page", () => ({
  getMaintenancePageHtml: mockGetMaintenancePageHtml,
}));

vi.mock("@/lib/i18n/config", () => ({
  locales: ["en", "zh"],
  defaultLocale: "en",
}));

vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => () => NextResponse.next()),
}));

function buildRequest(path: string, headers?: Record<string, string>, method = "GET"): NextRequest {
  const url = `http://localhost:3000${path}`;
  return new NextRequest(url, {
    method,
    headers,
  });
}

describe("proxy (middleware)", () => {
  describe("maintenance mode detection", () => {
    beforeEach(() => {
      mockIsMaintenance.mockReturnValue(false);
      mockGetMaintenancePageHtml.mockReturnValue("<html>maintenance</html>");
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("does not trigger for non-API routes when maintenance is off", async () => {
      const { proxy } = await import("@/proxy");
      const req = buildRequest("/en");
      const res = await proxy(req);
      expect(res.status).not.toBe(503);
    });

    it("serves 503 for non-API routes when maintenance is on", async () => {
      mockIsMaintenance.mockReturnValue(true);
      vi.resetModules();
      const { proxy } = await import("@/proxy");
      const req = buildRequest("/en");
      const res = await proxy(req);
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("retry-after")).toBe("300");
    });

    it("does NOT serve 503 for API routes even when maintenance is on", async () => {
      mockIsMaintenance.mockReturnValue(true);
      vi.resetModules();
      const { proxy } = await import("@/proxy");
      const req = buildRequest("/api/deploy/list");
      const res = await proxy(req);
      expect(res.status).not.toBe(503);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      vi.resetModules();
      const { proxy } = await import("@/proxy");
      const ip = `test-exceed-${Date.now()}`;
      let lastResponse: Response | null = null;
      for (let i = 0; i < 110; i++) {
        const req = buildRequest("/api/deploy/list", {
          "x-forwarded-for": ip,
        });
        lastResponse = await proxy(req);
      }
      expect(lastResponse).not.toBeNull();
      expect(lastResponse!.status).toBe(429);
    });

    it("allows requests under the rate limit", async () => {
      vi.resetModules();
      const { proxy } = await import("@/proxy");
      const ip = `test-under-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        const req = buildRequest("/api/deploy/list", {
          "x-forwarded-for": ip,
        });
        const res = await proxy(req);
        expect(res.status).not.toBe(429);
      }
    });

    it("skips rate limit for preset-proxy routes", async () => {
      vi.resetModules();
      const { proxy } = await import("@/proxy");
      const ip = `test-preset-${Date.now()}`;
      for (let i = 0; i < 110; i++) {
        const req = buildRequest(
          "/api/deploy/preset-proxy/test-sid/v1/chat/completions",
          { "x-forwarded-for": ip }
        );
        const res = await proxy(req);
        expect(res.status).not.toBe(429);
      }
    });

    it("treats different IPs independently", async () => {
      vi.resetModules();
      const { proxy } = await import("@/proxy");
      const ipA = `test-ip-a-${Date.now()}`;
      const ipB = `test-ip-b-${Date.now()}`;
      for (let i = 0; i < 110; i++) {
        await proxy(buildRequest("/api/deploy/list", { "x-forwarded-for": ipA }));
      }
      const res = await proxy(
        buildRequest("/api/deploy/list", { "x-forwarded-for": ipB })
      );
      expect(res.status).not.toBe(429);
    });

    it("uses x-real-ip when x-forwarded-for is absent (different IPs have separate rate limits)", async () => {
      vi.resetModules();
      const { proxy } = await import("@/proxy");
      const ip1 = `${Date.now()}-ff`;
      const ip2 = `${Date.now()}-ri`;
      for (let i = 0; i < 110; i++) {
        await proxy(buildRequest("/api/deploy/list", { "x-forwarded-for": ip1 }));
      }
      const res = await proxy(
        buildRequest("/api/deploy/list", { "x-real-ip": ip2 })
      );
      expect(res.status).not.toBe(429);
    });
  });
});
