import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  installSessions: Symbol("installSessions"),
}));

import { db } from "@/lib/db";
import { getDeployCapacity } from "./capacity";

describe("getDeployCapacity", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("computes available capacity with active servers", async () => {
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 3 }]),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as never);

    const capacity = await getDeployCapacity({ hetznerLimit: 10 });
    expect(capacity).toEqual({
      hetznerLimit: 10,
      hetznerUsed: 3,
      hetznerAvailable: 7,
    });
  });

  it("returns zero available when hetznerLimit is zero", async () => {
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 0 }]),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as never);

    const capacity = await getDeployCapacity({ hetznerLimit: 0 });
    expect(capacity.hetznerAvailable).toBe(0);
  });

  it("treats NaN limit as zero", async () => {
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 5 }]),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as never);

    const capacity = await getDeployCapacity({ hetznerLimit: NaN });
    expect(capacity.hetznerAvailable).toBe(0);
  });

  it("floors available at zero when used exceeds limit", async () => {
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 12 }]),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as never);

    const capacity = await getDeployCapacity({ hetznerLimit: 10 });
    expect(capacity.hetznerAvailable).toBe(0);
  });
});
