import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireCronSecret } from "./cron-auth";

describe("requireCronSecret", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("fails closed when CRON_SECRET is missing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new NextRequest("https://example.com/cron", {
      method: "POST",
    });

    const response = requireCronSecret(request);

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(503);
  });

  it("rejects requests with the wrong secret", () => {
    process.env.CRON_SECRET = "correct";
    const request = new NextRequest("https://example.com/cron", {
      method: "POST",
      headers: { "x-cron-secret": "wrong" },
    });

    const response = requireCronSecret(request);

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(401);
  });

  it("allows requests with the configured secret", () => {
    process.env.CRON_SECRET = "correct";
    const request = new NextRequest("https://example.com/cron", {
      method: "POST",
      headers: { "x-cron-secret": "correct" },
    });

    expect(requireCronSecret(request)).toBeNull();
  });
});
