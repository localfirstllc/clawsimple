import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateInstallEventToken } from "@/lib/deploy/tokens";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/db/schema", () => ({
  installSessions: {
    id: "id",
    status: "status",
    serverFingerprint: "serverFingerprint",
  },
}));

import { POST } from "./route";

const TEST_SECRET = "test-completion-secret-min-32-bytes!";

describe("install events route auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.COMPLETION_TOKEN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.COMPLETION_TOKEN_SECRET;
    vi.restoreAllMocks();
  });

  it("rejects writes without a bearer token", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/install/events", {
        method: "POST",
        body: JSON.stringify({ sid: "sid_1", event: "progress" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("rejects body SID mismatches before touching the database", async () => {
    const token = generateInstallEventToken("sid_1");
    const response = await POST(
      new NextRequest("https://example.com/api/install/events", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ sid: "sid_2", event: "progress" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});
