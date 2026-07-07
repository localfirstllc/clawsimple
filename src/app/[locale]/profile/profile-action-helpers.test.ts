import { describe, expect, it } from "vitest";
import {
  buildAddAgentPayload,
  buildDeployPayload,
  buildRedeployPayload,
  validateAddAgentInput,
  validateDeployFromSeat,
  validateRedeployInput,
} from "./profile-action-helpers";

// ---------------------------------------------------------------------------
// validateDeployFromSeat
// ---------------------------------------------------------------------------

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

  it("passes managed seats without byom config", () => {
    expect(validateDeployFromSeat(base)).toBeNull();
  });

  it("passes all seat plans with valid configuration", () => {
    for (const plan of ["seat-standard", "seat-max"] as const) {
      expect(
        validateDeployFromSeat({
          ...base,
          seatPlan: plan,
        }),
      ).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// buildDeployPayload
// ---------------------------------------------------------------------------

describe("buildDeployPayload", () => {
  const base = {
    deployToken: "  tok ",
    deployAllowlist: " 123 ",
    seatPlan: "seat-standard" as const,
    billingInterval: "month" as const,
    locale: "en",
    subscriptionItemId: "si_1",
    deployModelPreset: "gpt",
  };

  it("builds managed Standard payload", () => {
    const payload = buildDeployPayload(base);
    expect(payload.ai_source).toBe("managed");
    expect(payload.model_preset).toBe("gpt");
    expect(payload.tg_token).toBe("tok");
    expect(payload.tg_allow).toBe("123");
    expect(payload.seat_plan).toBe("seat-standard");
    expect(payload.target_runtime).toBe("hermes");
  });

  it("sets yearly billing interval", () => {
    const payload = buildDeployPayload({ ...base, billingInterval: "year" });
    expect(payload.billing_interval).toBe("year");
  });
});

// ---------------------------------------------------------------------------
// validateRedeployInput
// ---------------------------------------------------------------------------

describe("validateRedeployInput", () => {
  const base = {
    seatPlan: "seat-standard" as const,
    redeployToken: "x",
    redeployAllowlist: "1234",
    hasSavedTelegramUserId: false,
    redeployExistingAgents: [] as {
      agentId: string;
      token: string;
      model: string;
    }[],
    isValidAgentId: () => true,
  };

  it("requires token", () => {
    expect(validateRedeployInput({ ...base, redeployToken: "" })).toBe(
      "Telegram Bot Token is required.",
    );
  });

  it("requires allowlist without saved id", () => {
    expect(validateRedeployInput({ ...base, redeployAllowlist: "" })).toBe(
      "Telegram Allow list is required.",
    );
  });

  it("validates extra agent tokens", () => {
    expect(
      validateRedeployInput({
        ...base,
        redeployExistingAgents: [{ agentId: "bad", token: "", model: "gpt" }],
      }),
    ).toBe("Telegram Bot Token is required for bad.");
  });

  it("validates extra agent models", () => {
    expect(
      validateRedeployInput({
        ...base,
        redeployExistingAgents: [{ agentId: "a1", token: "t", model: "" }],
      }),
    ).toBe("Model is required for a1.");
  });

  it("validates extra agent IDs", () => {
    expect(
      validateRedeployInput({
        ...base,
        redeployExistingAgents: [{ agentId: "", token: "t", model: "m" }],
        isValidAgentId: () => false,
      }),
    ).toBe("Invalid Agent ID: (empty)");
  });

  it("validates redeploy allowlist after byom and agent checks pass", () => {
    expect(
      validateRedeployInput({
        ...base,
        redeployAllowlist: "123",
      }),
    ).toBe("Telegram User ID must contain 4-20 digits.");
  });
});

// ---------------------------------------------------------------------------
// buildRedeployPayload
// ---------------------------------------------------------------------------

describe("buildRedeployPayload", () => {
  const base = {
    redeployToken: " t ",
    redeployAllowlist: " a ",
    seatPlan: "seat-standard" as const,
    billingInterval: "month" as const,
    locale: "en",
    subscriptionItemId: "si_1",
    sourceSid: "sid_1",
    seatIdentity: "seat_1",
    redeployModelPreset: "gpt",
  };

  it("builds seat-standard managed payload", () => {
    const payload = buildRedeployPayload(base);
    expect(payload.seat_id).toBe("seat_1");
    expect(payload.ai_mode).toBe("default");
    expect(payload.model_preset).toBe("gpt");
    expect(payload.ai_source).toBe("managed");
    expect(payload.source_sid).toBe("sid_1");
  });

  it("omits seat_id when empty", () => {
    const payload = buildRedeployPayload({ ...base, seatIdentity: "" });
    expect(payload.seat_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// add agent helpers
// ---------------------------------------------------------------------------

describe("validateAddAgentInput", () => {
  const base = {
    generatedAgentId: "agent_abc",
    token: "t",
    allowlist: "1234",
    hasSavedTelegramUserId: false,
    modelPreset: "gpt",
    isValidAgentId: () => true,
  };

  it("rejects runner without add_agent capability", () => {
    expect(
      validateAddAgentInput({ ...base, runnerCapabilities: ["x"] }),
    ).toContain("does not support Add Agent yet");
  });

  it("passes when runnerCapabilities includes add_agent", () => {
    expect(
      validateAddAgentInput({
        ...base,
        runnerCapabilities: ["add_agent"],
      }),
    ).toBeNull();
  });

  it("passes when runnerCapabilities is undefined (legacy check skipped)", () => {
    expect(validateAddAgentInput(base)).toBeNull();
  });

  it("rejects invalid agent id", () => {
    expect(
      validateAddAgentInput({
        ...base,
        generatedAgentId: "",
        isValidAgentId: () => false,
      }),
    ).toContain("agent ID is invalid");
  });

  it("requires token in non-edit mode", () => {
    expect(validateAddAgentInput({ ...base, token: "" })).toBe(
      "Telegram Bot Token is required.",
    );
  });

  it("allows empty token in edit mode", () => {
    expect(
      validateAddAgentInput({ ...base, token: "", isEditing: true }),
    ).toBeNull();
  });

  it("requires allowlist without saved telegram id", () => {
    expect(validateAddAgentInput({ ...base, allowlist: "" })).toBe(
      "Telegram Allow list is required.",
    );
  });

  it("allows empty allowlist with saved telegram id", () => {
    expect(
      validateAddAgentInput({
        ...base,
        allowlist: "",
        hasSavedTelegramUserId: true,
      }),
    ).toBeNull();
  });

  it("requires model preset", () => {
    expect(validateAddAgentInput({ ...base, modelPreset: "   " })).toBe(
      "Model is required.",
    );
  });

  it("validates add-agent allowlist after required checks pass", () => {
    expect(validateAddAgentInput({ ...base, allowlist: "123" })).toBe(
      "Telegram User ID must contain 4-20 digits.",
    );
  });
});

describe("buildAddAgentPayload", () => {
  it("builds managed payload with model_preset", () => {
    const result = buildAddAgentPayload({
      generatedAgentId: "a1",
      token: "t",
      allowlist: "1234",
      modelPreset: "gpt",
      seatPlan: "seat-standard",
    });
    expect(result.type).toBe("add_agent");
    const p = result.payload as Record<string, unknown>;
    expect(p.model_preset).toBe("gpt");
    expect(p.ai_source).toBe("managed");
    expect(p.target_runtime).toBe("openclaw");
    expect(p.model).toBeUndefined();
    expect(p.service_name).toBeUndefined();
  });

  it("builds Hermes runtime payload when selected", () => {
    const result = buildAddAgentPayload({
      generatedAgentId: "a1",
      token: "t",
      allowlist: "1234",
      modelPreset: "gpt",
      runtime: "hermes",
      seatPlan: "seat-standard",
    });
    const p = result.payload as Record<string, unknown>;
    expect(p.target_runtime).toBe("hermes");
  });

  it("omits tg_token when editing without token change", () => {
    const result = buildAddAgentPayload({
      generatedAgentId: "a3",
      accountId: "acct_3",
      token: "",
      allowlist: "1234",
      modelPreset: "gpt",
      seatPlan: "seat-standard",
    });
    const p = result.payload as Record<string, unknown>;
    expect(p.account_id).toBe("acct_3");
    expect(p.tg_token).toBeUndefined();
  });

  it("uses generatedAgentId as fallback account_id", () => {
    const result = buildAddAgentPayload({
      generatedAgentId: "a5",
      token: "t",
      allowlist: "1234",
      modelPreset: "gpt",
      seatPlan: "seat-standard",
    });
    const p = result.payload as Record<string, unknown>;
    expect(p.account_id).toBe("a5");
  });
});
