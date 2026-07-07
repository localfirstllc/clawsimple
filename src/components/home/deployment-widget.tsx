"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";

import { DeployConfirmModal } from "@/components/deploy/deploy-confirm-modal";

import { useDeployment } from "@/hooks/use-deployment";
import { DeploymentForm } from "@/components/deploy/deployment-form";
import { DeploymentStatusCard } from "@/components/deploy/deployment-status-card";
import { DeploymentSecurityCard } from "@/components/deploy/deployment-security-card";
import { DeploymentHelpModals } from "@/components/deploy/deployment-help-modals";
import { DeployStatusModal } from "@/components/deploy/deploy-status-modal";
import { PRICING } from "@/data/pricing";
import {
  buildDeployPayload,
  validateDeployFormInput,
  type DeployPayload,
  type DeployFormValidationResult,
} from "@/lib/deploy/deployment-helper";
import {
  buildCheckoutAttributionPayload,
  trackGoogleAdsConversion,
  trackGoogleEvent,
} from "@/lib/analytics/google-ads";
import { trackUmami } from "@/lib/analytics/umami";

const PENDING_DEPLOY_KEY = "moltbot_pending_deploy";

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

interface DeploymentWidgetProps {
  locale: string;
  initialModels: PresetModelOption[];
}

type PresetModelOption = {
  model_id: string;
  display_name: string;
  is_default?: boolean;
  unit_price_usd?: number;
};

export function DeploymentWidget({
  locale,
  initialModels,
}: DeploymentWidgetProps) {
  const { state, setters, actions } = useDeployment({ locale });
  const ts = useTranslations("deploy");
  const {
    tgToken,
    tgAllow,
    agentRuntime,
    modelPreset,
    seatPlanChoice,
    sid,
    status,
    seatStatus,
    graceUntil,
    error,
    notice,
    progress,
    telegramUsername,
    isSubmitting,
    billingStatus,
    hasDeployments,
    canSubmit,
    billingInterval,
  } = state;

  const {
    setTgToken,
    setTgAllow,
    setAgentRuntime,
    setModelPreset,
    setSeatPlanChoice,
    setError,
    setNotice,
    setIsSubmitting,
    setBillingInterval,
  } = setters;

  const { bootstrap } = actions;
  const bootstrappedRef = useRef(false);

  const [helpOpen, setHelpOpen] = useState<"token" | "allowlist" | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<DeployFormValidationResult>({
    tgTokenError: null,
    tgAllowError: null,
  });
  const [pendingDeployData, setPendingDeployData] = useState<
    | (DeployPayload & {
        subscription_item_id?: string;
      })
    | null
  >(null);

  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "validating" | "valid" | "invalid"
  >("idle");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [discount, setDiscount] = useState<{
    percent_off: number | null;
    amount_off: number | null;
  } | null>(null);
  const [modelOptions] = useState(initialModels);
  const [wizardTracked, setWizardTracked] = useState(false);
  // Keep deployment-status errors out of the form area to avoid confusing
  // users before they even fill in inputs.
  const managedPresetUnavailable =
    modelPreset !== "custom" && modelOptions.length === 0;
  const formError = sid
    ? null
    : managedPresetUnavailable
      ? "No managed model preset configured. Please add preset models in Admin first."
      : error;
  const seatPlanPricing =
    seatPlanChoice === "max" ? PRICING.MAX : PRICING.STANDARD;

  const defaultManagedModelPreset =
    modelOptions.find((item) => item.is_default)?.model_id ??
    modelOptions[0]?.model_id ??
    "";

  const deployFormDescription = !hasDeployments
    ? undefined
    : billingStatus?.seat_availability?.needs_new_seat === false
      ? ts("card.serverModal.useExistingSeat")
      : ts("card.serverModal.addSeat");

  useEffect(() => {
    if (modelPreset === "custom") return;
    if (modelOptions.length === 0) return;
    const found = modelOptions.some((item) => item.model_id === modelPreset);
    if (!found) {
      setModelPreset(defaultManagedModelPreset);
    }
  }, [defaultManagedModelPreset, modelOptions, modelPreset, setModelPreset]);

  // Handle returns from Stripe Checkout / auth redirects (anchor/action params).
  useEffect(() => {
    const url = new URL(window.location.href);
    const action = url.searchParams.get("action");
    const anchor = url.searchParams.get("anchor");

    const shouldScrollToDeploy =
      url.hash === "#deploy" ||
      anchor === "deploy" ||
      action === "complete-deploy";

    const scrollToDeploy = (behavior: ScrollBehavior) => {
      const el = document.getElementById("deploy");
      if (!el) return;
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        behavior: reduced ? "auto" : behavior,
        block: "start",
      });
    };

    if (shouldScrollToDeploy) {
      // Try multiple times to compensate for hydration/layout shifts (banner, sticky header, etc.)
      requestAnimationFrame(() => scrollToDeploy("smooth"));
      setTimeout(() => scrollToDeploy("smooth"), 250);
      setTimeout(() => scrollToDeploy("auto"), 1000);
    }

    if (action === "complete-deploy") {
      // Payment completed. Restore the draft, reset prior deploy status, but do NOT auto-deploy.
      actions.resetDeploymentState();
      const restoredNotice =
        "Payment complete. Review your details, then click Deploy when ready.";

      // Retrieve pending deploy draft
      const pendingRaw = sessionStorage.getItem(PENDING_DEPLOY_KEY);
      if (pendingRaw) {
        try {
          const pendingData = JSON.parse(pendingRaw);
          sessionStorage.removeItem(PENDING_DEPLOY_KEY);

          /* eslint-disable react-hooks/set-state-in-effect */
          setTgToken(pendingData.tg_token ?? "");
          setTgAllow(pendingData.tg_allow ?? "");

          const seatPlan = pendingData.seat_plan;
          const restoredSeatPlanChoice =
            seatPlan === "seat-max" ? "max" : "standard";

          const rawPreset = pendingData.model_preset;
          if (
            typeof rawPreset === "string" &&
            rawPreset.trim() &&
            rawPreset !== "custom"
          ) {
            setModelPreset(rawPreset);
          } else {
            setModelPreset(defaultManagedModelPreset);
          }

          setSeatPlanChoice(restoredSeatPlanChoice);
          if (
            pendingData.target_runtime === "openclaw" ||
            pendingData.target_runtime === "hermes"
          ) {
            setAgentRuntime(pendingData.target_runtime);
          } else {
            setAgentRuntime("hermes");
          }

          if (
            pendingData.billing_interval === "month" ||
            pendingData.billing_interval === "year"
          ) {
            setBillingInterval(pendingData.billing_interval);
          }

          if (typeof pendingData.promo_code === "string") {
            setPromoCode(pendingData.promo_code);
          } else {
            setPromoCode("");
          }
          setPromoStatus("idle");
          setPromoMessage(null);
          setDiscount(null);
        } catch {
          console.error("Failed to parse pending deploy data");
        }
        /* eslint-enable react-hooks/set-state-in-effect */
      }
      setNotice(restoredNotice);
    }

    if (action === "complete-deploy" && !bootstrappedRef.current) {
      bootstrappedRef.current = true;
      bootstrap();
    }

    // Clear URL params to prevent re-triggering / keep shareable URLs clean.
    if (action || anchor) {
      url.searchParams.delete("action");
      url.searchParams.delete("anchor");
      const search = url.searchParams.toString();
      const newUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, [
    actions,
    bootstrap,
    setBillingInterval,
    setDiscount,
    setModelPreset,
    setNotice,
    setPromoCode,
    setPromoMessage,
    setPromoStatus,
    setSeatPlanChoice,
    setAgentRuntime,
    setTgAllow,
    setTgToken,
    defaultManagedModelPreset,
  ]);

  const validatePromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoStatus("idle");
      setPromoMessage(null);
      setDiscount(null);
      return;
    }

    setPromoStatus("validating");
    try {
      const res = await fetch("/api/billing/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: promoCode }),
      });
      if (res.status === 401) {
        setPromoStatus("invalid");
        setPromoMessage("Please sign in to apply a promo code.");
        setDiscount(null);
        return;
      }
      const data = await res.json();

      if (data.valid) {
        setPromoStatus("valid");
        setPromoMessage(`Coupon applied: ${data.code}`);
        setDiscount(data.discount);
      } else {
        setPromoStatus("invalid");
        setPromoMessage(data.message || "Invalid promo code");
        setDiscount(null);
      }
    } catch {
      setPromoStatus("invalid");
      setPromoMessage("Validation failed");
      setDiscount(null);
    }
  };

  const redirectToSignIn = () => {
    const redirect = encodeURIComponent(`/${locale}?anchor=deploy`);
    window.location.href = `/${locale}/signin?redirect=${redirect}`;
  };

  const openBillingPortal = async () => {
    try {
      const origin = window.location.origin;
      const returnUrl = `${origin}/${locale}?anchor=deploy`;
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ returnUrl }),
      });
      const data = (await response.json()) as { url?: string };
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Unable to open billing portal.");
    } catch {
      setError("Unable to open billing portal.");
    }
  };

  const handleDeploy = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const validation = validateDeployFormInput({ tgToken, tgAllow });
    setFieldErrors(validation);
    if (validation.tgTokenError || validation.tgAllowError) {
      return;
    }

    setIsSubmitting(true);

    const deployData = buildDeployPayload({
      tgToken,
      tgAllow,
      seatPlanChoice,
      billingInterval,
      locale,
      subscriptionItemId: undefined,
      agentRuntime,
      modelPreset,
      promoCode,
      promoStatus,
    });
    const seatPlan = deployData.seat_plan;
    const billing = await actions.refreshBillingStatus({
      seatPlan,
      billingInterval,
    });
    if (!billing.authorized) {
      setIsSubmitting(false);
      redirectToSignIn();
      return;
    }

    const subscriptionItemId =
      billing.seatAvailability?.subscription_item_id ?? undefined;

    if (!billing.paymentReady) {
      // First-time user: save pending deploy data and redirect to Stripe Checkout
      const checkoutDeployData = {
        ...deployData,
        subscription_item_id: subscriptionItemId,
      };

      // Save for retrieval after checkout
      sessionStorage.setItem(
        PENDING_DEPLOY_KEY,
        JSON.stringify(checkoutDeployData),
      );

      // Redirect to Stripe Checkout
      try {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            seat_plan: checkoutDeployData.seat_plan,
            locale,
            promo_code: checkoutDeployData.promo_code,
            billing_interval: billingInterval,
            attribution: buildCheckoutAttributionPayload({
              locale,
              checkoutContext: "subscription_checkout",
              entryPoint: "deployment_widget",
            }),
          }),
        });
        const data = (await response.json()) as {
          checkoutUrl?: string;
          error?: string;
        };
        if (response.ok && data.checkoutUrl) {
          trackGoogleEvent("begin_checkout", {
            seat_plan: checkoutDeployData.seat_plan,
            billing_interval: billingInterval,
            promo_code_applied: checkoutDeployData.promo_code ? "yes" : "no",
            entry_point: "deployment_widget",
          });
          trackGoogleAdsConversion({
            sendTo:
              process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_BEGIN_CHECKOUT ??
              "",
            extraParams: {
              event_category: "billing",
              event_label: "begin_checkout",
              seat_plan: checkoutDeployData.seat_plan,
              billing_interval: billingInterval,
            },
            eventCallback: () => {
              window.location.href = data.checkoutUrl!;
            },
          });
          return;
        }
        setError(data.error || "Failed to create checkout session.");
      } catch {
        setError("Failed to create checkout session.");
      }
      setIsSubmitting(false);
      return;
    }

    // Check existing deployments
    const needsNewSeat = billing.needsNewSeat ?? true;
    if (hasDeployments && needsNewSeat) {
      setPendingDeployData({
        ...deployData,
        subscription_item_id: subscriptionItemId,
      });
      setShowConfirmModal(true);
      setIsSubmitting(false);
      return;
    }

    const success = await actions.executeDeploy({
      ...deployData,
      subscription_item_id: subscriptionItemId,
    });
    if (success) setShowStatusModal(true);
  };

  const executePendingDeploy = async () => {
    if (!pendingDeployData) return;
    setIsSubmitting(true);
    const success = await actions.executeDeploy(pendingDeployData);
    if (success) setShowStatusModal(true);
    setShowConfirmModal(false);
  };

  return (
    <section
      id="deploy"
      className="section-shell surface-stack scroll-mt-28 overflow-x-clip border-t border-[#e8ded4] py-24 dark:border-zinc-800"
    >
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="text-center"
        >
          <motion.div variants={fadeUp}>
            <p className="text-xs uppercase tracking-[0.3em] text-[#a55b3a] dark:text-zinc-400">
              {ts("widget.badge")}
            </p>
            <h2 className="mt-4 font-[var(--font-display)] text-3xl text-[#171512] sm:text-4xl dark:text-zinc-100">
              {ts("widget.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[#4e4741] dark:text-zinc-400">
              {ts("widget.description")}
            </p>
            {/* Trust signals */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {(["noServerKnowledge", "platformAi", "multiAgent"] as const).map(
                (key) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    <span className="text-emerald-500">✓</span>
                    {ts(`widget.trustSignals.${key}`)}
                  </span>
                ),
              )}
            </div>
          </motion.div>
        </motion.div>

        <div
          className="mt-12 space-y-8"
          onFocusCapture={() => {
            if (!wizardTracked) {
              setWizardTracked(true);
              trackUmami("Setup Wizard Started", {
                step_count: 2,
                locale,
              });
            }
          }}
        >
          <motion.div
            variants={fadeUp}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="min-w-0"
          >
            <DeploymentForm
              description={deployFormDescription}
              tgToken={tgToken}
              setTgToken={(value) => {
                setTgToken(value);
                if (fieldErrors.tgTokenError) {
                  setFieldErrors((current) => ({
                    ...current,
                    tgTokenError: null,
                  }));
                }
              }}
              tgAllow={tgAllow}
              setTgAllow={(value) => {
                setTgAllow(value);
                if (fieldErrors.tgAllowError) {
                  setFieldErrors((current) => ({
                    ...current,
                    tgAllowError: null,
                  }));
                }
              }}
              modelPreset={modelPreset}
              setModelPreset={setModelPreset}
              seatPlanChoice={seatPlanChoice}
              setSeatPlanChoice={setSeatPlanChoice}
              agentRuntime={agentRuntime}
              setAgentRuntime={setAgentRuntime}
              billingInterval={billingInterval}
              setBillingInterval={setBillingInterval}
              onOpenHelp={setHelpOpen}
              onSubmit={handleDeploy}
              isSubmitting={isSubmitting}
              canSubmit={canSubmit && !managedPresetUnavailable}
              billingStatus={billingStatus}
              notice={notice}
              error={formError}
              tgTokenError={fieldErrors.tgTokenError}
              tgAllowError={fieldErrors.tgAllowError}
              hasDeployments={hasDeployments}
              promoCode={promoCode}
              setPromoCode={(val) => {
                setPromoCode(val);
                if (promoStatus !== "idle") {
                  setPromoStatus("idle");
                  setPromoMessage(null);
                  setDiscount(null);
                }
              }}
              promoStatus={promoStatus}
              promoMessage={promoMessage}
              discount={discount}
              validatePromoCode={validatePromoCode}
              modelOptions={modelOptions}
              defaultManagedModelPreset={defaultManagedModelPreset}
            />
          </motion.div>

          <AnimatePresence mode="popLayout">
            {sid && (
              <motion.div
                key="status-card"
                initial={{ opacity: 0, scale: 0.95, height: 0 }}
                animate={{ opacity: 1, scale: 1, height: "auto" }}
                exit={{ opacity: 0, scale: 0.95, height: 0 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                style={{ overflow: "hidden" }}
                className="min-w-0"
              >
                <DeploymentStatusCard
                  sid={sid}
                  status={status}
                  seatStatus={seatStatus}
                  graceUntil={graceUntil}
                  error={error}
                  progress={progress}
                  server={state.server}
                  telegramUsername={telegramUsername}
                  locale={locale}
                  onOpenBilling={openBillingPortal}
                  onOpenDetail={() => setShowStatusModal(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            variants={fadeUp}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="min-w-0"
          >
            <DeploymentSecurityCard />
          </motion.div>
        </div>
      </div>

      <DeploymentHelpModals
        openMode={helpOpen}
        onClose={() => setHelpOpen(null)}
      />

      <DeployConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executePendingDeploy}
        isSubmitting={isSubmitting}
        billingInterval={billingInterval}
        monthlyPriceUsd={seatPlanPricing.monthly}
        yearlyPriceUsd={seatPlanPricing.yearly}
      />

      <DeployStatusModal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        status={status}
        sid={sid}
        server={state.server}
        error={error}
        progress={progress}
        telegramUsername={telegramUsername}
      />
    </section>
  );
}
