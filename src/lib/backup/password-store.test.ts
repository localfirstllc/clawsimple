import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  selectLimitMock,
  selectMock,
  insertOnConflictMock,
  insertValuesMock,
  insertMock,
  openJobSecretMock,
  sealJobSecretMock,
} = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  const insertOnConflictMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({ onConflictDoNothing: insertOnConflictMock }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const openJobSecretMock = vi.fn((sealed: string) => `opened:${sealed}`);
  const sealJobSecretMock = vi.fn((plaintext: string) => `sealed:${plaintext}`);

  return {
    selectLimitMock,
    selectMock,
    insertOnConflictMock,
    insertValuesMock,
    insertMock,
    openJobSecretMock,
    sealJobSecretMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  deploymentBackupPasswords: {
    userId: "user_id",
    seatKey: "seat_key",
    ciphertext: "ciphertext",
  },
}));

vi.mock("@/lib/backup/job-secrets", () => ({
  openJobSecret: openJobSecretMock,
  sealJobSecret: sealJobSecretMock,
}));

import { buildBackupSeatKey, getOrCreateBackupPassword } from "./password-store";

describe("buildBackupSeatKey", () => {
  it("uses seat id when present", () => {
    expect(buildBackupSeatKey(" seat_123 ", "sid_1")).toBe("seat:seat_123");
  });

  it("falls back to sid when seat id is missing", () => {
    expect(buildBackupSeatKey("", "sid_1")).toBe("sid:sid_1");
    expect(buildBackupSeatKey(undefined, "sid_2")).toBe("sid:sid_2");
  });
});

describe("getOrCreateBackupPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses existing encrypted password without inserting", async () => {
    selectLimitMock.mockResolvedValueOnce([{ ciphertext: "stored-ciphertext" }]);

    const result = await getOrCreateBackupPassword({
      userId: "user_1",
      sid: "sid_1",
      seatId: "seat_1",
    });

    expect(result).toBe("opened:stored-ciphertext");
    expect(openJobSecretMock).toHaveBeenCalledWith("stored-ciphertext");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates and persists password when missing, then returns decrypted value", async () => {
    sealJobSecretMock.mockImplementationOnce(() => "sealed:generated");
    selectLimitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ciphertext: "sealed:generated" }]);
    vi.spyOn(crypto, "randomBytes").mockImplementation(() => Buffer.alloc(32, 7) as unknown as Buffer<ArrayBuffer>);

    const result = await getOrCreateBackupPassword({
      userId: "user_2",
      sid: "sid_2",
      seatId: "",
    });

    expect(result).toBe("opened:sealed:generated");
    expect(sealJobSecretMock).toHaveBeenCalledTimes(1);
    expect(sealJobSecretMock.mock.calls[0]?.[0]).toEqual(expect.any(String));
    expect((sealJobSecretMock.mock.calls[0]?.[0] as string).length).toBeGreaterThan(0);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_2",
        seatKey: "sid:sid_2",
        ciphertext: "sealed:generated",
        keyVersion: 1,
      })
    );
    expect(insertOnConflictMock).toHaveBeenCalledTimes(1);
  });
});
