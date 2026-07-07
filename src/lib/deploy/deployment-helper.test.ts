import { describe, expect, it } from "vitest";
import {
  buildDeployPayload,
  mapSeatPlanChoice,
  validateDeployFormInput,
  validateDeployFromSeat,
} from "./deployment-helper";

describe("mapSeatPlanChoice", () => {
  it("maps standard", () => {
    expect(mapSeatPlanChoice("standard")).toBe("seat-standard");
  });

  it("maps max", () => {
    expect(mapSeatPlanChoice("max")).toBe("seat-max");
  });
});

describe("buildDeployPayload", () => {
  const defaults = {
    tgToken: "tok123",
    tgAllow: "456",
    seatPlanChoice: "standard" as const,
    billingInterval: "month" as const,
    locale: "en",
    subscriptionItemId: "si_test",
    agentRuntime: "hermes" as const,
    modelPreset: "gpt-5.2",
    promoCode: "",
    promoStatus: "idle" as const,
  };

  it("builds standard managed payload", () => {
    const data = buildDeployPayload(defaults);
    expect(data.seat_plan).toBe("seat-standard");
    expect(data.ai_source).toBe("managed");
    expect(data.model_preset).toBe("gpt-5.2");
    expect(data.target_runtime).toBe("hermes");
    expect(data.promo_code).toBeUndefined();
    expect(data.billing_interval).toBe("month");
  });

  it("includes promo code only when valid", () => {
    const withValid = buildDeployPayload({
      ...defaults,
      promoCode: "SAVE20",
      promoStatus: "valid",
    });
    expect(withValid.promo_code).toBe("SAVE20");

    const withInvalid = buildDeployPayload({
      ...defaults,
      promoCode: "SAVE20",
      promoStatus: "invalid",
    });
    expect(withInvalid.promo_code).toBeUndefined();
  });

  it("passes yearly billing interval", () => {
    const data = buildDeployPayload({ ...defaults, billingInterval: "year" });
    expect(data.billing_interval).toBe("year");
  });

  it("passes subscription item id", () => {
    const data = buildDeployPayload({
      ...defaults,
      subscriptionItemId: "si_abc",
    });
    expect(data.subscription_item_id).toBe("si_abc");
  });

  it("passes selected OpenClaw runtime", () => {
    const data = buildDeployPayload({
      ...defaults,
      agentRuntime: "openclaw",
    });
    expect(data.target_runtime).toBe("openclaw");
  });
});

describe("validateDeployFromSeat", () => {
  const base = {
    seatPlan: "seat-standard" as const,
    deployToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
    deployAllowlist: "1234",
    hasSavedTelegramUserId: false,
  };

  it("requires Telegram Bot Token", () => {
    expect(validateDeployFromSeat({ ...base, deployToken: "" })).toBe(
      "Telegram Bot Token is required.",
    );
  });

  it("validates Telegram Bot Token shape", () => {
    expect(
      validateDeployFromSeat({ ...base, deployToken: "not-a-token" }),
    ).toBe(
      "Telegram Bot Token must look like 123456789:ABC-DEF... from @BotFather.",
    );
  });

  it("requires Telegram Allow list when no saved user id", () => {
    expect(validateDeployFromSeat({ ...base, deployAllowlist: "" })).toBe(
      "Telegram Allow list is required.",
    );
  });

  it("allows empty allowlist when saved telegram user id exists", () => {
    expect(
      validateDeployFromSeat({
        ...base,
        deployAllowlist: "",
        hasSavedTelegramUserId: true,
      }),
    ).toBeNull();
  });

  it("validates telegram user id after required field checks pass", () => {
    expect(
      validateDeployFromSeat({
        ...base,
        deployAllowlist: "123",
      }),
    ).toBe("Telegram User ID must contain 4-20 digits.");
  });
});

describe("validateDeployFormInput", () => {
  it("returns field errors for invalid homepage deploy inputs", () => {
    expect(
      validateDeployFormInput({
        tgAllow: "abc",
        tgToken: "not-a-token",
      }),
    ).toEqual({
      tgAllowError: "Telegram User ID must contain 4-20 digits.",
      tgTokenError:
        "Telegram Bot Token must look like 123456789:ABC-DEF... from @BotFather.",
    });
  });

  it("accepts a BotFather-style token and numeric user id", () => {
    expect(
      validateDeployFormInput({
        tgAllow: "12345678",
        tgToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
      }),
    ).toEqual({
      tgAllowError: null,
      tgTokenError: null,
    });
  });
});
