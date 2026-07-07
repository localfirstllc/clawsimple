import { describe, expect, it } from "vitest";
import { findTelegramTokenConflictInAssignments } from "./telegram-token-conflicts-core";

describe("findTelegramTokenConflictInAssignments", () => {
  const assignments = [
    {
      sid: "sid_main",
      deploymentName: "Main Deploy",
      agentId: "main",
      agentDisplayName: null,
      token: "tok_main",
    },
    {
      sid: "sid_agent",
      deploymentName: "Agent Deploy",
      agentId: "agent_a",
      agentDisplayName: "Agent A",
      token: "tok_agent",
    },
  ];

  it("returns null when token is not assigned", () => {
    expect(
      findTelegramTokenConflictInAssignments(assignments, { token: "tok_missing" })
    ).toBeNull();
  });

  it("detects conflict with main deployment token", () => {
    expect(
      findTelegramTokenConflictInAssignments(assignments, { token: "tok_main" })
    ).toEqual({
      sid: "sid_main",
      deploymentName: "Main Deploy",
      agentId: "main",
      agentDisplayName: null,
    });
  });

  it("detects conflict with extra agent token", () => {
    expect(
      findTelegramTokenConflictInAssignments(assignments, { token: "tok_agent" })
    ).toEqual({
      sid: "sid_agent",
      deploymentName: "Agent Deploy",
      agentId: "agent_a",
      agentDisplayName: "Agent A",
    });
  });

  it("ignores the current agent when editing", () => {
    expect(
      findTelegramTokenConflictInAssignments(assignments, {
        token: "tok_agent",
        ignore: { sid: "sid_agent", agentId: "agent_a" },
      })
    ).toBeNull();
  });
});
