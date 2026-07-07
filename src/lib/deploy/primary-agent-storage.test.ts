import { describe, expect, it } from "vitest";
import {
  buildPrimarySessionUpdates,
  getPersistedAgentTokenCiphertext,
  isPrimaryAgentId,
} from "./primary-agent-storage";

describe("primary-agent-storage", () => {
  it("recognizes main as the only primary agent id", () => {
    expect(isPrimaryAgentId("main")).toBe(true);
    expect(isPrimaryAgentId("agent_a")).toBe(false);
  });

  it("does not persist a duplicate token on deployment_agents for main", () => {
    expect(
      getPersistedAgentTokenCiphertext({
        agentId: "main",
        tgTokenCiphertext: "sealed-token",
      })
    ).toBeNull();
  });

  it("keeps per-agent tokens for extra agents", () => {
    expect(
      getPersistedAgentTokenCiphertext({
        agentId: "agent_a",
        tgTokenCiphertext: "sealed-token",
      })
    ).toBe("sealed-token");
  });

  it("builds install_sessions updates for primary model, token, and username", () => {
    expect(
      buildPrimarySessionUpdates({
        model: "clawsimple/claude-sonnet-4-6",
        tgTokenCiphertext: "sealed-token",
        telegramUsername: "bot_name",
      })
    ).toEqual({
      lastModel: "clawsimple/claude-sonnet-4-6",
      tgTokenCiphertext: "sealed-token",
      telegramUsername: "bot_name",
    });
  });

  it("omits token and username updates when those values are empty", () => {
    expect(
      buildPrimarySessionUpdates({
        model: "clawsimple/claude-sonnet-4-6",
        tgTokenCiphertext: null,
        telegramUsername: null,
      })
    ).toEqual({
      lastModel: "clawsimple/claude-sonnet-4-6",
    });
  });
});
