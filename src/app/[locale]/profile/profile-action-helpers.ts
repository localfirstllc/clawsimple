import {
  buildDeployPayload as buildSharedDeployPayload,
  validateDeployFromSeat,
  type BillingInterval,
  type SeatPlan,
} from "../../../lib/deploy/deployment-helper";
import { validateTelegramUserIdAllowlist } from "../../../lib/telegram/allowlist";

export { validateDeployFromSeat };

type BuildDeployPayloadInput = {
  deployToken: string;
  deployAllowlist: string;
  seatPlan: SeatPlan;
  billingInterval: BillingInterval;
  locale: string;
  subscriptionItemId: string;
  agentRuntime?: "openclaw" | "hermes";
  deployModelPreset: string;
};

export const buildDeployPayload = (
  input: BuildDeployPayloadInput,
): Record<string, string> =>
  buildSharedDeployPayload({
    tgToken: input.deployToken,
    tgAllow: input.deployAllowlist,
    seatPlanChoice: input.seatPlan === "seat-max" ? "max" : "standard",
    billingInterval: input.billingInterval === "year" ? "year" : "month",
    locale: input.locale,
    subscriptionItemId: input.subscriptionItemId,
    agentRuntime: input.agentRuntime ?? "hermes",
    modelPreset: input.deployModelPreset,
  });

type RedeployExtraAgent = {
  agentId: string;
  token: string;
  model: string;
};

type RedeployValidationInput = {
  seatPlan: SeatPlan;
  redeployToken: string;
  redeployAllowlist: string;
  hasSavedTelegramUserId: boolean;
  redeployExistingAgents: RedeployExtraAgent[];
  isValidAgentId: (agentId: string) => boolean;
};

export const validateRedeployInput = (input: RedeployValidationInput) => {
  if (!input.redeployToken.trim()) {
    return "Telegram Bot Token is required.";
  }
  if (!input.redeployAllowlist.trim() && !input.hasSavedTelegramUserId) {
    return "Telegram Allow list is required.";
  }
  for (const extra of input.redeployExistingAgents) {
    const agentId = extra.agentId.trim();
    const token = extra.token.trim();
    const model = extra.model.trim();
    if (!agentId || !input.isValidAgentId(agentId)) {
      return `Invalid Agent ID: ${agentId || "(empty)"}`;
    }
    if (!token) {
      return `Telegram Bot Token is required for ${agentId}.`;
    }
    if (!model) {
      return `Model is required for ${agentId}.`;
    }
  }
  return validateTelegramUserIdAllowlist(input.redeployAllowlist);
};

type BuildRedeployPayloadInput = {
  redeployToken: string;
  redeployAllowlist: string;
  seatPlan: SeatPlan;
  billingInterval: BillingInterval;
  locale: string;
  subscriptionItemId: string;
  sourceSid: string;
  seatIdentity: string;
  redeployCustomModels?: string;
  redeployModelPreset: string;
};

export const buildRedeployPayload = (
  input: BuildRedeployPayloadInput,
): Record<string, string> => {
  const payload: Record<string, string> = {
    tg_token: input.redeployToken.trim(),
    tg_allow: input.redeployAllowlist.trim(),
    seat_plan: input.seatPlan,
    billing_interval: input.billingInterval,
    locale: input.locale,
    subscription_item_id: input.subscriptionItemId,
    source_sid: input.sourceSid,
    ai_source: "managed",
    ai_mode: "default",
    model_preset: input.redeployModelPreset,
  };
  if (input.seatIdentity) {
    payload.seat_id = input.seatIdentity;
  }
  return payload;
};

type AddAgentValidationInput = {
  runnerCapabilities?: string[];
  generatedAgentId: string;
  token: string;
  allowlist: string;
  hasSavedTelegramUserId: boolean;
  modelPreset: string;
  runtime?: "openclaw" | "hermes";
  hermesAgentInstalled?: boolean;
  isEditing?: boolean;
  isValidAgentId: (agentId: string) => boolean;
};

export const validateAddAgentInput = (input: AddAgentValidationInput) => {
  if (
    Array.isArray(input.runnerCapabilities) &&
    !input.runnerCapabilities.includes("add_agent")
  ) {
    return "This server runner version does not support Add Agent yet. Please contact support to update the server runner.";
  }
  if (
    !input.generatedAgentId ||
    !input.isValidAgentId(input.generatedAgentId)
  ) {
    return "Generated agent ID is invalid. Please regenerate and try again.";
  }
  if (!input.isEditing && !input.token) {
    return "Telegram Bot Token is required.";
  }
  if (!input.allowlist && !input.hasSavedTelegramUserId) {
    return "Telegram Allow list is required.";
  }
  if (!input.modelPreset.trim()) {
    return "Model is required.";
  }
  if (
    !input.isEditing &&
    input.runtime === "hermes" &&
    input.hermesAgentInstalled !== true
  ) {
    return "Hermes is not installed on this server. Please contact support to enable it.";
  }
  return validateTelegramUserIdAllowlist(input.allowlist);
};

type BuildAddAgentPayloadInput = {
  generatedAgentId: string;
  accountId?: string;
  token: string;
  allowlist: string;
  modelPreset: string;
  runtime?: "openclaw" | "hermes";
  seatPlan: SeatPlan;
};

export const buildAddAgentPayload = (input: BuildAddAgentPayloadInput) => ({
  type: "add_agent",
  payload: {
    agent_id: input.generatedAgentId,
    account_id: input.accountId?.trim() || input.generatedAgentId,
    ...(input.token.trim() ? { tg_token: input.token.trim() } : {}),
    tg_allow: input.allowlist,
    ai_source: "managed",
    model_preset: input.modelPreset,
    target_runtime: input.runtime === "hermes" ? "hermes" : "openclaw",
  },
});
