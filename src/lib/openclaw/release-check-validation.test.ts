import { describe, expect, it } from "vitest";
import { buildOpenClawReleaseValidationErrors } from "./release-check-validation";

describe("buildOpenClawReleaseValidationErrors", () => {
  it("does not use legacy runner or gateway heartbeat metadata as release readiness", () => {
    const errors = buildOpenClawReleaseValidationErrors({
      fingerprint: { gateway_service_active: false },
      telegramValidation: { ok: true, details: "" },
    });

    expect(errors).toEqual([]);
  });

  it("keeps Telegram bot validation as the release notification readiness check", () => {
    const errors = buildOpenClawReleaseValidationErrors({
      fingerprint: {},
      telegramValidation: { ok: false, details: "telegram getMe failed" },
    });

    expect(errors).toEqual(["telegram getMe failed"]);
  });
});
