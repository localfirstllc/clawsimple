import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toUserFriendlyDeployError } from "@/lib/deploy/error-message";
import {
  getDeploymentProgress,
  type DeploymentServerInfo,
} from "@/lib/deploy/progress";
import {
  trackGoogleAdsConversion,
  trackGoogleEvent,
} from "@/lib/analytics/google-ads";
import { clearAuthHint } from "@/lib/auth/hint";

export type DeployModelPreset = string;
export type DeploySeatPlanChoice = "standard" | "max";
export type DeployAgentRuntime = "hermes" | "openclaw";

export type DeployResponse = {
  sid: string;
  status: string;
  seat_action?: "reused" | "incremented";
  server?: DeploymentServerInfo;
  status_url?: string;
  payment_status?: string | null;
  grace_until?: string | null;
  billing_portal_url?: string | null;
  payment_error?: string | null;
};

export type DeployStatusResponse = {
  sid?: string | null;
  status: string;
  seat_status?: string | null;
  grace_until?: string | null;
  error_code?: string | null;
  telegram_username?: string | null;
  server?: DeploymentServerInfo;
};

export interface BillingStatus {
  authorized: boolean;
  paymentReady?: boolean;
  needsNewSeat?: boolean;
  [key: string]: unknown;
}

export type BillingStatusResponse = {
  active: boolean;
  payment_ready?: boolean;
  seat_availability?: {
    seat_plan: string;
    billing_interval: "month" | "year";
    price_id: string;
    seat_capacity: number;
    active_deployments: number;
    needs_new_seat: boolean;
    subscription_id: string | null;
    subscription_item_id: string | null;
  } | null;
  subscription?: {
    id: string;
    plan: string;
    status: string;
    periodEnd?: string | null;
  } | null;
};

interface UseDeploymentProps {
  locale: string;
}

function isPublicDeploySeatPlanChoice(
  value: unknown,
): value is DeploySeatPlanChoice {
  return value === "standard" || value === "max";
}

const DRAFT_STORAGE_KEY = "moltbot.deploy.draft";

// Deployment UI state should not persist across browser restarts by default.
// Use sessionStorage + TTL to reduce stale/privileged info leaks on shared machines.
const DEPLOY_CACHE_SID_KEY = "moltbot.deploy.cache.sid";
const DEPLOY_CACHE_STATUS_KEY = "moltbot.deploy.cache.status";
const DEPLOY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type DeploymentStatusCache = {
  sid: string;
  status: string;
  cachedAt: number;
};

function readDeploymentStatusCache(): DeploymentStatusCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DEPLOY_CACHE_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Partial<DeploymentStatusCache>;
    if (typeof obj.sid !== "string" || obj.sid.trim().length === 0) return null;
    if (typeof obj.status !== "string" || obj.status.trim().length === 0)
      return null;
    if (typeof obj.cachedAt !== "number" || !Number.isFinite(obj.cachedAt))
      return null;
    if (Date.now() - obj.cachedAt > DEPLOY_CACHE_TTL_MS) return null;
    return { sid: obj.sid, status: obj.status, cachedAt: obj.cachedAt };
  } catch {
    return null;
  }
}

function writeDeploymentStatusCache(payload: DeploymentStatusCache) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      DEPLOY_CACHE_STATUS_KEY,
      JSON.stringify(payload),
    );
    window.sessionStorage.setItem(DEPLOY_CACHE_SID_KEY, payload.sid);
  } catch {
    // ignore
  }
}

function clearDeploymentCache() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DEPLOY_CACHE_SID_KEY);
    window.sessionStorage.removeItem(DEPLOY_CACHE_STATUS_KEY);
    // Back-compat cleanup (older versions used localStorage).
    window.localStorage.removeItem("moltbot.deploy.sid");
    window.localStorage.removeItem("moltbot.deploy.status");
  } catch {
    // ignore
  }
}

function getDeployPollDelayMs(statusValue: string) {
  // Only poll frequently while a deployment is actively progressing.
  // Terminal states rely on focus/visibility refresh to reduce backend load.
  if (statusValue === "created" || statusValue === "started") return 10000;
  return null;
}

export function useDeployment({ locale }: UseDeploymentProps) {
  const trackedCompletedSidRef = useRef<string | null>(null);

  // Form State
  const [tgToken, setTgToken] = useState("");
  const [tgAllow, setTgAllow] = useState("");
  const [modelPreset, setModelPreset] = useState<DeployModelPreset>("gpt");
  const [seatPlanChoice, setSeatPlanChoice] =
    useState<DeploySeatPlanChoice>("standard");
  const [agentRuntime, setAgentRuntime] =
    useState<DeployAgentRuntime>("hermes");

  const [billingInterval, setBillingInterval] = useState<"month" | "year">(
    "year",
  );

  // Deployment State
  const [sid, setSid] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [server, setServer] = useState<DeployResponse["server"] | null>(null);
  const [seatStatus, setSeatStatus] = useState<string | null>(null);
  const [graceUntil, setGraceUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingStatus, setBillingStatus] =
    useState<BillingStatusResponse | null>(null);
  const [hasDeployments, setHasDeployments] = useState(false);

  // Load drafts (once on mount).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (storedDraft) {
      try {
        const parsed = JSON.parse(storedDraft);
        const normalizedSeatPlanChoice: Extract<
          DeploySeatPlanChoice,
          "standard" | "max"
        > =
          parsed.seatPlanChoice === "max" || parsed.aiMode === "max"
            ? "max"
            : "standard";
        setTgToken(parsed.tgToken ?? "");
        setTgAllow(parsed.tgAllow ?? "");

        // Public homepage only exposes managed plans. Ignore legacy draft state.
        if (
          typeof parsed.modelPreset === "string" &&
          parsed.modelPreset.trim() &&
          parsed.modelPreset !== "custom"
        ) {
          setModelPreset(parsed.modelPreset);
        }

        setSeatPlanChoice(normalizedSeatPlanChoice);
        if (
          parsed.agentRuntime === "openclaw" ||
          parsed.agentRuntime === "hermes"
        ) {
          setAgentRuntime(parsed.agentRuntime);
        }
      } catch {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }

    const params = new URLSearchParams(window.location.search);
    const requestedSeatPlan = params.get("seat_plan");
    const requestedInterval = params.get("billing_interval");
    if (requestedSeatPlan === "seat-max") {
      setSeatPlanChoice("max");
    } else if (requestedSeatPlan === "seat-standard") {
      setSeatPlanChoice("standard");
    }
    if (requestedInterval === "month" || requestedInterval === "year") {
      setBillingInterval(requestedInterval);
    }
  }, []);

  // Deployment status cache. Restore is handled in bootstrap(), called only
  // after we know the user has a session, to avoid triggering /api/deploy/{sid}
  // polls for anonymous visitors.

  // Save drafts
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({
      tgToken,
      tgAllow,
      modelPreset,
      seatPlanChoice,
      agentRuntime,
    });
    window.localStorage.setItem(DRAFT_STORAGE_KEY, payload);
  }, [tgToken, tgAllow, modelPreset, seatPlanChoice, agentRuntime]);

  // Cache minimal status in-session to reduce refresh flicker
  // (avoid persisting server/error/graceUntil).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sid) return;
    if (typeof status !== "string" || status.trim().length === 0) return;
    writeDeploymentStatusCache({ sid, status, cachedAt: Date.now() });
  }, [sid, status]);

  const canSubmit = useMemo(() => {
    if (!tgToken.trim() || !tgAllow.trim()) return false;
    if (!isPublicDeploySeatPlanChoice(seatPlanChoice)) {
      return false;
    }
    return true;
  }, [tgToken, tgAllow, seatPlanChoice]);

  const refreshBillingStatus = useCallback(
    async (options?: {
      seatPlan?: string;
      billingInterval?: "month" | "year";
    }) => {
      try {
        const params = new URLSearchParams();
        if (options?.seatPlan) {
          params.set("seat_plan", options.seatPlan);
          params.set("billing_interval", options.billingInterval ?? "month");
        }
        const endpoint =
          params.size > 0
            ? `/api/billing/status?${params.toString()}`
            : "/api/billing/status";
        const response = await fetch(endpoint, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (response.status === 401) {
          clearAuthHint();
          setBillingStatus(null);
          return {
            authorized: false,
            paymentReady: false,
            needsNewSeat: undefined,
            seatAvailability: null,
          };
        }
        const data = (await response.json()) as BillingStatusResponse;
        setBillingStatus(data);
        return {
          authorized: true,
          paymentReady: Boolean(data.payment_ready),
          needsNewSeat: data.seat_availability?.needs_new_seat,
          seatAvailability: data.seat_availability ?? null,
        };
      } catch {
        return {
          authorized: true,
          paymentReady: false,
          needsNewSeat: undefined,
          seatAvailability: null,
        };
      }
    },
    [],
  );

  const resetDeploymentState = useCallback(() => {
    setSid(null);
    setStatus("idle");
    setServer(null);
    setSeatStatus(null);
    setGraceUntil(null);
    setError(null);
    setNotice(null);
    setProgress(0);
    setTelegramUsername(null);
    clearDeploymentCache();
  }, []);

  const checkDeployments = useCallback(async () => {
    try {
      const res = await fetch("/api/deploy/list");
      if (res.status === 401) {
        clearAuthHint();
        setHasDeployments(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setHasDeployments(
          Array.isArray(data.deployments) && data.deployments.length > 0,
        );
      }
    } catch {
      // quiet fail
    }
  }, []);

  // Bootstrap: called from DeploymentWidget once we know the user has a session
  // (e.g., after login redirect, Stripe return with action=complete-deploy, etc.).
  const bootstrap = useCallback(() => {
    // Restore cached SID/status (minimal shape + TTL) from sessionStorage.
    // Done here, not on mount, so anonymous visitors never trigger /api/deploy/{sid} polls.
    if (typeof window !== "undefined" && !sid) {
      const cached = readDeploymentStatusCache();
      if (cached) {
        setSid(cached.sid);
        setStatus(cached.status);
      }
    }

    checkDeployments();

    const loadLatest = async () => {
      try {
        const response = await fetch("/api/deploy/latest", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (response.status === 401) {
          clearAuthHint();
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as DeployStatusResponse;
        if (!data.sid || data.status === "idle") {
          resetDeploymentState();
          return;
        }
        if (data.status === "removed" || data.seat_status === "removed") {
          resetDeploymentState();
          return;
        }
        setSid(data.sid);
        setStatus(data.status);
        setServer(data.server ?? null);
        setSeatStatus(data.seat_status ?? null);
        setGraceUntil(data.grace_until ?? null);
        setTelegramUsername(data.telegram_username ?? null);
        if (data.status === "failed") {
          const friendlyError = toUserFriendlyDeployError(data.error_code);
          if (friendlyError) {
            setError(friendlyError);
          } else {
            setError("Deployment failed.");
          }
        } else {
          setError(null);
        }
      } catch {
        // Ignore failures
      }
    };

    loadLatest();
    refreshBillingStatus();
  }, [sid, checkDeployments, refreshBillingStatus, resetDeploymentState]);

  useEffect(() => {
    if (!sid) return;
    let cancelled = false;
    let timer: number | null = null;
    let inFlight: AbortController | null = null;

    const scheduleNext = (delayMs: number | null) => {
      if (cancelled) return;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (delayMs === null) return;
      // Small jitter to avoid stampedes when many clients deploy at the same time.
      const jitter = Math.floor(Math.random() * 500);
      timer = window.setTimeout(() => {
        void fetchOnce();
      }, delayMs + jitter);
    };

    const fetchOnce = async () => {
      try {
        if (cancelled) return;
        inFlight?.abort();
        inFlight = new AbortController();

        const response = await fetch(`/api/deploy/${sid}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: inFlight.signal,
        });
        if (response.status === 401) {
          clearAuthHint();
          // Session likely expired; polling would otherwise silently stall on "starting".
          if (typeof window !== "undefined") {
            const redirect = encodeURIComponent(`/${locale}?anchor=deploy`);
            window.location.href = `/${locale}/signin?redirect=${redirect}`;
          }
          return;
        }
        if (response.status === 404) {
          setSid(null);
          setStatus("idle");
          clearDeploymentCache();
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as DeployStatusResponse;
        if (cancelled) return;
        if (data.status === "removed" || data.seat_status === "removed") {
          resetDeploymentState();
          return;
        }
        setStatus(data.status);
        setServer(data.server ?? null);
        setSeatStatus(data.seat_status ?? null);
        setGraceUntil(data.grace_until ?? null);
        setTelegramUsername(data.telegram_username ?? null);
        if (data.status === "failed") {
          const friendlyError = toUserFriendlyDeployError(data.error_code);
          setError(friendlyError ?? "Deployment failed.");
        } else {
          setError(null);
        }

        // Keep polling only while deployment is in progress.
        scheduleNext(getDeployPollDelayMs(data.status));
      } catch {
        if (!cancelled) {
          setError("Failed to fetch deployment status.");
          // Back off a bit on transient errors.
          scheduleNext(15000);
        }
      }
    };

    // Fast-refresh on tab focus/visibility to avoid "stuck on Starting" when timers are
    // throttled in background tabs.
    const onFocus = () => {
      void fetchOnce();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchOnce();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    // Kick once immediately when SID is present.
    void fetchOnce();

    return () => {
      cancelled = true;
      inFlight?.abort();
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [sid, locale, resetDeploymentState]);

  useEffect(() => {
    setProgress(getDeploymentProgress({ sid, status, server }));
  }, [sid, status, server]);

  useEffect(() => {
    if (
      !sid ||
      status !== "completed" ||
      trackedCompletedSidRef.current === sid
    )
      return;

    trackedCompletedSidRef.current = sid;
    trackGoogleAdsConversion({
      sendTo:
        process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_DEPLOY_COMPLETED ?? "",
      transactionId: sid,
      extraParams: {
        event_category: "deployment",
        event_label: "deploy_completed",
        deployment_sid: sid,
      },
    });
    trackGoogleEvent("deploy_completed", {
      deployment_sid: sid,
      deployment_status: status,
    });
  }, [sid, status]);

  const executeDeploy = useCallback(
    async (deployData: {
      tg_token: string;
      tg_allow: string;
      model_preset?: DeployModelPreset | string;
      seat_plan: string;
      locale: string;
      promo_code?: string;
      billing_interval: "month" | "year";
      subscription_item_id?: string;
      target_runtime?: DeployAgentRuntime;
    }) => {
      try {
        if (deployData.promo_code) {
          // Optional: Quick client-side check or just pass it
        }
        const response = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(deployData),
        });

        const data = (await response.json()) as DeployResponse & {
          error?: string;
        };

        if (!response.ok) {
          setIsSubmitting(false);
          if (response.status === 401) {
            clearAuthHint();
            window.location.href = `/${locale}/signin?redirect=${encodeURIComponent(`/${locale}?anchor=deploy`)}`;
            return;
          }
          if (response.status === 402) {
            if (data.billing_portal_url) {
              window.location.href = data.billing_portal_url;
              return;
            }
            // Fallback to manual portal open if no URL returned
            return;
          }
          setError(
            toUserFriendlyDeployError(data.error) ?? "Deployment failed.",
          );
          return;
        }

        setProgress(0);
        setSid(data.sid);
        setStatus(data.status || "started");
        setServer(data.server ?? null);
        setSeatStatus(data.payment_status ?? null);
        setGraceUntil(data.grace_until ?? null);
        trackGoogleAdsConversion({
          sendTo:
            process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_DEPLOY_STARTED ?? "",
          transactionId: data.sid,
          extraParams: {
            event_category: "deployment",
            event_label: "deploy_started",
            deployment_sid: data.sid,
            seat_plan: deployData.seat_plan,
            billing_interval: deployData.billing_interval,
          },
        });
        trackGoogleEvent("deploy_started", {
          deployment_sid: data.sid,
          deployment_status: data.status || "started",
          seat_plan: deployData.seat_plan,
          billing_interval: deployData.billing_interval,
        });
        // Clear sensitive input after a successful deploy so the form becomes
        // non-submittable until the user re-enters it (prevents confusion and reduces key exposure).
        setTgToken("");
        if (data.payment_status === "pending") {
          setNotice("Payment pending. Please complete payment within 1 hour.");
        }
        if (data.payment_error) {
          setNotice(`Payment pending: ${data.payment_error}`);
        }
        return true; // Success signal
      } catch (err) {
        setError(
          toUserFriendlyDeployError(
            err instanceof Error ? err.message : null,
          ) ?? (err instanceof Error ? err.message : "Deployment failed."),
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [locale],
  );

  const setters = useMemo(() => {
    return {
      setTgToken,
      setTgAllow,
      setModelPreset,
      setSeatPlanChoice,
      setAgentRuntime,
      setBillingInterval,
      setSid,
      setError,
      setNotice,
      setIsSubmitting,
    };
  }, []);

  const actions = useMemo(() => {
    return {
      refreshBillingStatus,
      executeDeploy,
      resetDeploymentState,
      bootstrap,
    };
  }, [refreshBillingStatus, executeDeploy, resetDeploymentState, bootstrap]);

  return {
    state: {
      tgToken,
      tgAllow,
      modelPreset,
      seatPlanChoice,
      agentRuntime,
      billingInterval,
      sid,
      status,
      server,
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
    },
    setters,
    actions,
  };
}
