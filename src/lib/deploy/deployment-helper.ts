import type { DeploySeatPlanChoice } from "@/hooks/use-deployment";
import { validateTelegramUserIdAllowlist } from "../telegram/allowlist";

export type SeatPlan = "seat-standard" | "seat-max" | "unknown";
export type BillingInterval = "month" | "year" | "unknown";
export type AiSource = "managed";
export type AgentRuntime = "hermes" | "openclaw";

type BuildDeployPayloadInput = {
  tgToken: string;
  tgAllow: string;
  seatPlanChoice: DeploySeatPlanChoice;
  billingInterval: "month" | "year";
  locale: string;
  subscriptionItemId?: string;
  agentRuntime: AgentRuntime;
  modelPreset: string;
  promoCode?: string;
  promoStatus?: "idle" | "validating" | "valid" | "invalid";
};

export type DeployPayload = {
  tg_token: string;
  tg_allow: string;
  model_preset?: string;
  ai_source: AiSource;
  seat_plan: Exclude<SeatPlan, "unknown">;
  locale: string;
  promo_code?: string;
  billing_interval: "month" | "year";
  subscription_item_id?: string;
  target_runtime: AgentRuntime;
};

const TELEGRAM_BOT_TOKEN_RE = /^\d{6,20}:[A-Za-z0-9_-]{30,}$/;

export type DeployFormValidationResult = {
  tgTokenError: string | null;
  tgAllowError: string | null;
};

export function mapSeatPlanChoice(
  choice: DeploySeatPlanChoice,
): Exclude<SeatPlan, "unknown"> {
  return choice === "max" ? "seat-max" : "seat-standard";
}

export function buildDeployPayload(
  input: BuildDeployPayloadInput,
): DeployPayload {
  return {
    tg_token: input.tgToken.trim(),
    tg_allow: input.tgAllow.trim(),
    model_preset: input.modelPreset,
    ai_source: "managed",
    seat_plan: mapSeatPlanChoice(input.seatPlanChoice),
    locale: input.locale,
    promo_code:
      input.promoStatus === "valid"
        ? input.promoCode?.trim() || undefined
        : undefined,
    billing_interval: input.billingInterval,
    subscription_item_id: input.subscriptionItemId,
    target_runtime: input.agentRuntime,
  };
}

type ValidateDeployFromSeatInput = {
  seatPlan: SeatPlan;
  deployToken: string;
  deployAllowlist: string;
  hasSavedTelegramUserId: boolean;
};

export function validateDeployFromSeat(input: ValidateDeployFromSeatInput) {
  if (!input.deployToken.trim()) {
    return "Telegram Bot Token is required.";
  }
  if (!TELEGRAM_BOT_TOKEN_RE.test(input.deployToken.trim())) {
    return "Telegram Bot Token must look like 123456789:ABC-DEF... from @BotFather.";
  }
  if (!input.deployAllowlist.trim() && !input.hasSavedTelegramUserId) {
    return "Telegram Allow list is required.";
  }
  return validateTelegramUserIdAllowlist(input.deployAllowlist);
}

export function validateDeployFormInput(input: {
  tgToken: string;
  tgAllow: string;
}): DeployFormValidationResult {
  const tgToken = input.tgToken.trim();
  const tgAllow = input.tgAllow.trim();

  return {
    tgTokenError: !tgToken
      ? "Telegram Bot Token is required."
      : TELEGRAM_BOT_TOKEN_RE.test(tgToken)
        ? null
        : "Telegram Bot Token must look like 123456789:ABC-DEF... from @BotFather.",
    tgAllowError: !tgAllow
      ? "Telegram User ID is required."
      : validateTelegramUserIdAllowlist(tgAllow),
  };
}
