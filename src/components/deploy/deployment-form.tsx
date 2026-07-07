"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  HelpCircle,
  Info,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD,
  DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD,
} from "@/lib/billing/managed-credit-defaults";
import type {
  BillingStatusResponse,
  DeployAgentRuntime,
  DeployModelPreset,
  DeploySeatPlanChoice,
} from "@/hooks/use-deployment";

type PresetModelOption = {
  model_id: string;
  display_name: string;
  is_default?: boolean;
  unit_price_usd?: number;
};

interface DeploymentFormProps {
  title?: string;
  description?: ReactNode;
  tgToken: string;
  setTgToken: (val: string) => void;
  tgAllow: string;
  setTgAllow: (val: string) => void;
  modelPreset: DeployModelPreset;
  setModelPreset: (val: DeployModelPreset) => void;
  agentRuntime: DeployAgentRuntime;
  setAgentRuntime: (val: DeployAgentRuntime) => void;
  seatPlanChoice: DeploySeatPlanChoice;
  setSeatPlanChoice: (val: DeploySeatPlanChoice) => void;
  billingInterval: "month" | "year"; // Added
  setBillingInterval: (val: "month" | "year") => void; // Added
  onOpenHelp: (mode: "token" | "allowlist") => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  canSubmit: boolean;
  billingStatus: BillingStatusResponse | null;
  notice: string | null;
  error: string | null;
  tgTokenError?: string | null;
  tgAllowError?: string | null;
  promoCode: string;
  setPromoCode: (val: string) => void;
  promoStatus: "idle" | "validating" | "valid" | "invalid";
  promoMessage: string | null;
  discount: { percent_off: number | null; amount_off: number | null } | null;
  validatePromoCode: () => void;
  hasDeployments: boolean;
  modelOptions: PresetModelOption[];
  defaultManagedModelPreset: string;
  hasSavedTelegramUserId?: boolean;
  isTelegramLoading?: boolean;
  billingIntervalLocked?: boolean;
  seatPlanLocked?: boolean;
  hidePromoCode?: boolean;
  submitLabel?: string;
  planHelperText?: string;
  legacyLockedPlan?: {
    title: string;
    description: string;
    badge: string;
  } | null;
}

export function DeploymentForm(props: DeploymentFormProps) {
  const t = useTranslations("deploy.form");
  const [showPromoInput, setShowPromoInput] = useState(false);

  const runtimeOptions: Array<{
    value: DeployAgentRuntime;
    title: string;
    description: string;
    logo: string;
  }> = [
    {
      value: "hermes",
      title: t("runtimeHermes"),
      description: t("runtimeHermesDesc"),
      logo: "/nousresearch.svg",
    },
    {
      value: "openclaw",
      title: t("runtimeOpenClaw"),
      description: t("runtimeOpenClawDesc"),
      logo: "/openclaw.svg",
    },
  ];

  const planOptions: Array<{
    value: DeploySeatPlanChoice;
    title: string;
    description: string;
    badge: string;
  }> = [
    {
      value: "standard",
      title: t("planStandard"),
      description: t("planStandardDesc"),
      badge: t("planPrivateBadge"),
    },
    {
      value: "max",
      title: t("planMax"),
      description: t("planMaxDesc"),
      badge: t("planPrivateBadge"),
    },
  ];
  const displayedPlanOptions =
    props.legacyLockedPlan != null
      ? [
          {
            value: props.seatPlanChoice,
            title: props.legacyLockedPlan.title,
            description: props.legacyLockedPlan.description,
            badge: props.legacyLockedPlan.badge,
          },
        ]
      : planOptions;

  const selectPlan = (plan: DeploySeatPlanChoice) => {
    if (props.seatPlanLocked) return;
    props.setSeatPlanChoice(plan);
  };

  return (
    <Card className="border-[#e8ded4] bg-white/90 shadow-[0_24px_60px_-40px_rgba(23,21,18,0.45)] dark:bg-zinc-900/90 dark:border-zinc-800">
      <CardHeader>
        <CardTitle className="text-2xl dark:text-zinc-50">
          {props.title ?? t("title")}
        </CardTitle>
        {props.description ? (
          <div className="text-sm text-[#6f655f] dark:text-zinc-400">
            {props.description}
          </div>
        ) : null}
        {props.hasDeployments && (
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
              <Info className="h-3.5 w-3.5" />
              {t("existingDeploymentFound")}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-2">
        <form onSubmit={props.onSubmit} className="space-y-5 lg:space-y-6">
          {/* Billing Cycle Toggle */}
          <div className="flex justify-center pb-2">
            <div className="relative flex w-full max-w-xs rounded-full border border-[#e4cbb9] bg-[#f3e8dc] p-1 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                disabled={props.billingIntervalLocked}
                onClick={() => props.setBillingInterval("month")}
                className={cn(
                  "min-w-0 flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4",
                  props.billingInterval === "month"
                    ? "brand-cta text-[#fff7f2] shadow-sm"
                    : "text-[#8a817c] hover:text-[#5e5652] dark:text-zinc-400 dark:hover:text-zinc-200",
                  props.billingIntervalLocked &&
                    "cursor-not-allowed opacity-70",
                )}
              >
                {t("monthly")}
              </button>
              <button
                type="button"
                disabled={props.billingIntervalLocked}
                onClick={() => props.setBillingInterval("year")}
                className={cn(
                  "min-w-0 flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4",
                  props.billingInterval === "year"
                    ? "brand-cta text-[#fff7f2] shadow-sm"
                    : "text-[#8a817c] hover:text-[#5e5652] dark:text-zinc-400 dark:hover:text-zinc-200",
                  props.billingIntervalLocked &&
                    "cursor-not-allowed opacity-70",
                )}
              >
                {t("yearly")}{" "}
                <span className="ml-1 text-emerald-600 text-xs">
                  {t("yearlyDiscount")}
                </span>
              </button>
            </div>
          </div>

          {/* Hidden input removed, handled by parent state */}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-[#8a817c] dark:text-zinc-400">
                {t("runtimeLabel")}
              </Label>
              <Tooltip content={t("tooltips.runtime")}>
                <Info className="h-3.5 w-3.5 text-[#a55b3a] dark:text-zinc-500 cursor-help" />
              </Tooltip>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {runtimeOptions.map((option) => {
                const selected = props.agentRuntime === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => props.setAgentRuntime(option.value)}
                    className={cn(
                      "flex min-h-[5.5rem] flex-col rounded-lg border px-4 py-3 text-left transition-all",
                      selected
                        ? "brand-cta border-[#e2542a] text-[#fff7f2] shadow-lg shadow-[#e2542a]/20 dark:border-[#81252d]"
                        : "border-[#e7ddd2] bg-[#fbf8f3] text-[#171512] hover:border-[#cbb9aa] hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-900",
                    )}
                    aria-pressed={selected}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                      <img
                        src={option.logo}
                        alt=""
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                      />
                      {option.title}
                    </span>
                    <span
                      className={cn(
                        "mt-2 text-sm leading-5",
                        selected
                          ? "text-[#efe6dc]"
                          : "text-[#6f655f] dark:text-zinc-400",
                      )}
                    >
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <div className="space-y-2">
              <Label htmlFor="tg-allow" className="flex items-center gap-2">
                {t("userLabel")} *
                <button
                  type="button"
                  onClick={() => props.onOpenHelp("allowlist")}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#e7ddd2] text-[#a55b3a] transition hover:border-[#e2542a] hover:text-[#e2542a]"
                  aria-label={t("userHelp")}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </Label>
              {props.isTelegramLoading ? (
                <div className="h-10 w-full animate-pulse rounded-md bg-[#f6f1ea]" />
              ) : (
                <Input
                  id="tg-allow"
                  value={props.tgAllow}
                  onChange={(event) => props.setTgAllow(event.target.value)}
                  placeholder={
                    props.hasSavedTelegramUserId
                      ? t("userPlaceholderSaved")
                      : t("userPlaceholder")
                  }
                  autoComplete="off"
                  readOnly={props.hasSavedTelegramUserId === true}
                  aria-invalid={props.tgAllowError ? "true" : undefined}
                  aria-describedby={
                    props.tgAllowError ? "tg-allow-error" : undefined
                  }
                  className={cn(
                    props.tgAllowError &&
                      "border-red-500 focus-visible:ring-red-500",
                  )}
                />
              )}
              {props.tgAllowError ? (
                <p id="tg-allow-error" className="text-xs text-red-600">
                  {props.tgAllowError}
                </p>
              ) : null}
              <p className="text-xs text-[#8a817c]">
                {props.isTelegramLoading
                  ? t("checkingProfile")
                  : props.hasSavedTelegramUserId
                    ? t("userSavedHint")
                    : t("userHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tg-token" className="flex items-center gap-2">
                {t("tokenLabel")} *
                <button
                  type="button"
                  onClick={() => props.onOpenHelp("token")}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#e7ddd2] text-[#a55b3a] transition hover:border-[#e2542a] hover:text-[#e2542a]"
                  aria-label={t("tokenHelp")}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </Label>
              <Input
                id="tg-token"
                value={props.tgToken}
                onChange={(event) => props.setTgToken(event.target.value)}
                placeholder={t("tokenPlaceholder")}
                autoComplete="off"
                aria-invalid={props.tgTokenError ? "true" : undefined}
                aria-describedby={
                  props.tgTokenError ? "tg-token-error" : undefined
                }
                className={cn(
                  props.tgTokenError &&
                    "border-red-500 focus-visible:ring-red-500",
                )}
              />
              {props.tgTokenError ? (
                <p id="tg-token-error" className="text-xs text-red-600">
                  {props.tgTokenError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 lg:space-y-5">
            {/* 1. Plan Selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[#e4cbb9] bg-[#f8ecdf] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a55b3a] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {t("stepOne")}
                </span>
                <Label className="text-xs font-medium uppercase tracking-wider text-[#8a817c] dark:text-zinc-400">
                  {t("planLabel")}
                </Label>
                <Tooltip content={t("tooltips.plan")}>
                  <Info className="h-3.5 w-3.5 text-[#a55b3a] dark:text-zinc-500 cursor-help" />
                </Tooltip>
              </div>
              <p className="text-xs text-[#8a817c] dark:text-zinc-400">
                {props.planHelperText ?? t("planHelper")}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {displayedPlanOptions.map((option) => {
                  const selected = props.seatPlanChoice === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => selectPlan(option.value)}
                      disabled={props.seatPlanLocked}
                      className={cn(
                        "flex h-full flex-col rounded-2xl border px-4 py-4 text-left transition-all",
                        selected
                          ? "brand-cta border-[#e2542a] text-[#fff7f2] shadow-lg shadow-[#e2542a]/20 dark:border-[#81252d]"
                          : "border-[#e7ddd2] bg-[#fbf8f3] text-[#171512] hover:border-[#cbb9aa] hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-900",
                        props.seatPlanLocked && "cursor-not-allowed",
                      )}
                    >
                      <div className="flex min-h-[2.75rem] items-start justify-between gap-3">
                        <span className="text-sm font-semibold sm:text-base">
                          {option.title}
                        </span>
                        <span
                          className={cn(
                            "inline-flex h-6 shrink-0 items-center rounded-full px-3 text-[11px] font-medium whitespace-nowrap",
                            selected
                              ? "bg-white/18 text-[#fff7f2]"
                              : "bg-[#f3e6d9] text-[#a55b3a] dark:bg-zinc-800 dark:text-zinc-300",
                          )}
                        >
                          {option.badge}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-3 flex-1 text-sm leading-5",
                          selected
                            ? "text-[#efe6dc]"
                            : "text-[#6f655f] dark:text-zinc-400",
                        )}
                      >
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[#e4cbb9] bg-[#f8ecdf] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a55b3a] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {t("stepTwo")}
                </span>
                <Label className="text-xs font-medium uppercase tracking-wider text-[#8a817c] dark:text-zinc-400">
                  {t("managedSetupTitle")}
                </Label>
                <Tooltip content={t("tooltips.model")}>
                  <Info className="h-3.5 w-3.5 text-[#a55b3a] dark:text-zinc-500 cursor-help" />
                </Tooltip>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {props.modelOptions.map((opt) => {
                  const selected = props.modelPreset === opt.model_id;
                  return (
                    <Button
                      key={opt.model_id}
                      type="button"
                      variant="outline"
                      onClick={() => props.setModelPreset(opt.model_id)}
                      className={cn(
                        "h-11 justify-center rounded-xl border-[#e7ddd2] bg-white/50 text-[#171512] hover:bg-white relative dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:bg-zinc-750",
                        selected &&
                          "brand-cta border-[#e2542a] text-[#fff7f2] hover:brightness-105 dark:border-[#81252d] shadow-lg shadow-[#e2542a]/20 dark:shadow-zinc-900/50",
                      )}
                      aria-pressed={selected}
                    >
                      <span className="flex items-center gap-1.5 text-sm">
                        {opt.display_name}
                      </span>
                    </Button>
                  );
                })}
              </div>

              {props.modelOptions
                .filter((opt) => opt.model_id === props.modelPreset)
                .map((opt) => {
                  const unitPrice = opt.unit_price_usd ?? 0;
                  if (unitPrice < 0.1) return null;

                  const quota =
                    props.seatPlanChoice === "max"
                      ? DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD
                      : DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD;
                  const estimatedCount = unitPrice > 0 ? quota / unitPrice : 0;
                  const minEst = Math.max(1, Math.floor(estimatedCount * 0.9));
                  const maxEst = Math.max(
                    minEst + 1,
                    Math.ceil(estimatedCount * 1.1),
                  );
                  const rangeString = `${minEst}-${maxEst}`;

                  return (
                    <div
                      key="cost-warning"
                      className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30 dark:border-amber-600"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0 dark:text-amber-500" />
                        <p className="text-amber-900 dark:text-amber-200">
                          {t.rich("modelCostWarning", {
                            price:
                              props.seatPlanChoice === "max"
                                ? String(
                                    DEFAULT_INCLUDED_MANAGED_CREDITS_MAX_USD,
                                  )
                                : String(
                                    DEFAULT_INCLUDED_MANAGED_CREDITS_STANDARD_USD,
                                  ),
                            messageCount: rangeString,
                            command: (chunks) => (
                              <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">
                                {chunks}
                              </code>
                            ),
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}

              <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#f0eadd]/50 p-3 text-xs text-[#8a817c] dark:bg-zinc-800/50 dark:text-zinc-400">
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#b85a34] dark:text-zinc-500" />
                <p>{t("modelSwitchHint")}</p>
              </div>
            </div>
          </div>

          {!props.hidePromoCode ? (
            <div className="space-y-2 lg:space-y-3">
              {!showPromoInput && !props.discount ? (
                <button
                  type="button"
                  onClick={() => setShowPromoInput(true)}
                  className="text-sm text-[#a55b3a] hover:text-[#e2542a] hover:underline"
                >
                  {t("havePromo")}
                </button>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="promo-code">{t("promoLabel")}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="min-w-0 flex-1">
                      <Input
                        id="promo-code"
                        value={props.promoCode}
                        onChange={(e) => {
                          props.setPromoCode(e.target.value);
                        }}
                        onBlur={props.validatePromoCode}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            props.validatePromoCode();
                          }
                        }}
                        placeholder={t("promoPlaceholder")}
                        className={cn(
                          props.promoStatus === "valid" &&
                            "border-green-500 focus-visible:ring-green-500",
                          props.promoStatus === "invalid" &&
                            "border-red-500 focus-visible:ring-red-500",
                        )}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={props.validatePromoCode}
                      disabled={
                        !props.promoCode || props.promoStatus === "validating"
                      }
                      className="w-full sm:w-auto"
                    >
                      {props.promoStatus === "validating" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("apply")
                      )}
                    </Button>
                  </div>
                  {props.promoMessage && (
                    <p
                      className={cn(
                        "text-xs",
                        props.promoStatus === "valid"
                          ? "text-green-600"
                          : "text-red-600",
                      )}
                    >
                      {props.promoMessage}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <Separator className="bg-[#e8ded4]" />

          {props.notice && (
            <div className="rounded-2xl border border-[#d6c8ba] bg-[#fff8ef] px-4 py-3 text-sm text-[#7a5a43]">
              {props.notice}
            </div>
          )}

          {props.error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {props.error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full rounded-full text-[#fff7f2] hover:brightness-105 transition-all duration-200"
            disabled={!props.canSubmit || props.isSubmitting}
          >
            {props.isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("working")}
              </span>
            ) : props.submitLabel ? (
              <span>{props.submitLabel}</span>
            ) : props.billingStatus?.payment_ready ? (
              <span>{t("deployNow")}</span>
            ) : (
              t("addPayment")
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
